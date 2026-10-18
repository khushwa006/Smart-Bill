import { get } from "../api.js";
import { addDays, addMonths, fmtDate, fmtMonth, monthGrid, monthStart, monthEnd, startOfWeek, todayIso, weekdayShort, parseIso, dayOfWeek } from "../dates.js";
import { html, render, pageHead, field, inr, inrShort, label, legend, emptyState, skeleton, errorBox, bind, icon, infoDialog, statusChip, amountCell, BILL_CATEGORIES, SUB_CATEGORIES, raw } from "../ui.js";
import { pillClass, itemLink } from "./dashboard.js";

const KIND_WORD = { CONFIRMED: "Confirmed", EXPECTED: "Expected", PREDICTED: "Predicted", SCHEDULED: "Scheduled renewal" };
const ALL_CATEGORIES = [...new Set([...BILL_CATEGORIES, ...SUB_CATEGORIES])];

export function rangeFor(view, cursor) {
  if (view === "week") { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 6) }; }
  const grid = monthGrid(cursor); return { from: grid[0].date, to: grid[41].date };
}
export function stepCursor(view, cursor, dir) { return view === "week" ? addDays(cursor, 7 * dir) : addMonths(monthStart(cursor), dir); }

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const today = todayIso(user.timezone);
  const s = { view: "month", cursor: today, type: "", category: "", status: "" };
  let items = [];

  const pill = (it) => html`<a class="pill ${it.status === "PAST" ? "past" : pillClass(it)}" href="${itemLink(it)}" title="${it.title}: ${inr(it.amount)} (${(KIND_WORD[it.amountKind] || "").toLowerCase()}), ${it.status.toLowerCase().replace("_", " ")}"
    aria-label="${it.title}, ${inr(it.amount)}, ${KIND_WORD[it.amountKind]}, ${it.status.toLowerCase().replace("_", " ")}">${it.title} ${inrShort(it.amount)}</a>`;
  const byDate = () => { const m = new Map(); items.forEach((it) => (m.get(it.date) || m.set(it.date, []).get(it.date)).push(it)); return m; };

  function titleText() {
    if (s.view === "week") { const r = rangeFor("week", s.cursor); return `${fmtDate(r.from, false)} – ${fmtDate(r.to)}`; }
    return fmtMonth(s.cursor);
  }
  function body() {
    const map = byDate();
    if (s.view === "list") {
      const sorted = [...items].filter((i) => i.date.startsWith(s.cursor.slice(0, 7)));
      return sorted.length === 0 ? html`<div class="card">${emptyState({ title: "Nothing due this month", text: "Bills and subscription renewals for this month appear here." })}</div>`
        : html`<div class="card flush"><ul class="list">${sorted.map((it) => html`<li><div><a class="rowlink" href="${itemLink(it)}"><strong>${it.title}</strong></a><div class="muted small">${fmtDate(it.date)} · ${label(it.category)} · ${it.type === "BILL" ? "Bill" : "Subscription renewal"}</div></div>
          <div class="row">${amountCell(it.amount, it.amountKind)}${it.type === "BILL" ? statusChip(it.status) : html`<span class="chip ${it.status === "PAST" ? "muted" : "info"}">${it.status === "PAST" ? "Past" : "Renewal"}</span>`}</div></li>`)}</ul></div>`;
    }
    const days = s.view === "week" ? Array.from({ length: 7 }, (_, i) => ({ date: addDays(startOfWeek(s.cursor), i), inMonth: true })) : monthGrid(s.cursor);
    return html`<div class="cal" role="grid" aria-label="${titleText()}">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<div class="dow" role="columnheader">${weekdayShort(i)}</div>`)}
      ${days.map((d) => { const list = map.get(d.date) || []; const max = s.view === "week" ? 20 : 3; const p = parseIso(d.date);
        return html`<div class="cell ${d.inMonth ? "" : "out"} ${d.date === today ? "today" : ""}" role="gridcell" ${s.view === "week" ? raw('style="min-height:12rem"') : ""}><span class="n" ${d.date === today ? raw('aria-current="date"') : ""}>${p.d}</span>
          ${list.slice(0, max).map(pill)}${list.length > max ? html`<button class="btn small ghost" data-action="more" data-date="${d.date}">+${list.length - max} more</button>` : ""}</div>`; })}</div>`;
  }

  render(root, html`${pageHead("Calendar", "Bills and subscription renewals in one place.")}
    <div class="row between" style="margin-bottom:1rem">
      <div class="row"><button class="btn icon-btn" style="border-color:var(--line-strong)" data-action="prev" aria-label="Previous ${s.view === "week" ? "week" : "month"}">${icon("left")}</button>
        <h2 id="cal-title" aria-live="polite" style="min-width:11rem;text-align:center"></h2>
        <button class="btn icon-btn" style="border-color:var(--line-strong)" data-action="next" aria-label="Next ${s.view === "week" ? "week" : "month"}">${icon("right")}</button>
        <button class="btn small" data-action="today">Today</button></div>
      <div class="segmented" role="group" aria-label="Calendar view"><button data-action="view" data-view="month" aria-pressed="true">Month</button><button data-action="view" data-view="week" aria-pressed="false">Week</button><button data-action="view" data-view="list" aria-pressed="false">List</button></div></div>
    <form class="toolbar" id="filters" aria-label="Calendar filters">
      ${field({ plain: true, id: "type", label: "Show", options: [["", "Bills and subscriptions"], ["BILL", "Bills only"], ["SUBSCRIPTION", "Subscriptions only"]] })}
      ${field({ plain: true, id: "category", label: "Category", options: [["", "All categories"], ...ALL_CATEGORIES.map((c) => [c, label(c)])] })}
      ${field({ plain: true, id: "status", label: "Status", options: [["", "Any status"], ["UPCOMING", "Upcoming"], ["DUE_SOON", "Due soon"], ["DUE_TODAY", "Due today"], ["OVERDUE", "Overdue"], ["PAID", "Paid"]] })}</form>
    <div style="margin-bottom:.75rem">${legend()}</div><div id="cal-body" aria-live="polite"></div>`);
  const bodyEl = root.querySelector("#cal-body");

  async function load() {
    root.querySelector("#cal-title").textContent = titleText();
    root.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === s.view)));
    root.querySelector('[data-action="prev"]').setAttribute("aria-label", `Previous ${s.view === "week" ? "week" : "month"}`);
    root.querySelector('[data-action="next"]').setAttribute("aria-label", `Next ${s.view === "week" ? "week" : "month"}`);
    render(bodyEl, skeleton(5));
    try {
      const r = rangeFor(s.view === "list" ? "month" : s.view, s.cursor);
      items = await get("/api/calendar", { from: r.from, to: r.to, type: s.type, category: s.category, status: s.status }, signal);
      render(bodyEl, body());
    } catch (e) { if (e.name === "AbortError") return; render(bodyEl, errorBox(e)); }
  }
  const form = root.querySelector("#filters");
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("change", (e) => { s[e.target.name] = e.target.value; load(); });
  bind(root, {
    prev: () => { s.cursor = stepCursor(s.view, s.cursor, -1); load(); }, next: () => { s.cursor = stepCursor(s.view, s.cursor, 1); load(); },
    today: () => { s.cursor = today; load(); }, view: (el) => { s.view = el.dataset.view; load(); }, retry: () => load(),
    more: (el) => infoDialog({ title: fmtDate(el.dataset.date), body: html`<ul class="list">${(byDate().get(el.dataset.date) || []).map((it) => html`<li><a class="rowlink" href="${itemLink(it)}">${it.title}</a><span>${amountCell(it.amount, it.amountKind)}</span></li>`)}</ul>` }),
  });
  await load();
}
