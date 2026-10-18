import { get, post, put } from "../api.js";
import { navigate } from "../router.js";
import { todayIso } from "../dates.js";
import { html, render, field, pageHead, label, toast, formValues, clearErrors, showErrors, setBusy, setFieldError, validate, required, money, isoDate, SUB_CATEGORIES, FREQUENCIES, parseReminderDays } from "../ui.js";

export async function page(ctx) {
  const { root, params, user, signal } = ctx;
  const editing = !!params.id;
  const s = editing ? await get(`/api/subscriptions/${params.id}`, null, signal) : { category: "OTT_STREAMING", frequency: "MONTHLY", startDate: todayIso(user.timezone) };
  render(root, html`${pageHead(editing ? `Edit ${s.serviceName}` : "Add subscription", "Costs shown elsewhere are estimates based on the price you enter here.")}
    <form class="card form" id="sub-form" novalidate style="max-width:46rem">
      <div class="two">${field({ id: "serviceName", label: "Service name", required: true, value: s.serviceName ?? "", attrs: 'maxlength="120"' })}
        ${field({ id: "category", label: "Category", required: true, value: s.category, options: SUB_CATEGORIES.map((c) => [c, label(c)]) })}</div>
      ${field({ id: "provider", label: "Provider", value: s.provider ?? "" })}
      <div class="two">${field({ id: "amount", label: "Price each time (₹)", required: true, value: s.amount ?? "", attrs: 'inputmode="decimal"' })}
        ${field({ id: "frequency", label: "Billed", required: true, value: s.frequency, options: FREQUENCIES.map((f) => [f, label(f)]) })}</div>
      <div class="two" id="custom-row" ${s.frequency === "CUSTOM" ? "" : "hidden"}>${field({ id: "customIntervalValue", label: "Repeat every", value: s.customIntervalValue ?? "", required: true, attrs: 'inputmode="numeric"' })}
        ${field({ id: "customIntervalUnit", label: "Unit", value: s.customIntervalUnit ?? "DAYS", required: true, options: [["DAYS", "Days"], ["WEEKS", "Weeks"], ["MONTHS", "Months"]] })}</div>
      <div class="two">${field({ id: "startDate", label: "Started on", type: "date", required: true, value: s.startDate ?? "", help: "Renewal dates are worked out from this date." })}
        ${field({ id: "nextRenewalDate", label: "Next renewal", type: "date", value: s.nextRenewalDate ?? "", help: "Leave empty to calculate it." })}</div>
      <div class="two">${field({ id: "trialEndDate", label: "Free trial ends", type: "date", value: s.trialEndDate ?? "" })}${field({ id: "endDate", label: "Ends on", type: "date", value: s.endDate ?? "" })}</div>
      ${field({ id: "reminderDays", label: "Remind me (days before renewal)", value: (s.reminderDays || []).join(", "), help: "For example 7, 1. Leave empty to use your default." })}
      ${field({ id: "notes", label: "Notes", textarea: true, value: s.notes ?? "" })}
      <div class="alert error" role="alert" data-form-error hidden></div>
      <div class="row"><button class="btn primary" type="submit">${editing ? "Save changes" : "Add subscription"}</button><a class="btn" href="${editing ? `#/subscriptions/${s.id}` : "#/subscriptions"}">Cancel</a></div></form>`);
  const form = root.querySelector("#sub-form");
  form.addEventListener("change", () => { form.querySelector("#custom-row").hidden = form.querySelector("#frequency").value !== "CUSTOM"; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErrors(form);
    const v = formValues(form); let reminders = null;
    const errs = validate(v, {
      serviceName: required("Enter the service name"), amount: (x) => required("Enter the price")(x) || money()(x),
      startDate: (x) => required("Choose the start date")(x) || isoDate()(x), nextRenewalDate: isoDate(), trialEndDate: isoDate(),
      endDate: (x, all) => isoDate()(x) || (x && all.startDate && x < all.startDate ? "This is before the start date" : ""),
      customIntervalValue: (x, all) => (all.frequency === "CUSTOM" ? (/^[1-9]\d{0,3}$/.test(x) && Number(x) <= 3650 ? "" : "Enter a whole number from 1 to 3650") : ""),
      reminderDays: (x) => { try { reminders = parseReminderDays(x); return ""; } catch (err) { return err.message; } },
    });
    if (Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => setFieldError(form, k, m)); form.querySelector('[aria-invalid="true"]').focus(); return; }
    const custom = v.frequency === "CUSTOM";
    const body = { serviceName: v.serviceName, category: v.category, provider: v.provider || null, amount: v.amount, frequency: v.frequency,
      customIntervalValue: custom ? Number(v.customIntervalValue) : null, customIntervalUnit: custom ? v.customIntervalUnit : null, startDate: v.startDate,
      nextRenewalDate: v.nextRenewalDate || null, endDate: v.endDate || null, trialEndDate: v.trialEndDate || null, reminderDays: reminders, notes: v.notes || null };
    const btn = form.querySelector('button[type="submit"]'); setBusy(btn, true);
    try { const saved = editing ? await put(`/api/subscriptions/${params.id}`, body) : await post("/api/subscriptions", body); toast(editing ? "Subscription saved" : "Subscription added", "success"); navigate(`/subscriptions/${saved.id}`); }
    catch (err) { showErrors(form, err); } finally { setBusy(btn, false); }
  });
}
