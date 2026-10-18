import { icon } from "./icons.js";
import { fmtDate } from "./dates.js";

// ---------- safe HTML templating: interpolated values are ESCAPED unless wrapped with raw()
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join("") : v === false || v == null ? "" : esc(v));
export function html(strings, ...vals) { let out = strings[0]; vals.forEach((v, i) => { out += part(v) + strings[i + 1]; }); return new Safe(out); }
export function render(root, safe) { root.innerHTML = safe instanceof Safe ? safe.s : esc(safe); return root; }
export { icon };

// ---------- money
export function inr(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(n)) return "—";
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  let w = whole;
  if (w.length > 3) { let head = w.slice(0, -3); const tail = w.slice(-3); const parts = []; while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); } if (head) parts.unshift(head); w = [...parts, tail].join(","); }
  return `${n < 0 ? "-" : ""}₹${w}.${frac}`;
}
export const inrShort = (v) => { const s = inr(v); return s.endsWith(".00") ? s.slice(0, -3) : s; };

// ---------- labels
const LABELS = {
  ELECTRICITY: "Electricity", WATER: "Water", INTERNET: "Internet & broadband", MOBILE_POSTPAID: "Mobile postpaid", MOBILE_RECHARGE: "Mobile recharge",
  RENT: "Rent", GAS: "Gas", INSURANCE: "Insurance", EDUCATION_FEES: "Education fees", MAINTENANCE: "Maintenance charges", OTHER: "Other",
  OTT_STREAMING: "OTT streaming", MUSIC: "Music", CLOUD_STORAGE: "Cloud storage", SOFTWARE: "Software", GYM_MEMBERSHIP: "Gym membership", LEARNING: "Learning", MEMBERSHIP: "Membership",
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", HALF_YEARLY: "Half-yearly", YEARLY: "Yearly", CUSTOM: "Custom",
  UPI: "UPI", CASH: "Cash", CARD: "Debit/credit card", BANK_TRANSFER: "Bank transfer",
  ACTIVE: "Active", PAUSED: "Paused", CANCELLED: "Cancelled", EXPIRED: "Expired",
};
export const label = (k) => LABELS[k] || String(k ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const BILL_CATEGORIES = ["ELECTRICITY", "WATER", "INTERNET", "MOBILE_POSTPAID", "MOBILE_RECHARGE", "RENT", "GAS", "INSURANCE", "EDUCATION_FEES", "MAINTENANCE", "OTHER"];
export const SUB_CATEGORIES = ["OTT_STREAMING", "MUSIC", "CLOUD_STORAGE", "SOFTWARE", "GYM_MEMBERSHIP", "LEARNING", "MEMBERSHIP", "OTHER"];
export const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "CUSTOM"];
export const METHODS = ["UPI", "CASH", "CARD", "BANK_TRANSFER", "OTHER"];

// ---------- status / amount-kind chips (solid = confirmed, dashed = not confirmed)
const STATUS = {
  PAID: ["ok", "Paid"], OVERDUE: ["bad", "Overdue"], DUE_TODAY: ["warn", "Due today"], DUE_SOON: ["warn", "Due soon"],
  UPCOMING: ["info", "Upcoming"], WAIVED: ["muted", "Waived"], PAST: ["muted", "Past"],
};
export function statusChip(status, partial = false) {
  const [cls, text] = STATUS[status] || ["muted", label(status)];
  return html`<span class="chip ${cls}">${text}</span>${partial && status !== "PAID" ? html` <span class="chip muted">Partly paid</span>` : ""}`;
}
const KIND = { CONFIRMED: null, EXPECTED: "Expected", PREDICTED: "Predicted", SCHEDULED: "Scheduled", ESTIMATE: "Estimate" };
export function amountCell(amount, kind = "CONFIRMED") {
  const k = KIND[kind];
  return html`<span class="amt num ${k ? "unconfirmed" : ""}">${inr(amount)}</span>${k ? html`<span class="amt-kind">${k}</span>` : ""}`;
}
export const kindChip = (kind) => (KIND[kind] ? html`<span class="chip pred">${KIND[kind]}</span>` : "");

