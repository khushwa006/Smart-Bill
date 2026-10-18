import { get, put, post } from "../api.js";
import { setState } from "../store.js";
import { html, render, pageHead, field, checkbox, toast, formValues, clearErrors, showErrors, setBusy, setFieldError, validate, required, parseReminderDays } from "../ui.js";
import { logout } from "../app.js";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Dhaka", "Asia/Kathmandu", "Asia/Colombo", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

export async function page(ctx) {
  const { root, user, signal } = ctx;
  const p = await get("/api/preferences", null, signal);
  const zones = ZONES.includes(user.timezone) ? ZONES : [user.timezone, ...ZONES];
  render(root, html`${pageHead("Settings", "Your profile, reminders and password.")}
    <div class="grid cols-2" style="align-items:start">
      <form class="card form" id="profile-form" novalidate aria-labelledby="pr-h"><h2 id="pr-h">Profile</h2>
        ${field({ id: "fullName", label: "Full name", required: true, value: user.fullName })}
        <div class="field"><label for="email-ro">Email</label><input class="input" id="email-ro" value="${user.email}" disabled><span class="help">Email can't be changed here.</span></div>
        ${field({ id: "timezone", label: "Time zone", required: true, value: user.timezone, options: zones.map((z) => [z, z]), help: "Due dates and \u201ctoday\u201d use this time zone." })}
        <div class="alert error" role="alert" data-form-error hidden></div><div><button class="btn primary" type="submit">Save profile</button></div></form>
      <form class="card form" id="prefs-form" novalidate aria-labelledby="rm-h"><h2 id="rm-h">Reminders</h2>
        ${field({ id: "defaultReminderDays", label: "Remind me (days before)", required: true, value: p.defaultReminderDays.join(", "), help: "For example 7, 3, 1, 0. Individual bills and subscriptions can override this." })}
        ${field({ id: "dueSoonDays", label: "Call a bill \u201cdue soon\u201d when it is within (days)", required: true, value: p.dueSoonDays, attrs: 'inputmode="numeric"' })}
        ${checkbox({ id: "inAppEnabled", label: "Show reminders in SmartBill", checked: p.inAppEnabled })}
        ${checkbox({ id: "notifyOverdue", label: "Tell me about overdue bills", checked: p.notifyOverdue })}
        ${checkbox({ id: "notifyRenewals", label: "Tell me about subscription renewals", checked: p.notifyRenewals })}
        ${checkbox({ id: "notifyAnomalies", label: "Tell me about unusual bill amounts", checked: p.notifyAnomalies })}
        ${field({ id: "anomalyThresholdPct", label: "Flag a bill when it differs by at least (%)", required: true, value: p.anomalyThresholdPct, attrs: 'inputmode="decimal"', help: "Bills are only flagged if they also fall outside their normal range." })}
        <div class="alert info"><div class="grow">Email reminders aren't available yet. Reminders appear inside SmartBill.</div></div>
        <div class="alert error" role="alert" data-form-error hidden></div><div><button class="btn primary" type="submit">Save reminders</button></div></form>
      <form class="card form" id="pw-form" novalidate aria-labelledby="pw-h"><h2 id="pw-h">Change password</h2>
        ${field({ id: "currentPassword", label: "Current password", type: "password", required: true, attrs: 'autocomplete="current-password"' })}
        ${field({ id: "newPassword", label: "New password", type: "password", required: true, help: "8 to 72 characters", attrs: 'autocomplete="new-password"' })}
        <div class="alert error" role="alert" data-form-error hidden></div><div><button class="btn primary" type="submit">Change password</button></div></form>
      <section class="card stack" aria-labelledby="ses-h"><h2 id="ses-h">Session</h2><p class="muted">Signed in as ${user.email}.</p><div><button class="btn" id="signout">Sign out</button></div></section></div>`);

  async function submit(form, work) {
    clearErrors(form); const btn = form.querySelector('button[type="submit"]'); setBusy(btn, true);
    try { await work(formValues(form), form); } catch (err) { showErrors(form, err); } finally { setBusy(btn, false); }
  }
  const bad = (form, errs) => { Object.entries(errs).forEach(([k, m]) => setFieldError(form, k, m)); form.querySelector('[aria-invalid="true"]')?.focus(); };

  root.querySelector("#profile-form").addEventListener("submit", (e) => { e.preventDefault(); submit(e.target, async (v, form) => {
    const errs = validate(v, { fullName: required("Enter your name") }); if (Object.keys(errs).length) return bad(form, errs);
    const updated = await put("/api/profile", { fullName: v.fullName, timezone: v.timezone }); setState({ user: updated }); toast("Profile saved", "success"); }); });
  root.querySelector("#prefs-form").addEventListener("submit", (e) => { e.preventDefault(); submit(e.target, async (v, form) => {
    let days = [];
    const errs = validate(v, {
      defaultReminderDays: (x) => { try { days = parseReminderDays(x) || []; return days.length && days.length <= 8 ? "" : "Enter 1 to 8 values, like 7, 3, 1"; } catch (er) { return er.message; } },
      dueSoonDays: (x) => (/^\d+$/.test(x) && +x >= 1 && +x <= 60 ? "" : "Enter a whole number from 1 to 60"),
      anomalyThresholdPct: (x) => (Number(x) >= 1 && Number(x) <= 500 ? "" : "Enter a number from 1 to 500") });
    if (Object.keys(errs).length) return bad(form, errs);
    await put("/api/preferences", { defaultReminderDays: days, dueSoonDays: Number(v.dueSoonDays), inAppEnabled: v.inAppEnabled, notifyOverdue: v.notifyOverdue,
      notifyRenewals: v.notifyRenewals, notifyAnomalies: v.notifyAnomalies, anomalyThresholdPct: Number(v.anomalyThresholdPct), emailEnabled: false });
    toast("Reminder settings saved", "success"); }); });
  root.querySelector("#pw-form").addEventListener("submit", (e) => { e.preventDefault(); submit(e.target, async (v, form) => {
    const errs = validate(v, { currentPassword: required("Enter your current password"), newPassword: (x) => (x.length >= 8 && x.length <= 72 ? "" : "Use 8 to 72 characters") });
    if (Object.keys(errs).length) return bad(form, errs);
    await post("/api/profile/password", { currentPassword: v.currentPassword, newPassword: v.newPassword }); form.reset(); toast("Password changed", "success"); }); });
  root.querySelector("#signout").addEventListener("click", () => logout());
}
