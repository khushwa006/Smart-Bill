import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, fakeApi, status, freshRoot, flush, sleep, q, qa, text, submit, type, USER, bill, cycle, summary, calItem, FakeChart } from "./helpers.js";

setupDom();
const ctx = (o = {}) => ({ root: freshRoot(), user: USER, params: {}, query: {}, signal: undefined, refreshBell() {}, ...o });
const use = (routes) => { const f = fakeApi(routes); globalThis.fetch = f; return f; };
const dlg = () => document.querySelector("dialog");
const click = (el) => el.click();
const mod = (n) => import(`../js/pages/${n}.js`);
const lastHash = () => window.location.hash;

// ---------------------------------------------------------------- login / register
test("login: empty form shows field errors and sends nothing", async () => {
  const f = use({}); const c = ctx(); (await mod("login")).page(c); await sleep(0);
  submit(q(c.root, "form"));
  assert.match(text(q(c.root, "#email-err")), /valid email/); assert.match(text(q(c.root, "#password-err")), /Enter your password/);
  assert.equal(q(c.root, "#email").getAttribute("aria-invalid"), "true"); assert.equal(f.calls.length, 0);
});
test("login: success posts credentials with the CSRF header and goes to the dashboard", async () => {
  const f = use({ "POST /api/auth/login": (r) => USER }); const c = ctx(); (await mod("login")).page(c); await sleep(0);
  type(q(c.root, "#email"), "asha@example.in"); type(q(c.root, "#password"), "Passw0rd!x"); submit(q(c.root, "form")); await flush(20);
  assert.deepEqual(f.calls[0].body, { email: "asha@example.in", password: "Passw0rd!x" }); assert.equal(f.calls[0].headers["X-SmartBill-Client"], "web"); assert.equal(lastHash(), "#/dashboard");
});
test("login: wrong password shows the server message and re-enables the button", async () => {
  use({ "POST /api/auth/login": () => status(401, { error: "Invalid email or password" }) }); const c = ctx(); (await mod("login")).page(c); await sleep(0);
  type(q(c.root, "#email"), "a@b.in"); type(q(c.root, "#password"), "nope"); submit(q(c.root, "form")); await flush(20);
  assert.equal(text(q(c.root, "[data-form-error]")), "Invalid email or password"); assert.equal(q(c.root, "[data-form-error]").hidden, false); assert.equal(q(c.root, 'button[type="submit"]').disabled, false);
});
test("register: switches form, enforces password length, posts the new account", async () => {
  const f = use({ "POST /api/auth/register": () => USER }); const c = ctx(); (await mod("login")).page(c); await sleep(0);
  click(q(c.root, '[data-mode="register"]')); assert.ok(q(c.root, "#fullName"));
  type(q(c.root, "#fullName"), "Asha Rao"); type(q(c.root, "#email"), "asha@example.in"); type(q(c.root, "#password"), "short"); submit(q(c.root, "form"));
  assert.match(text(q(c.root, "#password-err")), /8 to 72/); assert.equal(f.calls.length, 0);
  type(q(c.root, "#password"), "longenough1"); submit(q(c.root, "form")); await flush(20);
  assert.deepEqual(f.calls[0].body, { email: "asha@example.in", password: "longenough1", fullName: "Asha Rao" });
});
test("register: duplicate email message from the server is shown", async () => {
  use({ "POST /api/auth/register": () => status(409, { error: "Email is already registered" }) }); const c = ctx(); (await mod("login")).page(c); await sleep(0);
  click(q(c.root, '[data-mode="register"]')); type(q(c.root, "#fullName"), "A"); type(q(c.root, "#email"), "a@b.in"); type(q(c.root, "#password"), "longenough1"); submit(q(c.root, "form")); await flush(20);
  assert.equal(text(q(c.root, "[data-form-error]")), "Email is already registered");
});

// ---------------------------------------------------------------- dashboard
const dashRoutes = (o = {}) => ({ "GET /api/analytics/summary": summary(), "GET /api/bills": [bill()],
  "GET /api/calendar": [calItem(), calItem({ type: "SUBSCRIPTION", id: 3, refId: 3, title: "StreamBox", date: "2026-10-20", amount: 649, amountKind: "SCHEDULED", status: "UPCOMING", outstanding: null }),
    calItem({ id: 11, title: "Electricity", date: "2026-10-22", amount: 1450, amountKind: "PREDICTED", status: "UPCOMING" })], ...o });