// ---------- states
export const emptyState = ({ title, text, action }) => html`<div class="empty"><h2>${title}</h2><p>${text}</p>${action ? raw(action) : ""}</div>`;
export const skeleton = (rows = 3) => html`<div class="stack" aria-busy="true" aria-label="Loading">${Array.from({ length: rows }, () => html`<div class="skeleton" style="height:3rem"></div>`)}</div>`;
export const errorBox = (err, retry = true) => html`<div class="alert error" role="alert"><div class="grow"><strong>${err?.message || "Something went wrong."}</strong></div>${retry ? html`<button class="btn small" data-action="retry">Try again</button>` : ""}</div>`;

// ---------- toasts
export function toast(message, type = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = `toast ${type}`; t.textContent = message; box.appendChild(t);
  setTimeout(() => t.remove(), type === "error" ? 7000 : 4000);
  return t;
}

// ---------- dialogs
function openDlg(dlg) { document.body.appendChild(dlg); if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
function closeDlg(dlg) { if (typeof dlg.close === "function") dlg.close(); dlg.removeAttribute("open"); dlg.remove(); }

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog"); dlg.className = "dlg"; dlg.setAttribute("aria-labelledby", "dlg-title");
    render(dlg, html`<h2 id="dlg-title">${title}</h2><p>${message}</p><div class="actions"><button class="btn" data-dlg="cancel">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-dlg="ok">${confirmLabel}</button></div>`);
    dlg.addEventListener("click", (e) => { const b = e.target.closest("[data-dlg]"); if (!b) return; closeDlg(dlg); resolve(b.dataset.dlg === "ok"); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDlg(dlg); resolve(false); });
    openDlg(dlg); dlg.querySelector('[data-dlg="cancel"]').focus();
  });
}

/** Form dialog. onSubmit(values) may throw ApiError; its message/fields are shown inside the dialog. Resolves true if saved. */
export function formDialog({ title, body, submitLabel = "Save", onSubmit, danger = false, intro = "" }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog"); dlg.className = "dlg"; dlg.setAttribute("aria-labelledby", "dlg-title");
    render(dlg, html`<form class="form" novalidate><h2 id="dlg-title">${title}</h2>${intro ? html`<p class="muted">${intro}</p>` : ""}${body}<div class="alert error" role="alert" data-form-error hidden></div><div class="actions"><button type="button" class="btn" data-dlg="cancel">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" type="submit">${submitLabel}</button></div></form>`);
    const form = dlg.querySelector("form");
    dlg.addEventListener("click", (e) => { if (e.target.closest('[data-dlg="cancel"]')) { closeDlg(dlg); resolve(false); } });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDlg(dlg); resolve(false); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(form);
      const btn = form.querySelector('button[type="submit"]'); setBusy(btn, true);
      try { await onSubmit(formValues(form), form); closeDlg(dlg); resolve(true); }
      catch (err) { showErrors(form, err); }
      finally { setBusy(btn, false); }
    });
    openDlg(dlg); const first = form.querySelector("input,select,textarea"); if (first) first.focus();
  });
}

