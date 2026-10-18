import { get, del } from "../api.js";
import { navigate } from "../router.js";
import { fmtDate, todayIso } from "../dates.js";
import { html, render, pageHead, inr, label, amountCell, emptyState, confirmDialog, toast, bind } from "../ui.js";
import { stateDialog } from "./subscriptions.js";
import { paymentDialog } from "./shared.js";

const EVENT = { CREATED: "Added", PRICE_CHANGED: "Price changed", PAUSED: "Paused", RESUMED: "Resumed", CANCELLED: "Marked as cancelled", RENEWED: "Renewal date advanced", EXPIRED: "Expired", EDITED: "Edited" };

export async function page(ctx) {
  const { root, params, user, signal } = ctx;
  async function draw() {
    const [s, events] = await Promise.all([get(`/api/subscriptions/${params.id}`, null, signal), get(`/api/subscriptions/${params.id}/events`, null, signal)]);
    ctx.sub = s;
    const open = s.state === "ACTIVE" || s.state === "PAUSED";
    render(root, html`${pageHead(s.serviceName, `${label(s.category)}${s.provider ? " · " + s.provider : ""}`,
      html`${s.state === "ACTIVE" ? html`<button class="btn" data-action="paid">Record payment</button>` : ""}<a class="btn" href="#/subscriptions/${s.id}/edit">Edit</a>${open ? html`<button class="btn" data-action="${s.state === "ACTIVE" ? "pause" : "resume"}">${s.state === "ACTIVE" ? "Pause" : "Resume"}</button><button class="btn" data-action="cancel">Cancel</button>` : ""}<button class="btn danger" data-action="delete">Delete</button>`.toString())}
      ${s.state === "CANCELLED" ? html`<div class="alert info" style="margin-bottom:1rem">Marked as cancelled in SmartBill on ${fmtDate(s.cancelledAt.slice(0, 10))}. SmartBill doesn't contact providers, so make sure it's cancelled with ${s.provider || "the provider"} too.</div>` : ""}
      <div class="grid cols-2"><section class="card" aria-labelledby="d-h"><h2 id="d-h">Details</h2><dl class="kv">
        <dt>Status</dt><dd><span class="chip ${s.state === "ACTIVE" ? "ok" : s.state === "PAUSED" ? "warn" : "muted"}">${label(s.state)}</span></dd>
        <dt>Price</dt><dd>${amountCell(s.amount, "CONFIRMED")} ${label(s.frequency).toLowerCase()}</dd>
        <dt>About per month</dt><dd>${amountCell(s.estimatedMonthlyCost, "ESTIMATE")}</dd><dt>About per year</dt><dd>${amountCell(s.estimatedAnnualCost, "ESTIMATE")}</dd>
        <dt>Started</dt><dd>${fmtDate(s.startDate)}</dd>${s.state === "ACTIVE" && s.nextRenewalDate ? html`<dt>Next renewal</dt><dd>${fmtDate(s.nextRenewalDate)}</dd>` : ""}
        ${s.trialEndDate ? html`<dt>Trial ends</dt><dd>${fmtDate(s.trialEndDate)}</dd>` : ""}${s.endDate ? html`<dt>Ends</dt><dd>${fmtDate(s.endDate)}</dd>` : ""}
        <dt>Reminders</dt><dd>${s.reminderDays ? s.reminderDays.join(", ") + " days before" : "Your default"}</dd>${s.notes ? html`<dt>Notes</dt><dd>${s.notes}</dd>` : ""}</dl>
        <p class="muted small" style="margin-top:.75rem">Monthly and yearly figures are estimates from the current price, not money already spent.</p></section>
        <section class="card flush" aria-labelledby="e-h"><div style="padding:1rem 1rem 0"><h2 id="e-h">History</h2></div>${events.length === 0 ? emptyState({ title: "No history yet", text: "Changes to this subscription appear here." })
          : html`<ul class="list">${events.map((ev) => html`<li><div><strong>${EVENT[ev.type] || ev.type}</strong>${ev.oldAmount != null && ev.newAmount != null && ev.type === "PRICE_CHANGED" ? html` <span class="muted small num">${inr(ev.oldAmount)} → ${inr(ev.newAmount)}</span>` : ""}${ev.note ? html`<div class="muted small">${ev.note}</div>` : ""}</div><span class="muted small">${fmtDate(String(ev.occurredAt).slice(0, 10))}</span></li>`)}</ul>`}</section></div>`);
  }
  bind(root, {
    paid: () => paymentDialog({ subscription: ctx.sub, user, onSaved: draw }),
    pause: () => stateDialog(ctx.sub, "PAUSED", draw), resume: () => stateDialog(ctx.sub, "ACTIVE", draw), cancel: () => stateDialog(ctx.sub, "CANCELLED", draw),
    delete: async () => {
      if (!(await confirmDialog({ title: `Delete ${ctx.sub.serviceName}?`, message: "This removes it from SmartBill. If you've recorded payments for it, deletion is blocked; cancel it instead to keep the history.", confirmLabel: "Delete", danger: true }))) return;
      try { await del(`/api/subscriptions/${ctx.sub.id}`, { confirm: true }); toast("Subscription deleted", "success"); navigate("/subscriptions"); } catch (e) { toast(e.message, "error"); }
    },
    retry: () => draw(),
  });
  await draw();
}
