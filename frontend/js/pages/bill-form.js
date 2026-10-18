import { get, post, put } from "../api.js";
import { navigate } from "../router.js";
import { html, render, field, checkbox, pageHead, label, toast, formValues, clearErrors, showErrors, setBusy, setFieldError, validate, required, money, isoDate,
  BILL_CATEGORIES, FREQUENCIES, parseReminderDays, errorBox } from "../ui.js";

export async function page(ctx) {
  const { root, params, signal } = ctx;
  const editing = !!params.id;
  const b = editing ? await get(`/api/bills/${params.id}`, null, signal) : { category: "ELECTRICITY", frequency: "MONTHLY", variable: false, monthEndAnchored: false };
  const monthBased = (freq, unit) => ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(freq) || (freq === "CUSTOM" && unit === "MONTHS");

  render(root, html`${pageHead(editing ? `Edit ${b.name}` : "Add bill", editing ? "Changes apply to future billing cycles. Past records stay as they are." : "Tell SmartBill what you pay and how often.")}
    <form class="card form" id="bill-form" novalidate style="max-width:46rem">
      <div class="two">${field({ id: "name", label: "Bill name", required: true, value: b.name ?? "", attrs: 'maxlength="120"' })}
        ${field({ id: "category", label: "Category", required: true, value: b.category, options: BILL_CATEGORIES.map((c) => [c, label(c)]) })}</div>
      ${field({ id: "provider", label: "Provider", value: b.provider ?? "", attrs: 'maxlength="120"' })}
      <div class="two">${field({ id: "expectedAmount", label: "Expected amount (₹)", required: true, value: b.expectedAmount ?? "", attrs: 'inputmode="decimal"', help: "What you usually pay. You can enter the real amount for each bill later." })}
        <div style="align-self:end">${checkbox({ id: "variable", label: "The amount changes every time", checked: b.variable, help: "Electricity and water usually do. SmartBill can forecast these." })}</div></div>
      <div class="two">${field({ id: "frequency", label: "How often", required: true, value: b.frequency, options: FREQUENCIES.map((f) => [f, label(f)]) })}
        ${field({ id: "anchorDate", label: "First due date", type: "date", required: true, value: b.anchorDate ?? "", help: "Later due dates are worked out from this one." })}</div>
      <div class="two" id="custom-row" ${b.frequency === "CUSTOM" ? "" : "hidden"}>${field({ id: "customIntervalValue", label: "Repeat every", value: b.customIntervalValue ?? "", attrs: 'inputmode="numeric"', required: true })}
        ${field({ id: "customIntervalUnit", label: "Unit", value: b.customIntervalUnit ?? "DAYS", options: [["DAYS", "Days"], ["WEEKS", "Weeks"], ["MONTHS", "Months"]], required: true })}</div>
      <div id="monthend-row">${checkbox({ id: "monthEndAnchored", label: "Always the last day of the month", checked: b.monthEndAnchored, help: "Without this, a bill due on the 31st falls on the 28th or 30th in short months, then returns to the 31st." })}</div>
      <div class="two">${field({ id: "endDate", label: "Stop repeating after", type: "date", value: b.endDate ?? "" })}
        ${field({ id: "reminderDays", label: "Remind me (days before)", value: (b.reminderDays || []).join(", "), help: "For example 7, 3, 1. Leave empty to use your default in Settings." })}</div>
      ${field({ id: "notes", label: "Notes", textarea: true, value: b.notes ?? "" })}
      <div class="alert error" role="alert" data-form-error hidden></div>
      <div class="row"><button class="btn primary" type="submit">${editing ? "Save changes" : "Add bill"}</button><a class="btn" href="${editing ? `#/bills/${b.id}` : "#/bills"}">Cancel</a></div>
    </form>`);
  const form = root.querySelector("#bill-form");
  const sync = () => {
    const v = formValues(form);
    form.querySelector("#custom-row").hidden = v.frequency !== "CUSTOM";
    const ok = monthBased(v.frequency, v.customIntervalUnit);
    form.querySelector("#monthend-row").hidden = !ok; if (!ok) form.querySelector("#monthEndAnchored").checked = false;
  };
  form.addEventListener("change", sync); sync();

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearErrors(form);
    const v = formValues(form);
    let reminders = null;
    const errs = validate(v, {
      name: required("Enter a name for this bill"), expectedAmount: (x) => required("Enter the expected amount")(x) || money()(x),
      anchorDate: (x) => required("Choose the first due date")(x) || isoDate()(x), endDate: (x, all) => isoDate()(x) || (x && all.anchorDate && x < all.anchorDate ? "This is before the first due date" : ""),
      customIntervalValue: (x, all) => (all.frequency === "CUSTOM" ? (/^[1-9]\d{0,3}$/.test(x) && Number(x) <= 3650 ? "" : "Enter a whole number from 1 to 3650") : ""),
      reminderDays: (x) => { try { reminders = parseReminderDays(x); return ""; } catch (err) { return err.message; } },
    });
    if (Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => setFieldError(form, k, m)); form.querySelector('[aria-invalid="true"]').focus(); return; }
    const custom = v.frequency === "CUSTOM";
    const body = { name: v.name, category: v.category, provider: v.provider || null, expectedAmount: v.expectedAmount, variable: v.variable, frequency: v.frequency,
      customIntervalValue: custom ? Number(v.customIntervalValue) : null, customIntervalUnit: custom ? v.customIntervalUnit : null, anchorDate: v.anchorDate,
      monthEndAnchored: v.monthEndAnchored, endDate: v.endDate || null, reminderDays: reminders, notes: v.notes || null };
    const btn = form.querySelector('button[type="submit"]'); setBusy(btn, true);
    try {
      const saved = editing ? await put(`/api/bills/${params.id}`, body) : await post("/api/bills", body);
      toast(editing ? "Bill saved" : "Bill added", "success"); navigate(`/bills/${saved.id}`);
    } catch (err) { showErrors(form, err); } finally { setBusy(btn, false); }
  });
}