// ---------- forms
export function field({ id, label: text, type = "text", value = "", required = false, help = "", attrs = "", options = null, textarea = false, plain = false }) {
  const common = `id="${esc(id)}" name="${esc(id)}" class="input" ${required ? "required" : ""} aria-describedby="${esc(id)}-err${help ? " " + esc(id) + "-help" : ""}" ${attrs}`;
  let control;
  if (options) control = html`<select ${raw(common)}>${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw("selected") : ""}>${l}</option>`)}</select>`;
  else if (textarea) control = html`<textarea ${raw(common)}>${value}</textarea>`;
  else control = html`<input ${raw(common)} type="${type}" value="${value}">`;
  return html`<div class="field"><label for="${id}">${text}${required || plain ? "" : html` <span class="muted small">(optional)</span>`}</label>${control}${help ? html`<span class="help" id="${id}-help">${help}</span>` : ""}<span class="error" id="${id}-err" role="alert"></span></div>`;
}
export const checkbox = ({ id, label: text, checked = false, help = "" }) => html`<div class="check"><input type="checkbox" id="${id}" name="${id}" ${checked ? raw("checked") : ""}><div><label for="${id}">${text}</label>${help ? html`<div class="help small muted">${help}</div>` : ""}</div></div>`;

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  return out;
}
export function clearErrors(form) {
  form.querySelectorAll(".field .error").forEach((e) => (e.textContent = ""));
  form.querySelectorAll('[aria-invalid="true"]').forEach((e) => e.removeAttribute("aria-invalid"));
  const box = form.querySelector("[data-form-error]"); if (box) { box.hidden = true; box.textContent = ""; }
}
export function setFieldError(form, name, message) {
  const el = form.querySelector(`[name="${name}"]`), err = form.querySelector(`[id="${name}-err"]`);
  if (el) el.setAttribute("aria-invalid", "true"); if (err) err.textContent = message;
}
export function showErrors(form, err) {
  const shown = new Set();
  if (err && err.fields) for (const [name, msg] of Object.entries(err.fields)) { if (form.querySelector(`[name="${name}"]`)) { setFieldError(form, name, msg); shown.add(name); } }
  const box = form.querySelector("[data-form-error]");
  if (box && (shown.size === 0 || !(err && err.fields))) { box.hidden = false; box.textContent = err?.message || "Something went wrong."; }
  else if (box && shown.size < Object.keys(err.fields || {}).length) { box.hidden = false; box.textContent = "Please fix the highlighted fields."; }
  const firstBad = form.querySelector('[aria-invalid="true"]'); if (firstBad && firstBad.focus) firstBad.focus();
}
export function setBusy(btn, busy) { if (!btn) return; btn.disabled = busy; btn.classList.toggle("loading", busy); btn.setAttribute("aria-busy", String(busy)); }

/** Validate a values object against rules {name: (v, all) => errorMessage|""}; returns {name: message}. */
export function validate(values, rules) { const errs = {}; for (const [k, fn] of Object.entries(rules)) { const m = fn(values[k], values); if (m) errs[k] = m; } return errs; }
export const required = (msg = "This field is required") => (v) => (v === undefined || v === "" || v === null ? msg : "");
export const money = (msg = "Enter an amount like 799 or 799.50") => (v) => (v === "" || /^\d{1,10}(\.\d{1,2})?$/.test(v) ? "" : msg);
export const isoDate = (msg = "Enter a valid date") => (v) => (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) ? "" : msg);

// ---------- misc
export const fmtWhen = (isoTs) => { const d = new Date(isoTs); return Number.isNaN(d.getTime()) ? "" : `${fmtDate(d.toISOString().slice(0, 10))}`; };
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const parseReminderDays = (text) => {
  if (!text.trim()) return null;
  const nums = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 60)) throw new Error("Reminder days must be whole numbers between 0 and 60, like 7, 3, 1");
  return [...new Set(nums)].sort((a, b) => b - a);
};

export const pageHead = (title, subtitle = "", actions = "") =>
  html`<div class="page-head"><div><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ""}</div><div class="row">${actions ? raw(actions) : ""}</div></div>`;
export const legend = () => html`<div class="legend" aria-label="How to read amounts"><span><span class="chip ok">Paid</span></span><span><span class="chip warn">Due soon</span></span><span><span class="chip bad">Overdue</span></span><span><span class="chip pred">Dashed = expected, predicted or estimated</span></span></div>`;
export function bind(root, handlers) {   // event delegation: data-action="name" -> handlers.name(el, event)
  root.addEventListener("click", (e) => { const el = e.target.closest("[data-action]"); if (!el || !root.contains(el)) return; const fn = handlers[el.dataset.action]; if (fn) { e.preventDefault(); fn(el, e); } });
}

export function infoDialog({ title, body }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog"); dlg.className = "dlg"; dlg.setAttribute("aria-labelledby", "dlg-title");
    render(dlg, html`<h2 id="dlg-title">${title}</h2>${body}<div class="actions"><button class="btn primary" data-dlg="ok">Close</button></div>`);
    const done = () => { closeDlg(dlg); resolve(); };
    dlg.addEventListener("click", (e) => { if (e.target.closest("[data-dlg]")) done(); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(); });
    openDlg(dlg); dlg.querySelector("[data-dlg]").focus();
  });
}
