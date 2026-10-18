import { get } from "../api.js";
import { fmtMonthShort } from "../dates.js";
import { drawChart, PALETTE } from "../charts.js";
import { html, render, pageHead, field, inr, label, emptyState, skeleton, errorBox, bind, raw } from "../ui.js";

export async function page(ctx) {
  const { root, signal } = ctx;
  const s = { months: "12", billId: "", cancel: new Set() };
  const [summary, bills] = await Promise.all([get("/api/analytics/summary", null, signal), get("/api/bills", null, signal)]);
  const rec = summary.recurringMonthlyEstimate;
  render(root, html`${pageHead("Analytics", "What you've paid, what's confirmed, and what's only an estimate.")}
    <div class="grid cols-4">
      <div class="card metric"><span class="label">Paid, last 30 days</span><span class="value num">${inr(summary.paidLast30Days)}</span><span class="hint">Actual payments</span></div>
      <div class="card metric ${summary.overdue.count ? "is-bad" : ""}"><span class="label">Overdue</span><span class="value num">${inr(summary.overdue.amount)}</span><span class="hint">${summary.overdue.count} unpaid after due date</span></div>
      <div class="card metric"><span class="label">Due in 30 days</span><span class="value num">${inr(summary.dueNext30Days.confirmed)}</span><span class="hint">Confirmed${Number(summary.dueNext30Days.expected) > 0 ? html` · plus <span class="amt unconfirmed">${inr(summary.dueNext30Days.expected)}</span> expected` : ""}</span></div>
      <div class="card metric dashed"><span class="label">Predicted, next 30 days</span><span class="value num">${inr(summary.predictedNext30Days)}</span><span class="hint">Forecast only</span></div>
      <div class="card metric dashed"><span class="label">Monthly commitments</span><span class="value num">${inr(rec.total)}</span><span class="hint">Estimate · bills ${inr(rec.bills)}, subscriptions ${inr(rec.subscriptions)}</span></div>
      <div class="card metric dashed"><span class="label">Yearly commitments</span><span class="value num">${inr(summary.recurringAnnualEstimate.total)}</span><span class="hint">Estimate · 12 × monthly</span></div>
      <div class="card metric"><span class="label">Subscription renewals, 30 days</span><span class="value num">${inr(summary.renewalsNext30Days.amount)}</span><span class="hint">${summary.renewalsNext30Days.count} at current prices</span></div>
      <div class="card metric"><span class="label">Unusual bills, 90 days</span><span class="value num">${summary.anomaliesLast90Days}</span><span class="hint"><a href="#/insights">See details</a></span></div></div>
    <section class="card" style="margin-top:1rem" aria-labelledby="t-h"><div class="row between"><h2 id="t-h">Payments and bills by month</h2>
      <form class="toolbar" id="trend-filters" style="margin:0" aria-label="Trend filters">${field({ plain: true, id: "months", label: "Period", value: "12", options: [["6", "Last 6 months"], ["12", "Last 12 months"], ["24", "Last 24 months"]] })}
        ${field({ plain: true, id: "billId", label: "Bill", options: [["", "All bills"], ...bills.map((b) => [b.id, b.name])] })}</form></div>
      <div id="trends" aria-live="polite"></div></section>
    <section class="card" style="margin-top:1rem" aria-labelledby="sub-h"><h2 id="sub-h">Subscriptions</h2><div id="subs" aria-live="polite"></div></section>`);
  const trendsEl = root.querySelector("#trends"), subsEl = root.querySelector("#subs");

  async function loadTrends() {
    render(trendsEl, skeleton(2));
    try {
      const t = await get("/api/analytics/trends", { months: s.months, billId: s.billId }, signal);
      const rows = t.months;
      if (rows.every((r) => Number(r.paid) === 0 && r.billedActual == null)) return render(trendsEl, emptyState({ title: "Nothing to chart yet", text: "Record payments and enter actual bill amounts to see trends." }));
      render(trendsEl, html`<div class="chart-box"><canvas id="trend" role="img" aria-label="Monthly amounts paid and confirmed bill amounts"></canvas></div>
        <details style="margin-top:.5rem"><summary>Show data as a table</summary><div class="table-wrap"><table class="table"><caption class="sr-only">Paid and confirmed bill amounts by month</caption><thead><tr><th scope="col">Month</th><th scope="col" class="right">Paid</th><th scope="col" class="right">Confirmed bills</th><th scope="col" class="right">Change vs previous</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td>${fmtMonthShort(r.month)}</td><td class="right num">${inr(r.paid)}</td><td class="right num">${r.billedActual == null ? "—" : inr(r.billedActual)}</td><td class="right num">${r.billedChangePct == null ? "—" : `${r.billedChangePct > 0 ? "+" : ""}${r.billedChangePct}%`}</td></tr>`)}</tbody></table></div></details>
        <p class="muted small" style="margin-top:.5rem">${t.note}</p>`);
      drawChart(trendsEl.querySelector("#trend"), { data: { labels: rows.map((r) => fmtMonthShort(r.month)), datasets: [
        { type: "bar", label: "Paid (₹)", data: rows.map((r) => Number(r.paid)), backgroundColor: PALETTE[0] },
        { type: "line", label: "Confirmed bills (₹)", data: rows.map((r) => (r.billedActual == null ? null : Number(r.billedActual))), borderColor: PALETTE[1], backgroundColor: PALETTE[1], spanGaps: false }] } });
    } catch (e) { if (e.name === "AbortError") return; render(trendsEl, errorBox(e)); }
  }
  async function loadSubs() {
    render(subsEl, skeleton(2));
    try {
      const d = await get("/api/analytics/subscriptions", { cancel: [...s.cancel] }, signal);
      if (!d.byCategory.length) return render(subsEl, emptyState({ title: "No active subscriptions", text: "Add subscriptions to see costs by category and possible overlaps.", action: '<a class="btn primary" href="#/subscriptions/new">Add a subscription</a>' }));
      const all = await get("/api/subscriptions", { state: "ACTIVE" }, signal);
      render(subsEl, html`<div class="grid cols-2"><div><div class="chart-box short"><canvas id="cats" role="img" aria-label="Estimated monthly subscription cost by category"></canvas></div></div>
        <div><h3>By category (estimates)</h3><table class="table"><caption class="sr-only">Estimated subscription cost by category</caption><thead><tr><th scope="col">Category</th><th scope="col" class="right">Count</th><th scope="col" class="right">Per month</th><th scope="col" class="right">Per year</th></tr></thead>
          <tbody>${d.byCategory.map((c) => html`<tr><td>${label(c.category)}</td><td class="right num">${c.count}</td><td class="right num">${inr(c.monthlyEstimate)}</td><td class="right num">${inr(c.annualEstimate)}</td></tr>`)}</tbody></table></div></div>
        ${d.possibleOverlaps.length ? html`<div class="alert warn" style="margin-top:1rem"><div class="grow"><strong>Possible overlaps</strong><ul style="margin:.25rem 0 0 1rem">${d.possibleOverlaps.map((o) => html`<li>${label(o.category)}: ${o.services.join(", ")} (about ${inr(o.monthlyEstimate)} a month)</li>`)}</ul></div></div>` : ""}
        <fieldset style="margin-top:1rem;border:1px solid var(--line);border-radius:10px;padding:1rem"><legend><strong>What if I cancelled…</strong></legend>
          <div class="grid cols-2">${all.map((x) => html`<label class="check"><input type="checkbox" data-action="toggle" data-id="${x.id}" ${s.cancel.has(x.id) ? raw("checked") : ""}> <span>${x.serviceName} <span class="muted small">(about ${inr(x.estimatedMonthlyCost)}/month)</span></span></label>`)}</div>
          <p style="margin-top:.75rem" class="amt-wrap">${s.cancel.size === 0 ? html`<span class="muted">Select subscriptions to estimate the savings.</span>` : html`Estimated saving: <strong class="amt unconfirmed num">${inr(d.estimatedSavings.monthly)}</strong> a month, <strong class="amt unconfirmed num">${inr(d.estimatedSavings.annual)}</strong> a year. <span class="muted small">${d.estimatedSavings.note}</span>`}</p></fieldset>`);
      drawChart(subsEl.querySelector("#cats"), { type: "doughnut", data: { labels: d.byCategory.map((c) => label(c.category)), datasets: [{ data: d.byCategory.map((c) => Number(c.monthlyEstimate)), backgroundColor: PALETTE }] } });
    } catch (e) { if (e.name === "AbortError") return; render(subsEl, errorBox(e)); }
  }
  root.querySelector("#trend-filters").addEventListener("submit", (e) => e.preventDefault());
  root.querySelector("#trend-filters").addEventListener("change", (e) => { s[e.target.name] = e.target.value; loadTrends(); });
  root.addEventListener("change", (e) => { const t = e.target.closest('[data-action="toggle"]'); if (!t) return; const id = Number(t.dataset.id); t.checked ? s.cancel.add(id) : s.cancel.delete(id); loadSubs(); });
  bind(root, { retry: () => { loadTrends(); loadSubs(); } });
  await Promise.all([loadTrends(), loadSubs()]);
}