test("dashboard: ribbon, metrics and the confirmed/unconfirmed distinction", async () => {
  const f = use(dashRoutes({ "GET /api/analytics/summary": summary({ overdue: { amount: 850, count: 1 }, dueNext7Days: { confirmed: 799, expected: 450, count: 2 } }) }));
  const c = ctx(); await (await mod("dashboard")).page(c);
  assert.match(text(q(c.root, "h1")), /Today/); assert.match(text(q(c.root, ".alert.error")), /₹850\.00 overdue across 1 bill/);
  assert.equal(qa(c.root, ".day").length, 14); assert.ok(q(c.root, ".day.today"));
  const pills = qa(c.root, ".pill"); assert.ok(pills.some((p) => /Electricity/.test(p.textContent) && p.classList.contains("dashed")), "predicted bill is dashed");
  assert.ok(pills.some((p) => /Internet/.test(p.textContent) && p.classList.contains("dashed")), "expected amount is dashed");
  assert.equal(pills.find((p) => /StreamBox/.test(p.textContent)).getAttribute("href"), "#/subscriptions/3");
  const t = text(c.root); assert.match(t, /₹799\.00/); assert.match(t, /plus ₹450\.00 expected, not yet confirmed/);
  const predictedCard = qa(c.root, ".card.metric").find((m) => /Predicted bills/.test(m.textContent)); assert.ok(predictedCard.classList.contains("dashed"));
  const [from, to] = [f.called("GET", "/api/calendar")[0].query.from, f.called("GET", "/api/calendar")[0].query.to]; assert.equal(from, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())); assert.ok(to > from);
});
test("dashboard: brand-new account gets an invitation, not an empty grid", async () => {
  use(dashRoutes({ "GET /api/bills": [], "GET /api/calendar": [] })); const c = ctx(); await (await mod("dashboard")).page(c);
  assert.match(text(q(c.root, ".empty")), /Add your first bill/); assert.ok(q(c.root, '.empty a[href="#/bills/new"]')); assert.equal(qa(c.root, ".day").length, 0);
});
test("dashboard: API failure propagates so the router can show a retryable error", async () => {
  use(dashRoutes({ "GET /api/analytics/summary": () => status(500, {}) })); await assert.rejects((await mod("dashboard")).page(ctx()), (e) => e.status === 500);
});

// ---------------------------------------------------------------- bills list
const listRoutes = (o = {}) => ({ "GET /api/bills": [bill(), bill({ id: 2, name: "Electricity", category: "ELECTRICITY", variable: true, expectedAmount: 1400 })],
  "GET /api/cycles": [cycle(), cycle({ id: 11, billId: 2, billName: "Electricity", dueDate: "2026-10-12", status: "OVERDUE" }), cycle({ id: 12, billId: 2, billName: "Electricity", dueDate: "2026-09-12", status: "PAID" })], ...o });
