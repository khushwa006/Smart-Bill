import { get } from "../api.js";
import { fmtDate, todayIso } from "../dates.js";
import { html, render, pageHead, field, checkbox, inr, label, emptyState, skeleton, errorBox, bind, statusChip, amountCell, METHODS, debounce } from "../ui.js";
import { paymentDialog, reverseDialog } from "./shared.js";

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const f = { method: "", q: "", reversed: true };
  let payments = [], cycles = [], subs = [];
  render(root, html`${pageHead("Payments", "Everything you've paid, and what's still outstanding.")}
    <section class="card flush" aria-labelledby="out-h" style="margin-bottom:1rem"><div style="padding:1rem 1rem 0"><h2 id="out-h">Outstanding</h2></div><div id="outstanding"></div></section>
    <form class="toolbar" id="filters" role="search" aria-label="Filter payments">
      ${field({ plain: true, id: "q", label: "Search", type: "search", attrs: 'placeholder="Bill, reference or note"' })}
      ${field({ plain: true, id: "method", label: "Method", options: [["", "All methods"], ...METHODS.map((m) => [m, label(m)])] })}
      <div style="align-self:end">${checkbox({ id: "reversed", label: "Show reversed payments", checked: true })}</div></form>
    <div id="list" aria-live="polite"></div>`);
  const outEl = root.querySelector("#outstanding"), listEl = root.querySelector("#list");

  async function load() {
    render(listEl, skeleton(4)); render(outEl, skeleton(2));
    try {
      [payments, cycles, subs] = await Promise.all([get("/api/payments", null, signal), get("/api/cycles", null, signal), get("/api/subscriptions", null, signal)]);
      const due = cycles.filter((c) => Number(c.outstandingAmount) > 0 && c.status !== "WAIVED" && ["OVERDUE", "DUE_TODAY", "DUE_SOON"].includes(c.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      render(outEl, due.length === 0 ? html`<p class="muted" style="padding:0 1rem 1rem">Nothing is overdue or due soon.</p>` : html`<ul class="list">${due.map((c) => html`<li><div><a class="rowlink" href="#/bills/${c.billId}"><strong>${c.billName}</strong></a><div class="muted small">Due ${fmtDate(c.dueDate)}</div></div>
        <div class="row">${amountCell(c.outstandingAmount, c.amountConfirmed ? "CONFIRMED" : "EXPECTED")} ${statusChip(c.status, c.partiallyPaid)} <button class="btn small primary" data-action="pay" data-id="${c.id}">Record payment</button></div></li>`)}</ul>`);
      draw();
    } catch (e) { if (e.name === "AbortError") return; render(listEl, errorBox(e)); render(outEl, ""); }
  }
  function nameOf(p) {
    if (p.billingCycleId) { const c = cycles.find((x) => x.id === p.billingCycleId); return c ? { name: c.billName, href: `#/bills/${c.billId}`, due: c.dueDate } : { name: "Bill" }; }
    const s = subs.find((x) => x.id === p.subscriptionId); return s ? { name: s.serviceName, href: `#/subscriptions/${s.id}` } : { name: "Subscription" };
  }
  function draw() {
    const q = f.q.toLowerCase();
    const rows = payments.filter((p) => (f.reversed || !p.reversed) && (!f.method || p.method === f.method)
      && (!q || [nameOf(p).name, p.transactionRef, p.note].some((t) => (t || "").toLowerCase().includes(q))));
    if (!payments.length) return render(listEl, html`<div class="card">${emptyState({ title: "No payments recorded yet", text: "When you pay a bill, record it so SmartBill can show what's left to pay.", action: '<a class="btn primary" href="#/bills">Go to bills</a>' })}</div>`);
    if (!rows.length) return render(listEl, html`<div class="card">${emptyState({ title: "No payments match", text: "Try another search or method." })}</div>`);
    render(listEl, html`<div class="card flush"><div class="table-wrap"><table class="table"><caption class="sr-only">Payment history</caption>
      <thead><tr><th scope="col">Paid on</th><th scope="col">For</th><th scope="col">Method</th><th scope="col" class="right">Amount</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map((p) => { const n = nameOf(p); return html`<tr><td>${fmtDate(p.paidOn)}</td><td>${n.href ? html`<a class="rowlink" href="${n.href}">${n.name}</a>` : n.name}${n.due ? html`<div class="muted small">due ${fmtDate(n.due)}</div>` : ""}${p.transactionRef ? html`<div class="muted small">Ref ${p.transactionRef}</div>` : ""}</td>
        <td>${label(p.method)}</td><td class="right num">${p.reversed ? html`<s>${inr(p.amount)}</s><div><span class="chip muted">Reversed</span></div>` : inr(p.amount)}</td>
        <td class="right">${p.reversed ? html`<span class="muted small">${p.reversalReason}</span>` : html`<button class="btn small" data-action="reverse" data-id="${p.id}">Reverse</button>`}</td></tr>`; })}</tbody></table></div></div>`);
  }
  const form = root.querySelector("#filters");
  form.addEventListener("submit", (e) => e.preventDefault());
  const redraw = debounce(() => draw(), 150);
  form.addEventListener("input", (e) => { const t = e.target; if (t.name === "reversed") f.reversed = t.checked; else if (t.name in f) f[t.name] = t.value.trim(); if (payments.length) redraw(); });
  bind(root, {
    pay: (el) => paymentDialog({ cycle: cycles.find((c) => c.id === Number(el.dataset.id)), user, onSaved: load }),
    reverse: (el) => reverseDialog({ payment: payments.find((p) => p.id === Number(el.dataset.id)), onSaved: load }), retry: () => load(),
  });
  await load();
}
