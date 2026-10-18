import { get, patch } from "../api.js";
import { fmtDate, todayIso, diffDays } from "../dates.js";
import { html, render, pageHead, field, inr, label, emptyState, skeleton, errorBox, bind, debounce, toast, formDialog, SUB_CATEGORIES, raw } from "../ui.js";

export async function stateDialog(sub, target, onSaved) {
  const cancel = target === "CANCELLED";
  return formDialog({
    title: cancel ? `Cancel ${sub.serviceName} in SmartBill?` : target === "PAUSED" ? `Pause ${sub.serviceName}?` : `Resume ${sub.serviceName}?`,
    submitLabel: cancel ? "Mark as cancelled" : target === "PAUSED" ? "Pause" : "Resume", danger: cancel,
    intro: cancel ? "This only updates SmartBill. It does not contact the provider, so you still need to cancel with them to stop being charged. A cancelled subscription can't be reactivated; add a new one instead."
      : target === "PAUSED" ? "Paused subscriptions stop appearing in the calendar, reminders and cost estimates until you resume them." : "Renewal reminders and cost estimates start again.",
    body: field({ id: "note", label: "Note", plain: false, textarea: true }),
    onSubmit: async (v) => { await patch(`/api/subscriptions/${sub.id}/state`, { state: target, note: v.note || null }); toast(cancel ? "Marked as cancelled" : target === "PAUSED" ? "Paused" : "Resumed", "success"); await onSaved(); },
  });
}

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const today = todayIso(user.timezone);
  const f = { state: "", category: "", provider: "", renewsBefore: "" };
  let subs = [];
  render(root, html`${pageHead("Subscriptions", "Recurring services and when they renew.", '<a class="btn primary" href="#/subscriptions/new">Add subscription</a>')}
    <div id="summary" class="grid cols-3" style="margin-bottom:1rem"></div>
    <form class="toolbar" id="filters" role="search" aria-label="Filter subscriptions">
      ${field({ plain: true, id: "state", label: "Status", options: [["", "All"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["CANCELLED", "Cancelled"], ["EXPIRED", "Expired"]] })}
      ${field({ plain: true, id: "category", label: "Category", options: [["", "All categories"], ...SUB_CATEGORIES.map((c) => [c, label(c)])] })}
      ${field({ plain: true, id: "provider", label: "Provider", type: "search", attrs: 'placeholder="Search provider"' })}
      ${field({ plain: true, id: "renewsBefore", label: "Renews on or before", type: "date" })}</form>
    <div id="list" aria-live="polite"></div>`);
  const list = root.querySelector("#list"), summary = root.querySelector("#summary");

  async function load() {
    render(list, skeleton(3));
    try {
      subs = await get("/api/subscriptions", { state: f.state, category: f.category, provider: f.provider, renewsBefore: f.renewsBefore }, signal);
      const active = subs.filter((s) => s.state === "ACTIVE");
      const monthly = active.reduce((t, s) => t + Number(s.estimatedMonthlyCost), 0);
      render(summary, html`<div class="card metric dashed"><span class="label">Estimated monthly cost</span><span class="value num">${inr(monthly)}</span><span class="hint">Active subscriptions in this view, at current prices</span></div>
        <div class="card metric dashed"><span class="label">Estimated yearly cost</span><span class="value num">${inr(monthly * 12)}</span><span class="hint">A projection, not money already spent</span></div>
        <div class="card metric"><span class="label">Active</span><span class="value num">${active.length}</span><span class="hint">${subs.length - active.length} paused, cancelled or expired</span></div>`);
      if (!subs.length) return render(list, html`<div class="card">${f.state || f.category || f.provider || f.renewsBefore ? emptyState({ title: "No subscriptions match", text: "Clear a filter to see more." })
        : emptyState({ title: "No subscriptions yet", text: "Add streaming, music, cloud storage, gym and learning subscriptions to see what they cost you each year and get renewal reminders.", action: '<a class="btn primary" href="#/subscriptions/new">Add a subscription</a>' })}</div>`);
      render(list, html`<div class="card flush"><div class="table-wrap"><table class="table"><caption class="sr-only">Your subscriptions</caption>
        <thead><tr><th scope="col">Service</th><th scope="col">Category</th><th scope="col" class="right">Price</th><th scope="col" class="right">About / month</th><th scope="col">Next renewal</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${subs.map((s) => html`<tr><td><a class="rowlink" href="#/subscriptions/${s.id}">${s.serviceName}</a>${s.provider ? html`<div class="muted small">${s.provider}</div>` : ""}
          ${s.state === "ACTIVE" ? "" : html` <span class="chip ${s.state === "PAUSED" ? "warn" : "muted"}">${label(s.state)}</span>`}${s.trialEndDate && s.trialEndDate >= today ? html` <span class="chip info">Trial ends ${fmtDate(s.trialEndDate, false)}</span>` : ""}</td>
          <td>${label(s.category)}</td><td class="right num">${inr(s.amount)}<div class="muted small">${label(s.frequency).toLowerCase()}</div></td>
          <td class="right"><span class="amt num unconfirmed">${inr(s.estimatedMonthlyCost)}</span><span class="amt-kind">Estimate</span></td>
          <td>${s.state === "ACTIVE" && s.nextRenewalDate ? html`${fmtDate(s.nextRenewalDate)}<div class="muted small">${diffDays(s.nextRenewalDate, today) <= 0 ? (diffDays(s.nextRenewalDate, today) === 0 ? "today" : "overdue") : `in ${diffDays(s.nextRenewalDate, today)} days`}</div>` : html`<span class="muted">—</span>`}</td>
          <td class="right"><div class="row" style="justify-content:flex-end"><a class="btn small" href="#/subscriptions/${s.id}/edit">Edit</a>
            ${s.state === "ACTIVE" ? html`<button class="btn small" data-action="pause" data-id="${s.id}">Pause</button>` : ""}${s.state === "PAUSED" ? html`<button class="btn small" data-action="resume" data-id="${s.id}">Resume</button>` : ""}
            ${s.state === "ACTIVE" || s.state === "PAUSED" ? html`<button class="btn small" data-action="cancel" data-id="${s.id}">Cancel</button>` : ""}</div></td></tr>`)}</tbody></table></div></div>`);
    } catch (e) { if (e.name === "AbortError") return; render(list, errorBox(e)); }
  }
  const find = (el) => subs.find((s) => s.id === Number(el.dataset.id));
  const form = root.querySelector("#filters");
  form.addEventListener("submit", (e) => e.preventDefault());
  const reload = debounce(load, 200);
  form.addEventListener("input", (e) => { if (e.target.name in f) { f[e.target.name] = e.target.value.trim(); reload(); } });
  bind(root, { pause: (el) => stateDialog(find(el), "PAUSED", load), resume: (el) => stateDialog(find(el), "ACTIVE", load), cancel: (el) => stateDialog(find(el), "CANCELLED", load), retry: () => load() });
  await load();
}
