import { get, post, del } from "../api.js";
import { navigate } from "../router.js";
import { fmtDate, fmtMonthShort, todayIso } from "../dates.js";
import { drawChart } from "../charts.js";
import { html, render, pageHead, inr, label, statusChip, amountCell, emptyState, errorBox, confirmDialog, toast, bind, raw } from "../ui.js";
import { paymentDialog, actualAmountDialog, reverseDialog, forecastCard } from "./shared.js";

export async function page(ctx) {
  const { root, params, user, signal } = ctx;
  const id = params.id, today = todayIso(user.timezone);
  let forecastHtml = "", anomalyNote = "";

  async function draw() {
    const [bill, cycles, payments] = await Promise.all([get(`/api/bills/${id}`, null, signal), get(`/api/bills/${id}/history`, null, signal), get(`/api/bills/${id}/payments`, null, signal)]);
    const cycleById = new Map(cycles.map((c) => [c.id, c]));
    const confirmed = cycles.filter((c) => c.amountConfirmed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    render(root, html`${pageHead(bill.name, `${label(bill.category)}${bill.provider ? " · " + bill.provider : ""}`,
      html`<button class="btn" data-action="forecast">Forecast next bill</button><a class="btn" href="#/bills/${bill.id}/edit">Edit</a><button class="btn danger" data-action="delete">Delete</button>`.toString())}
      ${bill.active ? "" : html`<div class="alert warn" style="margin-bottom:1rem">This bill is inactive. No new cycles are created.</div>`}
      <div class="grid cols-2">
        <section class="card" aria-labelledby="det-h"><h2 id="det-h">Details</h2><dl class="kv">
          <dt>Repeats</dt><dd>${label(bill.frequency)}${bill.frequency === "CUSTOM" ? ` (every ${bill.customIntervalValue} ${bill.customIntervalUnit.toLowerCase()})` : ""}${bill.monthEndAnchored ? ", last day of month" : ""}</dd>
          <dt>Expected amount</dt><dd>${amountCell(bill.expectedAmount, "CONFIRMED")} ${bill.variable ? html`<span class="muted small">(changes each time)</span>` : ""}</dd>
          <dt>First due date</dt><dd>${fmtDate(bill.anchorDate)}</dd>${bill.endDate ? html`<dt>Ends</dt><dd>${fmtDate(bill.endDate)}</dd>` : ""}
          <dt>Reminders</dt><dd>${bill.reminderDays ? bill.reminderDays.join(", ") + " days before" : "Your default"}</dd>${bill.notes ? html`<dt>Notes</dt><dd>${bill.notes}</dd>` : ""}</dl></section>
        <section class="card" aria-labelledby="hist-h"><h2 id="hist-h">Confirmed amounts</h2>
          ${confirmed.length >= 2 ? html`<div class="chart-box short"><canvas id="amounts" role="img" aria-label="Confirmed bill amounts by due date"></canvas></div>` : html`<p class="muted">${confirmed.length === 0 ? "No confirmed amounts yet. Enter the actual amount on a bill to start the history." : "Add one more confirmed amount to see the trend."}</p>`}</section>
      </div>
      <div id="forecast" style="margin-top:1rem" aria-live="polite">${raw(forecastHtml)}${anomalyNote ? html`<div class="alert info" style="margin-top:.5rem">${anomalyNote}</div>` : ""}</div>
      <section class="card flush" style="margin-top:1rem" aria-labelledby="cyc-h"><div style="padding:1rem 1rem 0"><h2 id="cyc-h">Billing history</h2></div>
        ${cycles.length === 0 ? emptyState({ title: "No billing cycles yet", text: "Cycles appear once the first due date is within the next few months." }) : html`<div class="table-wrap"><table class="table"><caption class="sr-only">Billing cycles for ${bill.name}</caption>
          <thead><tr><th scope="col">Due</th><th scope="col">Status</th><th scope="col" class="right">Bill amount</th><th scope="col" class="right">Paid</th><th scope="col" class="right">Outstanding</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${cycles.map((c) => html`<tr><td>${fmtDate(c.dueDate)}<div class="muted small">${fmtDate(c.periodStart, false)} – ${fmtDate(c.periodEnd, false)}</div></td>
            <td>${statusChip(c.status, c.partiallyPaid)}</td><td class="right">${amountCell(c.amountPayable, c.amountConfirmed ? "CONFIRMED" : "EXPECTED")}</td>
            <td class="right num">${inr(c.paidAmount)}</td><td class="right num">${inr(c.outstandingAmount)}</td>
            <td class="right"><div class="row" style="justify-content:flex-end">
              ${c.status !== "WAIVED" && Number(c.outstandingAmount) > 0 ? html`<button class="btn small primary" data-action="pay" data-id="${c.id}">Record payment</button>` : ""}
              <button class="btn small" data-action="actual" data-id="${c.id}">${c.amountConfirmed ? "Edit amount" : "Enter actual amount"}</button>
              ${c.amountConfirmed ? html`<button class="btn small" data-action="anomaly" data-id="${c.id}">Check if unusual</button>` : ""}</div></td></tr>`)}</tbody></table></div>`}</section>
      <section class="card flush" style="margin-top:1rem" aria-labelledby="pay-h"><div style="padding:1rem 1rem 0"><h2 id="pay-h">Payments</h2></div>
        ${payments.length === 0 ? emptyState({ title: "No payments recorded", text: "When you pay this bill, record it here so SmartBill can track what's left." }) : html`<ul class="list">${payments.map((p) => { const c = cycleById.get(p.billingCycleId); return html`<li><div><strong class="num ${p.reversed ? "" : ""}" ${p.reversed ? raw('style="text-decoration:line-through"') : ""}>${inr(p.amount)}</strong> <span class="muted small">on ${fmtDate(p.paidOn)} · ${label(p.method)}${p.transactionRef ? " · " + p.transactionRef : ""}${c ? " · due " + fmtDate(c.dueDate) : ""}</span>
          ${p.reversed ? html`<div class="small"><span class="chip muted">Reversed</span> ${p.reversalReason}</div>` : ""}</div>
          ${p.reversed ? "" : html`<button class="btn small" data-action="reverse" data-id="${p.id}">Reverse</button>`}</li>`; })}</ul>`}</section>`);

    if (confirmed.length >= 2) drawChart(root.querySelector("#amounts"), { type: "bar", data: { labels: confirmed.map((c) => fmtMonthShort(c.dueDate.slice(0, 7))),
      datasets: [{ label: "Confirmed amount (₹)", data: confirmed.map((c) => Number(c.amountPayable)), backgroundColor: "#2b3fa3" }] }, options: { plugins: { legend: { display: false } } } });
    ctx.data = { bill, cycleById, payments };
  }

  bind(root, {
    pay: (el) => paymentDialog({ cycle: ctx.data.cycleById.get(Number(el.dataset.id)), user, onSaved: draw }),
    actual: (el) => actualAmountDialog({ cycle: ctx.data.cycleById.get(Number(el.dataset.id)), onSaved: draw }),
    reverse: (el) => reverseDialog({ payment: ctx.data.payments.find((p) => p.id === Number(el.dataset.id)), onSaved: draw }),
    forecast: async (el) => {
      el.disabled = true; anomalyNote = "";
      try { forecastHtml = forecastCard(await post("/api/predictions/run", { billId: Number(id) })).toString(); }
      catch (e) { forecastHtml = `<div class="alert error" role="alert"><div class="grow">${html`${e.message}`}</div></div>`; }
      finally { await draw(); }
    },
    anomaly: async (el) => {
      el.disabled = true;
      try { const r = await post("/api/predictions/anomaly-check", { cycleId: Number(el.dataset.id) }); anomalyNote = r.explanation; forecastHtml = ""; }
      catch (e) { anomalyNote = e.message; }
      finally { await draw(); }
    },
    delete: async () => {
      const ok = await confirmDialog({ title: `Delete ${ctx.data.bill.name}?`, message: "This removes the bill and its billing history. Bills with recorded payments can't be deleted: reverse those payments or mark the bill inactive by editing it.", confirmLabel: "Delete bill", danger: true });
      if (!ok) return;
      try { await del(`/api/bills/${id}`, { confirm: true }); toast("Bill deleted", "success"); navigate("/bills"); } catch (e) { toast(e.message, "error"); }
    },
    retry: () => draw(),
  });
  await draw();
}
