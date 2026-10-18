// Dialogs and fragments reused by several pages.
import { post, put } from "../api.js";
import { todayIso } from "../dates.js";
import { html, raw, field, formDialog, inr, label, toast, METHODS, validate, required, money, isoDate, setFieldError } from "../ui.js";

export const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Record a payment against a billing cycle (or a subscription). Resolves true when saved. */
export function paymentDialog({ cycle, subscription, user, onSaved }) {
  const key = newKey();                                  // one key per dialog: a double-click cannot create two payments
  const outstanding = cycle ? cycle.outstandingAmount : subscription.amount;
  const name = cycle ? cycle.billName : subscription.serviceName;
  return formDialog({
    title: `Record payment: ${name}`, submitLabel: "Save payment",
    intro: cycle ? `Outstanding: ${inr(cycle.outstandingAmount)}${cycle.amountConfirmed ? "" : " (expected amount, the real bill isn't recorded yet)"}. You can pay part of it.` : "",
    body: html`<div class="two">${field({ id: "amount", label: "Amount paid (₹)", required: true, value: Number(outstanding).toFixed(2), attrs: 'inputmode="decimal"' })}
        ${field({ id: "paidOn", label: "Paid on", type: "date", required: true, value: todayIso(user.timezone) })}</div>
      <div class="two">${field({ id: "method", label: "Payment method", options: METHODS.map((m) => [m, label(m)]), required: true })}
        ${field({ id: "transactionRef", label: "Transaction reference" })}</div>${field({ id: "note", label: "Note", textarea: true })}`,
    onSubmit: async (v, form) => {
      const errs = validate(v, { amount: (x) => required("Enter the amount")(x) || money()(x) || (Number(x) <= 0 ? "Amount must be more than zero" : ""), paidOn: (x) => required("Choose the payment date")(x) || isoDate()(x) });
      if (Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => setFieldError(form, k, m)); throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} }); }
      await post("/api/payments", { billingCycleId: cycle?.id ?? null, subscriptionId: subscription?.id ?? null, amount: v.amount, paidOn: v.paidOn,
        method: v.method, transactionRef: v.transactionRef || null, note: v.note || null, idempotencyKey: key });
      toast("Payment recorded", "success"); await onSaved?.();
    },
  });
}

/** Enter the real amount from the bill (turns an expected amount into a confirmed one). */
export function actualAmountDialog({ cycle, onSaved }) {
  return formDialog({
    title: `Actual amount: ${cycle.billName}`, submitLabel: "Save amount",
    intro: `Expected was ${inr(cycle.expectedAmount)}. Enter what the bill actually says. Predictions only learn from confirmed amounts.`,
    body: html`${field({ id: "actualAmount", label: "Actual bill amount (₹)", required: true, value: cycle.actualAmount ?? "", attrs: 'inputmode="decimal"' })}${field({ id: "issueDate", label: "Bill issue date", type: "date", value: cycle.issueDate ?? "" })}`,
    onSubmit: async (v, form) => {
      const e = required("Enter the amount")(v.actualAmount) || money()(v.actualAmount);
      if (e) { setFieldError(form, "actualAmount", e); throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} }); }
      await put(`/api/cycles/${cycle.id}`, { actualAmount: v.actualAmount, issueDate: v.issueDate || null });
      toast("Amount saved", "success"); await onSaved?.();
    },
  });
}

export function reverseDialog({ payment, onSaved }) {
  return formDialog({
    title: "Reverse this payment?", submitLabel: "Reverse payment", danger: true,
    intro: `${inr(payment.amount)} paid on ${payment.paidOn} will be marked reversed and the amount becomes outstanding again. The record stays in your history.`,
    body: field({ id: "reason", label: "Reason", required: true, help: "For example: entered the wrong amount" }),
    onSubmit: async (v, form) => {
      if (!v.reason) { setFieldError(form, "reason", "Tell us why you're reversing it"); throw Object.assign(new Error("Please fix the highlighted fields."), { fields: {} }); }
      await post(`/api/payments/${payment.id}/reverse`, { reason: v.reason });
      toast("Payment reversed", "success"); await onSaved?.();
    },
  });
}

const QUALITY = { INSUFFICIENT: "Very little data", LOW: "Limited data", MEDIUM: "Fair amount of data", HIGH: "Plenty of data" };
/** A forecast is ALWAYS drawn dashed and labelled "Predicted": it must never look like a confirmed bill. */
export function forecastCard(p) {
  if (p.forecastAmount == null) return html`<div class="card dashed"><h3>No forecast yet</h3><p>${p.explanation}</p></div>`;
  return html`<div class="card dashed" data-forecast><div class="row between"><h3>Predicted next bill</h3><span class="chip pred">${p.status === "PRELIMINARY" ? "Preliminary" : "Predicted"}</span></div>
    <p class="metric"><span class="value num">${inr(p.forecastAmount)}</span></p>
    <p class="small muted">For ${p.forecastPeriodStart} to ${p.forecastPeriodEnd} · ${p.observationsUsed} past bill${p.observationsUsed === 1 ? "" : "s"} used · ${QUALITY[p.dataQuality] || ""}</p>
    ${p.intervalLower != null ? html`<p class="small">Likely range: <strong class="num">${inr(p.intervalLower)} to ${inr(p.intervalUpper)}</strong></p>` : ""}
    <p style="margin-top:.5rem">${p.explanation}</p></div>`;
}
