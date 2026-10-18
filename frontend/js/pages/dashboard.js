import { get } from "../api.js";
import { addDays, diffDays, fmtDate, todayIso, weekdayShort, dayOfWeek, parseIso } from "../dates.js";
import { html, render, inr, inrShort, pageHead, legend, emptyState, label, raw, bind, amountCell, statusChip } from "../ui.js";

export const pillClass = (it) => (it.amountKind !== "CONFIRMED" && it.type === "BILL" && it.status !== "OVERDUE" ? "dashed" : it.status === "PAID" ? "ok" : it.status === "OVERDUE" ? "bad" : it.status === "DUE_TODAY" || it.status === "DUE_SOON" ? "warn" : "");
export const itemLink = (it) => (it.type === "BILL" ? `#/bills/${it.refId}` : `#/subscriptions/${it.id}`);

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const today = todayIso(user.timezone), end = addDays(today, 13);
  const [summary, items, bills] = await Promise.all([
    get("/api/analytics/summary", null, signal), get("/api/calendar", { from: today, to: end }, signal), get("/api/bills", null, signal)]);
  const byDay = new Map();
  items.forEach((it) => { (byDay.get(it.date) || byDay.set(it.date, []).get(it.date)).push(it); });
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const unpaid = items.filter((it) => (it.type === "BILL" ? it.status !== "PAID" && it.status !== "WAIVED" : it.status !== "PAST"));
  const due7 = summary.dueNext7Days, overdue = summary.overdue, rec = summary.recurringMonthlyEstimate;
  const nothing = bills.length === 0 && items.length === 0;

  render(root, html`${pageHead("Today", `Here's what needs your attention, ${user.fullName.split(" ")[0]}.`,
    html`<a class="btn primary" href="#/bills/new">Add bill</a><a class="btn" href="#/subscriptions/new">Add subscription</a>`.toString())}
    ${overdue.count > 0 ? html`<div class="alert error" role="alert" style="margin-bottom:1rem"><div class="grow"><strong>${inr(overdue.amount)} overdue</strong> across ${overdue.count} bill${overdue.count === 1 ? "" : "s"}. <a href="#/payments">Record a payment</a></div></div>` : ""}
    ${nothing ? html`<div class="card">${emptyState({ title: "Add your first bill", text: "Add a bill or subscription and SmartBill will show what's due and when, and estimate what comes next.", action: '<a class="btn primary" href="#/bills/new">Add a bill</a>' })}</div>` : html`
    <section aria-labelledby="ribbon-h" class="stack">
      <div class="row between"><h2 id="ribbon-h">Next 14 days</h2>${legend()}</div>
      <div class="ribbon" role="list">${days.map((d) => { const list = byDay.get(d) || []; const wd = weekdayShort(dayOfWeek(d)), n = parseIso(d).d;
        return html`<div class="day ${d === today ? "today" : ""}" role="listitem"><span class="d">${d === today ? "Today" : `${wd} ${n}`}</span>
          ${list.length === 0 ? html`<span class="muted small">Nothing due</span>` : list.map((it) => html`<a class="pill ${pillClass(it)}" href="${itemLink(it)}" title="${it.title}: ${inr(it.amount)} (${it.amountKind.toLowerCase()})">${it.title} ${inrShort(it.amount)}</a>`)}</div>`; })}</div>
    </section>`}
    <div class="grid cols-3" style="margin-top:1rem">
      <div class="card metric"><span class="label">Due in the next 7 days</span><span class="value num">${inr(due7.confirmed)}</span>
        <span class="hint">${due7.count} bill${due7.count === 1 ? "" : "s"}${Number(due7.expected) > 0 ? html` · plus <span class="amt unconfirmed">${inr(due7.expected)}</span> expected, not yet confirmed` : ""}</span></div>
      <div class="card metric ${overdue.count ? "is-bad" : ""}"><span class="label">Overdue</span><span class="value num">${inr(overdue.amount)}</span><span class="hint">${overdue.count ? `${overdue.count} unpaid after the due date` : "Nothing overdue"}</span></div>
      <div class="card metric"><span class="label">Paid in the last 30 days</span><span class="value num">${inr(summary.paidLast30Days)}</span><span class="hint">Actual payments you recorded</span></div>
      <div class="card metric dashed"><span class="label">Predicted bills, next 30 days</span><span class="value num">${inr(summary.predictedNext30Days)}</span><span class="hint">A forecast, not a bill. <a href="#/insights">See forecasts</a></span></div>
      <div class="card metric dashed"><span class="label">Monthly commitments (estimate)</span><span class="value num">${inr(rec.total)}</span><span class="hint">Bills ${inr(rec.bills)} + subscriptions ${inr(rec.subscriptions)}</span></div>
      <div class="card metric"><span class="label">Subscription renewals, next 30 days</span><span class="value num">${inr(summary.renewalsNext30Days.amount)}</span><span class="hint">${summary.renewalsNext30Days.count} renewal${summary.renewalsNext30Days.count === 1 ? "" : "s"} at current prices</span></div>
    </div>
    ${unpaid.length ? html`<section class="card flush" style="margin-top:1rem" aria-labelledby="up-h"><div style="padding:1rem 1rem 0"><h2 id="up-h">Coming up</h2></div>
      <ul class="list">${unpaid.slice(0, 8).map((it) => html`<li><div><a class="rowlink" href="${itemLink(it)}"><strong>${it.title}</strong></a><div class="muted small">${label(it.category)} · ${fmtDate(it.date)} (${diffDays(it.date, today) === 0 ? "today" : diffDays(it.date, today) < 0 ? `${-diffDays(it.date, today)} days ago` : `in ${diffDays(it.date, today)} days`})</div></div>
        <div class="row">${amountCell(it.type === "BILL" && it.outstanding != null && it.amountKind === "CONFIRMED" ? it.outstanding : it.amount, it.amountKind)} ${it.type === "BILL" ? statusChip(it.status) : html`<span class="chip info">Renewal</span>`}</div></li>`)}</ul></section>` : ""}`);
  bind(root, {});
}
