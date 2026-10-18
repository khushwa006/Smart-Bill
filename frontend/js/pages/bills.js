import { get } from "../api.js";
import { addDays, fmtDate, todayIso } from "../dates.js";
import { html, render, pageHead, field, inr, label, emptyState, skeleton, errorBox, statusChip, amountCell, BILL_CATEGORIES, bind, debounce, raw } from "../ui.js";

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const today = todayIso(user.timezone);
  const f = { q: "", category: "", active: "", sort: "name", dir: "asc" };
  render(root, html`${pageHead("Bills", "Everything you pay on a schedule.", '<a class="btn primary" href="#/bills/new">Add bill</a>')}
    <form class="toolbar" role="search" aria-label="Filter bills" id="filters">
      ${field({ plain: true, id: "q", label: "Search", type: "search", attrs: 'placeholder="Name or provider"' })}
      ${field({ plain: true, id: "category", label: "Category", options: [["", "All categories"], ...BILL_CATEGORIES.map((c) => [c, label(c)])] })}
      ${field({ plain: true, id: "active", label: "Status", options: [["", "All"], ["true", "Active"], ["false", "Inactive"]] })}
      ${field({ plain: true, id: "sort", label: "Sort by", options: [["name", "Name"], ["expectedAmount", "Expected amount"], ["anchorDate", "First due date"], ["category", "Category"]] })}
      ${field({ plain: true, id: "dir", label: "Order", options: [["asc", "Ascending"], ["desc", "Descending"]] })}</form>
    <div id="list" aria-live="polite"></div>`);
  const list = root.querySelector("#list");

  async function load() {
    render(list, skeleton(4));
    try {
      const [bills, cycles] = await Promise.all([
        get("/api/bills", { q: f.q, category: f.category, active: f.active, sort: f.sort, dir: f.dir }, signal),
        get("/api/cycles", { from: addDays(today, -180), to: addDays(today, 180) }, signal)]);
      const next = new Map();
      cycles.filter((c) => c.status !== "PAID" && c.status !== "WAIVED").forEach((c) => { const cur = next.get(c.billId); if (!cur || c.dueDate < cur.dueDate) next.set(c.billId, c); });
      if (!bills.length) {
        const filtered = f.q || f.category || f.active;
        return render(list, html`<div class="card">${filtered ? emptyState({ title: "No bills match", text: "Try a different search or clear the filters." })
          : emptyState({ title: "No bills yet", text: "Add electricity, water, internet, rent and anything else you pay regularly. SmartBill tracks due dates and payments.", action: '<a class="btn primary" href="#/bills/new">Add your first bill</a>' })}</div>`);
      }
      render(list, html`<div class="card flush"><div class="table-wrap"><table class="table"><caption class="sr-only">Your bills</caption>
        <thead><tr><th scope="col">Bill</th><th scope="col">Category</th><th scope="col">Repeats</th><th scope="col" class="right">Expected</th><th scope="col">Next due</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${bills.map((b) => { const n = next.get(b.id); return html`<tr>
          <td><a class="rowlink" href="#/bills/${b.id}">${b.name}</a>${b.provider ? html`<div class="muted small">${b.provider}</div>` : ""}${b.active ? "" : html` <span class="chip muted">Inactive</span>`}</td>
          <td>${label(b.category)}</td><td>${label(b.frequency)}</td>
          <td class="right">${amountCell(b.expectedAmount, "CONFIRMED")}${b.variable ? html`<span class="amt-kind">Varies each month</span>` : ""}</td>
          <td>${n ? html`${fmtDate(n.dueDate)}<div>${statusChip(n.status, n.partiallyPaid)}</div>` : html`<span class="muted">None scheduled</span>`}</td>
          <td class="right"><a class="btn small" href="#/bills/${b.id}">View</a> <a class="btn small" href="#/bills/${b.id}/edit">Edit</a></td></tr>`; })}</tbody></table></div></div>`);
    } catch (e) { if (e.name === "AbortError") return; render(list, errorBox(e)); }
  }
  const form = root.querySelector("#filters");
  form.addEventListener("submit", (e) => e.preventDefault());
  const reload = debounce(load, 200);
  form.addEventListener("input", (e) => { const t = e.target; if (t.name in f) { f[t.name] = t.value.trim(); reload(); } });
  bind(root, { retry: () => load() });
  await load();
}