test("bills: shows loading first, then rows with next-due status", async () => {
  use(listRoutes()); const c = ctx(); const p = (await mod("bills")).page(c);
  assert.ok(q(c.root, '[aria-busy="true"]'), "skeleton shown while loading"); await p;
  assert.equal(qa(c.root, "tbody tr").length, 2); const row = qa(c.root, "tbody tr")[1];
  assert.match(text(row), /Electricity/); assert.match(text(row), /Varies each month/); assert.match(text(row), /Overdue/); assert.match(text(row), /12 Oct 2026/); assert.doesNotMatch(text(row), /Paid/);
});
test("bills: names are rendered as text, never as HTML", async () => {
  use(listRoutes({ "GET /api/bills": [bill({ name: '<img src=x onerror="window.__x=1">' })] })); const c = ctx(); await (await mod("bills")).page(c);
  assert.equal(qa(c.root, "img").length, 0); assert.match(text(q(c.root, "tbody")), /<img src=x/);
});
test("bills: search and filters call the API with the chosen parameters", async () => {
  const f = use(listRoutes()); const c = ctx(); await (await mod("bills")).page(c);
  type(q(c.root, "#q"), "elec"); type(q(c.root, "#category"), "ELECTRICITY"); type(q(c.root, "#sort"), "expectedAmount"); type(q(c.root, "#dir"), "desc"); await flush(300);
  const last = f.called("GET", "/api/bills").at(-1).query; assert.deepEqual({ q: last.q, category: last.category, sort: last.sort, dir: last.dir }, { q: "elec", category: "ELECTRICITY", sort: "expectedAmount", dir: "desc" });
});
test("bills: empty states differ for 'no bills' and 'no matches'", async () => {
  use(listRoutes({ "GET /api/bills": [] })); let c = ctx(); await (await mod("bills")).page(c); assert.match(text(q(c.root, ".empty")), /No bills yet/);
  c = ctx(); await (await mod("bills")).page(c); type(q(c.root, "#q"), "zzz"); await flush(300); assert.match(text(q(c.root, ".empty")), /No bills match/);
});
test("bills: a failed load shows an error with a working retry", async () => {
  let fail = true; use(listRoutes({ "GET /api/bills": () => (fail ? status(503, { error: "Down for maintenance" }) : [bill()]) })); const c = ctx(); await (await mod("bills")).page(c);
  assert.match(text(q(c.root, ".alert.error")), /Down for maintenance/); fail = false; click(q(c.root, '[data-action="retry"]')); await flush(30); assert.equal(qa(c.root, "tbody tr").length, 1);
});

// ---------------------------------------------------------------- bill form
test("bill form: validation blocks an empty submit and explains each problem", async () => {
  const f = use({}); const c = ctx(); await (await mod("bill-form")).page(c);
  submit(q(c.root, "form")); await sleep(0);
  assert.match(text(q(c.root, "#name-err")), /Enter a name/); assert.match(text(q(c.root, "#expectedAmount-err")), /expected amount/); assert.match(text(q(c.root, "#anchorDate-err")), /first due date/);
  assert.equal(f.calls.length, 0); assert.equal(document.activeElement.id, "name");
});
test("bill form: amount format, end date and custom interval are validated", async () => {
  use({}); const c = ctx(); await (await mod("bill-form")).page(c);
  type(q(c.root, "#name"), "Rent"); type(q(c.root, "#expectedAmount"), "12,000"); type(q(c.root, "#anchorDate"), "2026-11-01"); type(q(c.root, "#endDate"), "2026-10-01");
  type(q(c.root, "#frequency"), "CUSTOM"); assert.equal(q(c.root, "#custom-row").hidden, false); submit(q(c.root, "form"));
  assert.match(text(q(c.root, "#expectedAmount-err")), /like 799/); assert.match(text(q(c.root, "#endDate-err")), /before the first due date/); assert.match(text(q(c.root, "#customIntervalValue-err")), /1 to 3650/);
});
test("bill form: month-end option only offered for month-based schedules", async () => {
  use({}); const c = ctx(); await (await mod("bill-form")).page(c);
  assert.equal(q(c.root, "#monthend-row").hidden, false); type(q(c.root, "#frequency"), "WEEKLY"); assert.equal(q(c.root, "#monthend-row").hidden, true);
  type(q(c.root, "#frequency"), "CUSTOM"); type(q(c.root, "#customIntervalUnit"), "MONTHS"); assert.equal(q(c.root, "#monthend-row").hidden, false);
});
test("bill form: valid submit sends the exact request and opens the new bill", async () => {
  const f = use({ "POST /api/bills": (r) => ({ ...bill(), id: 77 }) }); const c = ctx(); await (await mod("bill-form")).page(c);
  type(q(c.root, "#name"), "Broadband"); type(q(c.root, "#category"), "INTERNET"); type(q(c.root, "#expectedAmount"), "799"); type(q(c.root, "#anchorDate"), "2026-11-18"); type(q(c.root, "#reminderDays"), "1, 7");
  q(c.root, "#monthEndAnchored").checked = true; submit(q(c.root, "form")); await flush(20);
  assert.deepEqual(f.calls[0].body, { name: "Broadband", category: "INTERNET", provider: null, expectedAmount: "799", variable: false, frequency: "MONTHLY", customIntervalValue: null,
    customIntervalUnit: null, anchorDate: "2026-11-18", monthEndAnchored: true, endDate: null, reminderDays: [7, 1], notes: null });
  assert.equal(lastHash(), "#/bills/77");
});
test("bill form: server-side field errors appear beside the right fields", async () => {
  use({ "POST /api/bills": () => status(400, { error: "Validation failed", fields: { name: "size must be between 0 and 120" } }) }); const c = ctx(); await (await mod("bill-form")).page(c);
  type(q(c.root, "#name"), "X"); type(q(c.root, "#expectedAmount"), "5"); type(q(c.root, "#anchorDate"), "2026-11-18"); submit(q(c.root, "form")); await flush(20);
  assert.match(text(q(c.root, "#name-err")), /size must be/); assert.equal(q(c.root, "#name").getAttribute("aria-invalid"), "true");
});
test("bill form: editing prefills the form and saves with PUT", async () => {
  const f = use({ "GET /api/bills/5": bill({ id: 5, name: "Water", expectedAmount: 450, variable: true, reminderDays: [3, 1] }), "PUT /api/bills/5": () => bill({ id: 5 }) });
  const c = ctx({ params: { id: "5" } }); await (await mod("bill-form")).page(c);
  assert.equal(q(c.root, "#name").value, "Water"); assert.equal(q(c.root, "#reminderDays").value, "3, 1"); assert.equal(q(c.root, "#variable").checked, true);
  type(q(c.root, "#expectedAmount"), "475.50"); submit(q(c.root, "form")); await flush(20);
  assert.equal(f.called("PUT", "/api/bills/5")[0].body.expectedAmount, "475.50"); assert.equal(lastHash(), "#/bills/5");
});

