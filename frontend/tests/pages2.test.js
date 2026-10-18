import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, fakeApi, status, freshRoot, flush, sleep, q, qa, text, submit, type, USER, bill, cycle, summary, calItem, FakeChart } from "./helpers.js";

setupDom();
const ctx = (o = {}) => ({ root: freshRoot(), user: USER, params: {}, query: {}, signal: undefined, refreshBell() {}, ...o });
const use = (routes) => { const f = fakeApi(routes); globalThis.fetch = f; return f; };
const dlg = () => document.querySelector("dialog");
const click = (el) => el.click();
const mod = (n) => import(`../js/pages/${n}.js`);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const sub = (o = {}) => ({ id: 3, serviceName: "StreamBox", category: "OTT_STREAMING", provider: "StreamBox Inc", amount: 649, frequency: "MONTHLY", customIntervalValue: null, customIntervalUnit: null, startDate: "2026-03-05",
  nextRenewalDate: "2026-11-05", endDate: null, trialEndDate: null, state: "ACTIVE", cancelledAt: null, reminderDays: null, notes: null, estimatedMonthlyCost: 649, estimatedAnnualCost: 7788, ...o });

// ---------------------------------------------------------------- subscriptions
test("subscriptions: costs are labelled as estimates, not money already spent", async () => {
  use({ "GET /api/subscriptions": [sub(), sub({ id: 4, serviceName: "FitZone", amount: 1500, estimatedMonthlyCost: 1500, state: "PAUSED" })] }); const c = ctx(); await (await mod("subscriptions")).page(c);
  assert.equal(qa(c.root, "tbody tr").length, 2); assert.ok(qa(c.root, "#summary .card.dashed").length >= 2); assert.match(text(q(c.root, "#summary")), /not money already spent/);
  assert.match(text(qa(c.root, "tbody tr")[1]), /Paused/); assert.ok(qa(c.root, ".amt-kind").some((e) => /Estimate/.test(e.textContent)));
  assert.match(text(q(c.root, "#summary")), /₹649\.00/, "paused subscription is excluded from the active total");
});
test("subscriptions: filters are sent to the API; empty states explain what to do", async () => {
  const f = use({ "GET /api/subscriptions": [] }); const c = ctx(); await (await mod("subscriptions")).page(c);
  assert.match(text(q(c.root, ".empty")), /No subscriptions yet/); type(q(c.root, "#state"), "CANCELLED"); type(q(c.root, "#provider"), "stream"); await flush(300);
  const last = f.called("GET", "/api/subscriptions").at(-1).query; assert.equal(last.state, "CANCELLED"); assert.equal(last.provider, "stream"); assert.match(text(q(c.root, ".empty")), /No subscriptions match/);
});
test("subscriptions: cancelling says it only updates SmartBill, then sends the state change", async () => {
  const f = use({ "GET /api/subscriptions": [sub()], "PATCH /api/subscriptions/3/state": (r) => sub({ state: "CANCELLED" }) }); const c = ctx(); await (await mod("subscriptions")).page(c);
  click(q(c.root, '[data-action="cancel"]')); assert.match(text(dlg()), /does not contact the provider/); assert.match(text(dlg()), /still need to cancel with them/);
  type(q(dlg(), "#note"), "switched to a family plan"); submit(q(dlg(), "form")); await flush(30);
  assert.deepEqual(f.called("PATCH", "/api/subscriptions/3/state")[0].body, { state: "CANCELLED", note: "switched to a family plan" }); assert.equal(f.called("GET", "/api/subscriptions").length, 2, "list refreshed");
});
test("subscription form: validates, then creates with the right payload", async () => {
  const f = use({ "POST /api/subscriptions": () => sub({ id: 9 }) }); const c = ctx(); await (await mod("subscription-form")).page(c);
  submit(q(c.root, "form")); assert.match(text(q(c.root, "#serviceName-err")), /service name/); assert.match(text(q(c.root, "#amount-err")), /price/); assert.equal(f.calls.length, 0);
  type(q(c.root, "#serviceName"), "TuneWave"); type(q(c.root, "#category"), "MUSIC"); type(q(c.root, "#amount"), "119"); type(q(c.root, "#frequency"), "MONTHLY"); type(q(c.root, "#startDate"), "2026-10-01"); submit(q(c.root, "form")); await flush(20);
  const b = f.calls[0].body; assert.equal(b.serviceName, "TuneWave"); assert.equal(b.amount, "119"); assert.equal(b.category, "MUSIC"); assert.equal(b.nextRenewalDate, null); assert.equal(window.location.hash, "#/subscriptions/9");
});
test("subscription detail: shows estimates, history, and a cancelled notice", async () => {
  use({ "GET /api/subscriptions/3": sub({ state: "CANCELLED", cancelledAt: "2026-10-10T08:00:00Z" }),
    "GET /api/subscriptions/3/events": [{ type: "PRICE_CHANGED", oldAmount: 499, newAmount: 649, note: null, occurredAt: "2026-08-01T00:00:00Z" }, { type: "CREATED", oldAmount: null, newAmount: 499, note: null, occurredAt: "2026-03-05T00:00:00Z" }] });
  const c = ctx({ params: { id: "3" } }); await (await mod("subscription-detail")).page(c);
  assert.match(text(q(c.root, ".alert.info")), /doesn't contact providers/); assert.match(text(c.root), /₹499\.00 → ₹649\.00/); assert.match(text(c.root), /estimates from the current price, not money already spent/);
  assert.equal(qa(c.root, "ul.list li").length, 2);
});

// ---------------------------------------------------------------- calendar
const calRoutes = (items = [calItem()]) => ({ "GET /api/calendar": () => items });
test("calendar: month grid requests exactly the visible 42 days and links items", async () => {
  const f = use(calRoutes([calItem({ date: today }), calItem({ id: 11, title: "Electricity", date: today, amount: 1450, amountKind: "PREDICTED", status: "UPCOMING" }),
    calItem({ type: "SUBSCRIPTION", id: 3, refId: 3, title: "StreamBox", date: today, amount: 649, amountKind: "SCHEDULED", status: "UPCOMING" })])); const c = ctx(); await (await mod("calendar")).page(c);
  const q1 = f.called("GET", "/api/calendar")[0].query; const days = (Date.parse(q1.to) - Date.parse(q1.from)) / 86400000; assert.equal(days, 41); assert.equal(qa(c.root, ".cal .cell").length, 42);
  const pills = qa(c.root, ".cal .pill"); assert.equal(pills.length, 3); assert.ok(pills.find((p) => /Electricity/.test(p.textContent)).classList.contains("dashed"), "predicted is dashed");
  assert.equal(pills.find((p) => /StreamBox/.test(p.textContent)).getAttribute("href"), "#/subscriptions/3"); assert.equal(pills.find((p) => /Internet/.test(p.textContent)).getAttribute("href"), "#/bills/1");
  assert.match(pills.find((p) => /Electricity/.test(p.textContent)).getAttribute("aria-label"), /Predicted/);
});
test("calendar: previous/next month navigation refetches and updates the title", async () => {
  const f = use(calRoutes([])); const c = ctx(); await (await mod("calendar")).page(c);
  const t0 = text(q(c.root, "#cal-title")); const from0 = f.called("GET", "/api/calendar")[0].query.from;
  click(q(c.root, '[data-action="next"]')); await flush(30); const t1 = text(q(c.root, "#cal-title")); assert.notEqual(t1, t0); assert.ok(f.called("GET", "/api/calendar").at(-1).query.from > from0);
  click(q(c.root, '[data-action="prev"]')); click(q(c.root, '[data-action="prev"]')); await flush(30); assert.notEqual(text(q(c.root, "#cal-title")), t1);
  click(q(c.root, '[data-action="today"]')); await flush(30); assert.equal(text(q(c.root, "#cal-title")), t0);
});
test("calendar: week and list views, plus filters passed to the API", async () => {
  const f = use(calRoutes([calItem({ date: today })])); const c = ctx(); const m = await mod("calendar"); await m.page(c);
  click(q(c.root, '[data-view="week"]')); await flush(30); const w = f.called("GET", "/api/calendar").at(-1).query; assert.equal((Date.parse(w.to) - Date.parse(w.from)) / 86400000, 6); assert.equal(qa(c.root, ".cal .cell").length, 7);
  assert.equal(q(c.root, '[data-view="week"]').getAttribute("aria-pressed"), "true");
  click(q(c.root, '[data-view="list"]')); await flush(30); assert.ok(q(c.root, "ul.list")); assert.match(text(q(c.root, "ul.list")), /Internet/);
  type(q(c.root, "#type"), "BILL"); await flush(30); type(q(c.root, "#category"), "WATER"); await flush(30); type(q(c.root, "#status"), "OVERDUE"); await flush(30);
  const last = f.called("GET", "/api/calendar").at(-1).query; assert.deepEqual({ type: last.type, category: last.category, status: last.status }, { type: "BILL", category: "WATER", status: "OVERDUE" });
});
test("calendar: busy days collapse to '+N more' and open a list for that day", async () => {
  const many = Array.from({ length: 5 }, (_, i) => calItem({ id: 20 + i, title: `Bill ${i}`, date: today })); use(calRoutes(many)); const c = ctx(); await (await mod("calendar")).page(c);
  assert.equal(qa(c.root, ".cal .pill").length, 3); const more = q(c.root, '[data-action="more"]'); assert.match(text(more), /\+2 more/); click(more); assert.equal(qa(dlg(), "li").length, 5);
});
test("calendar: range helpers", async () => {
  const { rangeFor, stepCursor } = await mod("calendar"); assert.equal(rangeFor("week", "2026-10-21").from, "2026-10-18"); assert.equal(rangeFor("month", "2026-02-10").from, "2026-02-01");
  assert.equal(stepCursor("month", "2026-01-31", 1), "2026-02-01"); assert.equal(stepCursor("week", "2026-10-18", -1), "2026-10-11");
});
test("calendar: an API failure shows an error with retry", async () => {
  let fail = true; use({ "GET /api/calendar": () => (fail ? status(500, {}) : []) }); const c = ctx(); await (await mod("calendar")).page(c);
  assert.ok(q(c.root, ".alert.error")); fail = false; click(q(c.root, '[data-action="retry"]')); await flush(30); assert.equal(q(c.root, ".alert.error"), null); assert.equal(qa(c.root, ".cal .cell").length, 42);
});

// ---------------------------------------------------------------- payments
test("payments: outstanding list, history, filters and reversal with a required reason", async () => {
  const pays = [{ id: 1, billingCycleId: 10, subscriptionId: null, amount: 300, paidOn: "2026-10-05", method: "UPI", transactionRef: "UTR9", note: null, reversed: false },
    { id: 2, billingCycleId: 10, subscriptionId: null, amount: 100, paidOn: "2026-10-01", method: "CASH", transactionRef: null, note: null, reversed: true, reversalReason: "wrong amount" },
    { id: 3, billingCycleId: null, subscriptionId: 3, amount: 649, paidOn: "2026-10-02", method: "CARD", transactionRef: null, note: null, reversed: false }];
  const f = use({ "GET /api/payments": pays, "GET /api/cycles": [cycle({ status: "OVERDUE", outstandingAmount: 499, partiallyPaid: true })], "GET /api/subscriptions": [sub()], "POST /api/payments/1/reverse": () => ({}) });
  const c = ctx(); await (await mod("payments")).page(c);
  assert.match(text(q(c.root, "#outstanding")), /Internet/); assert.match(text(q(c.root, "#outstanding")), /₹499\.00/); assert.match(text(q(c.root, "#outstanding")), /Overdue/); assert.equal(qa(c.root, "#list tbody tr").length, 3);
  assert.match(text(qa(c.root, "#list tbody tr")[1]), /Reversed/); assert.match(text(qa(c.root, "#list tbody tr")[2]), /StreamBox/);
  q(c.root, "#reversed").checked = false; type(q(c.root, "#reversed"), "x"); q(c.root, "#reversed").checked = false; q(c.root, "#reversed").dispatchEvent(new window.Event("input", { bubbles: true })); await flush(250); assert.equal(qa(c.root, "#list tbody tr").length, 2);
  type(q(c.root, "#method"), "CARD"); await flush(250); assert.equal(qa(c.root, "#list tbody tr").length, 1);
  type(q(c.root, "#method"), ""); type(q(c.root, "#q"), "utr9"); await flush(250); assert.equal(qa(c.root, "#list tbody tr").length, 1); assert.match(text(q(c.root, "#list tbody")), /Internet/);
  click(q(c.root, '[data-action="reverse"]')); submit(q(dlg(), "form")); await sleep(0); assert.match(text(q(dlg(), "#reason-err")), /why/); assert.equal(f.called("POST", "/api/payments/1/reverse").length, 0);
  type(q(dlg(), "#reason"), "paid twice"); submit(q(dlg(), "form")); await flush(40); assert.deepEqual(f.called("POST", "/api/payments/1/reverse")[0].body, { reason: "paid twice" });
});
test("payments: empty history invites the user to go to bills", async () => {
  use({ "GET /api/payments": [], "GET /api/cycles": [], "GET /api/subscriptions": [] }); const c = ctx(); await (await mod("payments")).page(c);
  assert.match(text(q(c.root, "#list .empty")), /No payments recorded yet/); assert.match(text(q(c.root, "#outstanding")), /Nothing is overdue/);
});

// ---------------------------------------------------------------- insights
const insightRoutes = (o = {}) => ({ "GET /api/bills": [bill({ id: 2, name: "Electricity", variable: true, category: "ELECTRICITY" }), bill({ id: 1 })],
  "GET /api/cycles": [cycle({ id: 5, billId: 2, billName: "Electricity", amountConfirmed: true, actualAmount: 1500, amountPayable: 1500, dueDate: "2026-09-12" })],
  "GET /api/predictions": [{ id: 1, billId: 2, forecastAmount: 1450, forecastPeriodStart: "2026-10-12", forecastPeriodEnd: "2026-11-11", method: "MOVING_AVERAGE_3", observationsUsed: 4, explanation: "Estimated ₹1,450.00." }],
  "GET /api/predictions/anomalies": [{ id: 1, billId: 2, billName: "Electricity", direction: "HIGH", explanation: "Electricity of ₹1,830.00 is 29.3% above the median", dueDate: "2026-08-12" }], ...o });
test("predictions: variable bills first, saved forecasts are dashed and labelled", async () => {
  use(insightRoutes()); const c = ctx(); await (await mod("insights")).page(c);
  const rows = qa(c.root, "tbody tr"); assert.match(text(rows[0]), /Electricity/); assert.match(text(rows[0]), /varies each time/); assert.equal(q(rows[1], '[data-action="check"]').disabled, true, "no confirmed amount yet: check disabled");
  assert.match(text(q(c.root, ".alert.info")), /dashed outline/); const li = q(c.root, "#s-h").closest("section").querySelector("li"); assert.match(text(li), /Predicted/); assert.match(li.getAttribute("style"), /dashed/);
  assert.match(text(q(c.root, "#a-h").closest("section")), /Higher than usual/);
});
test("predictions: forecast + check actions call the API and show results; outage is explained", async () => {
  let down = false;
  const f = use(insightRoutes({ "POST /api/predictions/run": () => (down ? status(503, { error: "The prediction service is currently unavailable." }) : { forecastAmount: 1420, status: "OK", forecastPeriodStart: "2026-10-12", forecastPeriodEnd: "2026-11-11", observationsUsed: 4, dataQuality: "LOW", explanation: "Estimated ₹1,420.00.", intervalLower: null }),
    "POST /api/predictions/anomaly-check": () => ({ anomaly: false, explanation: "This bill is within normal variation." }) }));
  const c = ctx(); await (await mod("insights")).page(c);
  click(qa(c.root, '[data-action="forecast"]')[0]); await flush(40); assert.deepEqual(f.called("POST", "/api/predictions/run")[0].body, { billId: 2 }); assert.ok(q(c.root, "#results [data-forecast].dashed"));
  click(q(c.root, '[data-action="check"]:not([disabled])')); await flush(40); assert.deepEqual(f.called("POST", "/api/predictions/anomaly-check")[0].body, { cycleId: 5 }); assert.match(text(q(c.root, "#results")), /within normal variation/);
  down = true; click(qa(c.root, '[data-action="forecast"]')[0]); await flush(40); assert.match(text(q(c.root, "#results")), /currently unavailable/); assert.ok(qa(c.root, "tbody tr").length, "page still usable");
});
test("predictions: no bills means a clear next step", async () => {
  use(insightRoutes({ "GET /api/bills": [] })); const c = ctx(); await (await mod("insights")).page(c); assert.match(text(q(c.root, ".empty")), /Add a bill to get forecasts/);
});

// ---------------------------------------------------------------- analytics
const trends = { months: [{ month: "2026-08", paid: 1500, billedActual: 1600, billedChangePct: null }, { month: "2026-09", paid: 1800, billedActual: 1760, billedChangePct: 10 }, { month: "2026-10", paid: 0, billedActual: null, billedChangePct: null }], note: "Predictions are not included." };
const subsA = { byCategory: [{ category: "OTT_STREAMING", count: 2, monthlyEstimate: 948, annualEstimate: 11376 }, { category: "MUSIC", count: 1, monthlyEstimate: 119, annualEstimate: 1428 }],
  possibleOverlaps: [{ category: "OTT_STREAMING", services: ["StreamBox", "ShowTime Plus"], monthlyEstimate: 948 }], estimatedSavings: { selected: [], monthly: 0, annual: 0, note: "Estimate from current prices." } };
test("analytics: metrics separate confirmed, expected, predicted and estimated", async () => {
  FakeChart.instances.length = 0;
  const f = use({ "GET /api/analytics/summary": summary({ dueNext30Days: { confirmed: 799, expected: 1400, count: 2 } }), "GET /api/bills": [bill()], "GET /api/analytics/trends": trends, "GET /api/analytics/subscriptions": subsA, "GET /api/subscriptions": [sub(), sub({ id: 4, serviceName: "ShowTime Plus", estimatedMonthlyCost: 299 })] });
  const c = ctx(); await (await mod("analytics")).page(c); await flush(30);
  const cards = qa(c.root, ".card.metric"); const by = (t) => cards.find((m) => m.textContent.includes(t));
  assert.ok(by("Predicted, next 30 days").classList.contains("dashed")); assert.ok(by("Monthly commitments").classList.contains("dashed")); assert.ok(!by("Paid, last 30 days").classList.contains("dashed"));
  assert.match(text(by("Due in 30 days")), /Confirmed · plus ₹1,400\.00 expected/); assert.match(text(q(c.root, "#trends")), /Predictions are not included/);
  const types = FakeChart.instances.map((i) => i.cfg.type || "mixed"); assert.ok(types.includes("doughnut")); const trend = FakeChart.instances.find((i) => i.cfg.data.datasets.length === 2); assert.equal(trend.cfg.data.datasets[1].data[2], null, "months without a confirmed bill are gaps, not zeros");
  assert.match(text(q(c.root, "#subs .alert.warn")), /StreamBox, ShowTime Plus/); assert.match(text(q(c.root, "#trends details")), /\+10%/);
});
test("analytics: period/bill filters and the savings what-if call the API", async () => {
  const f = use({ "GET /api/analytics/summary": summary(), "GET /api/bills": [bill()], "GET /api/analytics/trends": trends, "GET /api/subscriptions": [sub(), sub({ id: 4, serviceName: "ShowTime Plus", estimatedMonthlyCost: 299 })],
    "GET /api/analytics/subscriptions": (r) => (r.queryAll.getAll("cancel").length ? { ...subsA, estimatedSavings: { selected: [], monthly: 948, annual: 11376, note: "Estimate. Cancelling here only updates SmartBill." } } : subsA) });
  const c = ctx(); await (await mod("analytics")).page(c); await flush(30);
  type(q(c.root, "#months"), "24"); type(q(c.root, "#billId"), "1"); await flush(30); const t = f.called("GET", "/api/analytics/trends").at(-1).query; assert.deepEqual({ m: t.months, b: t.billId }, { m: "24", b: "1" });
  const box = q(c.root, '[data-action="toggle"]'); box.checked = true; box.dispatchEvent(new window.Event("change", { bubbles: true })); await flush(40);
  assert.deepEqual(f.called("GET", "/api/analytics/subscriptions").at(-1).queryAll.getAll("cancel"), ["3"]); assert.match(text(q(c.root, "#subs fieldset")), /₹948\.00 a month, ₹11,376\.00 a year/); assert.match(text(q(c.root, "#subs fieldset")), /only updates SmartBill/);
});
test("analytics: empty accounts explain what to record", async () => {
  use({ "GET /api/analytics/summary": summary(), "GET /api/bills": [], "GET /api/analytics/trends": { months: [{ month: "2026-10", paid: 0, billedActual: null, billedChangePct: null }], note: "" }, "GET /api/analytics/subscriptions": { byCategory: [], possibleOverlaps: [], estimatedSavings: {} } });
  const c = ctx(); await (await mod("analytics")).page(c); await flush(30); assert.match(text(q(c.root, "#trends")), /Nothing to chart yet/); assert.match(text(q(c.root, "#subs")), /No active subscriptions/);
});

// ---------------------------------------------------------------- notifications
const notes = [{ id: 1, type: "BILL_DUE", title: "Internet due in 3 days", message: "₹799.00 expected (not yet confirmed), due on 2026-10-21.", read: false, createdAt: "2026-10-18T05:00:00Z", billingCycleId: 10, subscriptionId: null },
  { id: 2, type: "SUBSCRIPTION_RENEWAL", title: "StreamBox renews in 2 days", message: "₹649.00 on 2026-10-20.", read: true, createdAt: "2026-10-17T05:00:00Z", billingCycleId: null, subscriptionId: 3 }];
test("notifications: unread are highlighted; reading and read-all update the server and the bell", async () => {
  let bell = 0; const f = use({ "GET /api/notifications": (r) => (r.query.unreadOnly === "true" ? notes.filter((n) => !n.read) : notes), "PATCH /api/notifications/1/read": () => undefined, "POST /api/notifications/read-all": () => ({ updated: 1 }) });
  const c = ctx({ refreshBell: () => bell++ }); await (await mod("notifications")).page(c);
  const items = qa(c.root, "ul.list li"); assert.equal(items.length, 2); assert.ok(items[0].classList.contains("unread")); assert.ok(!items[1].classList.contains("unread")); assert.equal(q(items[1], '[data-action="read"]'), null);
  assert.equal(q(items[1], "a.btn").getAttribute("href"), "#/subscriptions/3");
  click(q(c.root, '[data-action="read"]')); await flush(30); assert.equal(f.called("PATCH", "/api/notifications/1/read").length, 1); assert.equal(bell, 1);
  click(q(c.root, '[data-action="readall"]')); await flush(30); assert.equal(f.called("POST", "/api/notifications/read-all").length, 1); assert.equal(bell, 2);
  click(q(c.root, '[data-unread="true"]')); await flush(30); assert.equal(f.called("GET", "/api/notifications").at(-1).query.unreadOnly, "true");
});
test("notifications: 'check for new reminders' reports the result; empty state explains reminders", async () => {
  const f = use({ "GET /api/notifications": [], "POST /api/notifications/generate": () => ({ created: 2, cyclesExtended: 0, subscriptionsRolled: 0 }) }); const c = ctx(); await (await mod("notifications")).page(c);
  assert.match(text(q(c.root, ".empty")), /No notifications yet/); click(q(c.root, '[data-action="generate"]')); await flush(30); assert.match(text(document.getElementById("toasts")), /2 new reminders/);
});

// ---------------------------------------------------------------- settings
const prefs = { defaultReminderDays: [7, 3, 1, 0], dueSoonDays: 7, inAppEnabled: true, notifyOverdue: true, notifyRenewals: true, notifyAnomalies: true, anomalyThresholdPct: 20, emailEnabled: false };
test("settings: reminders form validates and saves the exact preferences", async () => {
  const f = use({ "GET /api/preferences": prefs, "PUT /api/preferences": (r) => r.body }); const c = ctx(); await (await mod("settings")).page(c);
  assert.equal(q(c.root, "#defaultReminderDays").value, "7, 3, 1, 0"); assert.match(text(c.root), /Email reminders aren't available yet/);
  type(q(c.root, "#defaultReminderDays"), "7, x"); type(q(c.root, "#dueSoonDays"), "0"); type(q(c.root, "#anomalyThresholdPct"), "900"); submit(q(c.root, "#prefs-form")); await sleep(0);
  assert.match(text(q(c.root, "#defaultReminderDays-err")), /whole numbers/); assert.match(text(q(c.root, "#dueSoonDays-err")), /1 to 60/); assert.match(text(q(c.root, "#anomalyThresholdPct-err")), /1 to 500/); assert.equal(f.called("PUT", "/api/preferences").length, 0);
  type(q(c.root, "#defaultReminderDays"), "10, 2"); type(q(c.root, "#dueSoonDays"), "5"); type(q(c.root, "#anomalyThresholdPct"), "25"); q(c.root, "#notifyAnomalies").checked = false; submit(q(c.root, "#prefs-form")); await flush(30);
  assert.deepEqual(f.called("PUT", "/api/preferences")[0].body, { defaultReminderDays: [10, 2], dueSoonDays: 5, inAppEnabled: true, notifyOverdue: true, notifyRenewals: true, notifyAnomalies: false, anomalyThresholdPct: 25, emailEnabled: false });
});
test("settings: profile save and password change", async () => {
  const f = use({ "GET /api/preferences": prefs, "PUT /api/profile": (r) => ({ ...USER, ...r.body }), "POST /api/profile/password": (r) => status(401, { error: "Current password is incorrect" }) }); const c = ctx(); await (await mod("settings")).page(c);
  type(q(c.root, "#fullName"), "Asha R. Rao"); type(q(c.root, "#timezone"), "UTC"); submit(q(c.root, "#profile-form")); await flush(30); assert.deepEqual(f.called("PUT", "/api/profile")[0].body, { fullName: "Asha R. Rao", timezone: "UTC" });
  submit(q(c.root, "#pw-form")); await sleep(0); assert.match(text(q(c.root, "#currentPassword-err")), /current password/); assert.match(text(q(c.root, "#newPassword-err")), /8 to 72/);
  type(q(c.root, "#currentPassword"), "wrong"); type(q(c.root, "#newPassword"), "newpassword1"); submit(q(c.root, "#pw-form")); await flush(30); assert.equal(text(q(q(c.root, "#pw-form"), "[data-form-error]")), "Current password is incorrect");
});