// ---------------------------------------------------------------- bill detail, payments, forecast
const detailRoutes = (o = {}) => ({ "GET /api/bills/1": bill({ variable: true }),
  "GET /api/bills/1/history": [cycle({ amountConfirmed: true, actualAmount: 799, amountPayable: 799 }), cycle({ id: 9, dueDate: "2026-09-18", amountConfirmed: true, actualAmount: 750, amountPayable: 750, paidAmount: 750, outstandingAmount: 0, status: "PAID" })],
  "GET /api/bills/1/payments": [{ id: 4, billingCycleId: 9, amount: 750, paidOn: "2026-09-17", method: "UPI", transactionRef: "UTR1", reversed: false }], ...o });
test("bill detail: history, outstanding and payments are shown with correct statuses", async () => {
  use(detailRoutes()); const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  const rows = qa(c.root, "tbody tr"); assert.equal(rows.length, 2); assert.match(text(rows[0]), /Due today/); assert.match(text(rows[1]), /Paid/);
  assert.ok(q(rows[0], '[data-action="pay"]')); assert.equal(q(rows[1], '[data-action="pay"]'), null, "paid cycles offer no payment button");
  assert.match(text(q(c.root, "#pay-h").closest("section")), /₹750\.00/); assert.equal(FakeChart.instances.at(-1).cfg.type, "bar");
});
test("bill detail: recording a payment posts once with an idempotency key and refreshes", async () => {
  const f = use(detailRoutes({ "POST /api/payments": (r) => ({ id: 99, ...r.body }) })); const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(q(c.root, '[data-action="pay"]')); const d = dlg(); assert.ok(d.hasAttribute("open")); assert.equal(q(d, "#amount").value, "799.00");
  type(q(d, "#amount"), "500"); type(q(d, "#method"), "CASH"); submit(q(d, "form")); await flush(30);
  const body = f.called("POST", "/api/payments")[0].body; assert.equal(body.billingCycleId, 10); assert.equal(body.amount, "500"); assert.equal(body.method, "CASH"); assert.ok(body.idempotencyKey.length >= 8);
  assert.equal(dlg(), null, "dialog closes after success"); assert.match(text(document.getElementById("toasts")), /Payment recorded/); assert.ok(f.called("GET", "/api/bills/1/history").length >= 2);
});
test("bill detail: invalid and over-limit payments keep the dialog open with a clear message", async () => {
  const f = use(detailRoutes({ "POST /api/payments": () => status(422, { error: "Amount exceeds the outstanding balance of 799.00" }) })); const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(q(c.root, '[data-action="pay"]')); type(q(dlg(), "#amount"), "abc"); submit(q(dlg(), "form")); await sleep(0);
  assert.match(text(q(dlg(), "#amount-err")), /like 799/); assert.equal(f.called("POST", "/api/payments").length, 0);
  type(q(dlg(), "#amount"), "5000"); submit(q(dlg(), "form")); await flush(30);
  assert.ok(dlg(), "still open"); assert.match(text(q(dlg(), "[data-form-error]")), /exceeds the outstanding balance/);
});
test("bill detail: forecast is drawn dashed and labelled Predicted; service outage is explained", async () => {
  const forecast = { id: 1, billId: 1, kind: "PREDICTED", status: "OK", forecastAmount: 1420, forecastPeriodStart: "2026-10-18", forecastPeriodEnd: "2026-11-17", method: "MOVING_AVERAGE_3", observationsUsed: 4, dataQuality: "LOW",
    intervalLower: null, intervalUpper: null, explanation: "Estimated ₹1,420.00 using the average of your 3 most recent confirmed bills." };
  let down = false; const f = use(detailRoutes({ "POST /api/predictions/run": () => (down ? status(503, { error: "The prediction service is currently unavailable. Your bills and payments are unaffected; please try again later." }) : forecast) }));
  const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(q(c.root, '[data-action="forecast"]')); await flush(30);
  const card = q(c.root, "[data-forecast]"); assert.ok(card.classList.contains("dashed")); assert.match(text(card), /Predicted/); assert.match(text(card), /₹1,420\.00/); assert.match(text(card), /Limited data/);
  assert.deepEqual(f.called("POST", "/api/predictions/run")[0].body, { billId: 1 });
  down = true; click(q(c.root, '[data-action="forecast"]')); await flush(30);
  assert.match(text(q(c.root, "#forecast .alert.error")), /prediction service is currently unavailable/); assert.ok(q(c.root, "tbody tr"), "the rest of the page keeps working");
});
test("bill detail: deleting needs confirmation and sends confirm=true", async () => {
  const f = use(detailRoutes({ "DELETE /api/bills/1": () => undefined })); const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(q(c.root, '[data-action="delete"]')); click(q(dlg(), '[data-dlg="cancel"]')); await sleep(0); assert.equal(f.called("DELETE", "/api/bills/1").length, 0);
  click(q(c.root, '[data-action="delete"]')); click(q(dlg(), '[data-dlg="ok"]')); await flush(30);
  assert.equal(f.called("DELETE", "/api/bills/1")[0].query.confirm, "true"); assert.equal(lastHash(), "#/bills");
});
test("bill detail: delete blocked by payments shows the server explanation", async () => {
  use(detailRoutes({ "DELETE /api/bills/1": () => status(409, { error: "The request conflicts with existing data (duplicate, or linked records exist)" }) })); const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(q(c.root, '[data-action="delete"]')); click(q(dlg(), '[data-dlg="ok"]')); await flush(30); assert.match(text(document.getElementById("toasts")), /linked records exist/);
});
test("bill detail: entering the actual amount and checking for unusual bills", async () => {
  const f = use(detailRoutes({ "PUT /api/cycles/10": (r) => ({}), "POST /api/predictions/anomaly-check": () => ({ cycleId: 10, anomaly: true, explanation: "This bill of ₹1,830.00 is 29.3% above the median." }) }));
  const c = ctx({ params: { id: "1" } }); await (await mod("bill-detail")).page(c);
  click(qa(c.root, '[data-action="actual"]')[0]); type(q(dlg(), "#actualAmount"), "1830.50"); submit(q(dlg(), "form")); await flush(30);
  assert.equal(f.called("PUT", "/api/cycles/10")[0].body.actualAmount, "1830.50");
  click(qa(c.root, '[data-action="anomaly"]')[0]); await flush(30); assert.match(text(q(c.root, "#forecast")), /29\.3% above the median/);
});
