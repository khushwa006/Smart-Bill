import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, fakeApi, status } from "./helpers.js";

setupDom();
const D = await import("../js/dates.js");
const UI = await import("../js/ui.js");
const R = await import("../js/router.js");

test("dates: month-end clamping and no drift when stepping months", () => {
  assert.equal(D.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(D.addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(D.addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(D.addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(D.addMonths("2026-01-15", -2), "2025-11-15");
});
test("dates: add/diff days across month, year and leap boundaries", () => {
  assert.equal(D.addDays("2026-10-31", 1), "2026-11-01"); assert.equal(D.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(D.addDays("2028-02-28", 1), "2028-02-29"); assert.equal(D.addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(D.diffDays("2026-10-20", "2026-10-18"), 2); assert.equal(D.diffDays("2026-10-18", "2026-10-20"), -2);
});
test("dates: month grid is 42 days starting on Sunday and covers the month", () => {
  const g = D.monthGrid("2026-10-18");
  assert.equal(g.length, 42); assert.equal(D.dayOfWeek(g[0].date), 0);
  assert.equal(g.filter((d) => d.inMonth).length, 31);
  assert.equal(g.find((d) => d.inMonth).date, "2026-10-01");
  assert.ok(g[41].date >= "2026-10-31");
});
test("dates: week start, formatting and invalid input", () => {
  assert.equal(D.startOfWeek("2026-10-18"), "2026-10-18");          // Sunday
  assert.equal(D.startOfWeek("2026-10-21"), "2026-10-18");
  assert.equal(D.fmtDate("2026-10-05"), "5 Oct 2026"); assert.equal(D.fmtDate("2026-10-05", false), "5 Oct");
  assert.equal(D.fmtMonth("2026-02-10"), "February 2026"); assert.equal(D.parseIso("2026-02-30"), null);
  assert.equal(D.relativeDays("2026-10-19", "2026-10-18"), "tomorrow");
});
test("dates: today respects the user's time zone", () => {
  const instant = new Date("2026-10-18T20:00:00Z");              // 01:30 on the 19th in India, still the 18th in London
  assert.equal(D.todayIso("Asia/Kolkata", instant), "2026-10-19");
  assert.equal(D.todayIso("Europe/London", instant), "2026-10-18");
});

test("ui: html templating escapes interpolated values (XSS)", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const out = UI.html`<p title="${evil}">${evil}</p>`.toString();
  assert.ok(!out.includes("<img")); assert.ok(out.includes("&lt;img")); assert.ok(out.includes("&quot;"));
  assert.equal(UI.html`${UI.raw("<b>ok</b>")}`.toString(), "<b>ok</b>");
  assert.equal(UI.html`${[UI.html`<i>${"<"}</i>`, "&"]}`.toString(), "<i>&lt;</i>&amp;");
});
test("ui: INR formatting uses Indian grouping and never invents values", () => {
  assert.equal(UI.inr(799), "₹799.00"); assert.equal(UI.inr("1450"), "₹1,450.00"); assert.equal(UI.inr(145000.5), "₹1,45,000.50");
  assert.equal(UI.inr(12345678), "₹1,23,45,678.00"); assert.equal(UI.inr(-2500), "-₹2,500.00"); assert.equal(UI.inr(null), "—"); assert.equal(UI.inr("abc"), "—");
  assert.equal(UI.inrShort(1500), "₹1,500"); assert.equal(UI.inrShort(1500.5), "₹1,500.50");
});
test("ui: unconfirmed amounts are always marked, confirmed ones are not", () => {
  const confirmed = UI.amountCell(799, "CONFIRMED").toString(), expected = UI.amountCell(799, "EXPECTED").toString(), predicted = UI.amountCell(1450, "PREDICTED").toString();
  assert.ok(!confirmed.includes("unconfirmed")); assert.ok(expected.includes("unconfirmed") && expected.includes("Expected"));
  assert.ok(predicted.includes("unconfirmed") && predicted.includes("Predicted"));
});
test("ui: validators", () => {
  assert.equal(UI.money()("799.50"), ""); assert.equal(UI.money()("799.505"), "Enter an amount like 799 or 799.50"); assert.notEqual(UI.money()("-5"), "");
  assert.equal(UI.required()(""), "This field is required"); assert.equal(UI.isoDate()("2026-10-18"), ""); assert.notEqual(UI.isoDate()("18/10/2026"), "");
  assert.deepEqual(UI.parseReminderDays("1, 7 ,3,7"), [7, 3, 1]); assert.equal(UI.parseReminderDays("  "), null);
  assert.throws(() => UI.parseReminderDays("7, x")); assert.throws(() => UI.parseReminderDays("99"));
});
test("router: parses hash + query and matches parameters", () => {
  assert.deepEqual(R.parseHash("#/bills?x=1"), { path: "/bills", query: { x: "1" } }); assert.equal(R.parseHash("").path, "/dashboard");
  assert.deepEqual(R.match("/bills/12/edit").params, { id: "12" }); assert.equal(R.match("/bills/new").route.title, "Add bill");
  assert.equal(R.match("/nope"), null); assert.equal(R.match("/bills/12/edit/x"), null);
});

test("api: sends credentials + CSRF header on writes only, maps errors to friendly messages", async () => {
  const { get, post, ApiError } = await import("../js/api.js");
  const f = fakeApi({ "GET /api/a": { ok: 1 }, "POST /api/b": { ok: 2 }, "POST /api/conflict": () => status(409, { error: "Email is already registered" }),
    "POST /api/fields": () => status(400, { error: "Validation failed", fields: { name: "must not be blank" } }), "GET /api/boom": () => status(500, {}), "GET /api/expired": () => status(401, { error: "Authentication required" }) });
  globalThis.fetch = f;
  await get("/api/a", { x: "1", empty: "", list: ["a", "b"] }); await post("/api/b", { n: 1 });
  assert.equal(f.calls[0].credentials, "include"); assert.equal(f.calls[0].headers["X-SmartBill-Client"], undefined); assert.equal(f.calls[1].headers["X-SmartBill-Client"], "web");
  assert.deepEqual(f.calls[0].query, { x: "1", list: "b" }); assert.deepEqual(f.calls[0].queryAll.getAll("list"), ["a", "b"]); assert.ok(!("empty" in f.calls[0].query));
  await assert.rejects(post("/api/conflict"), (e) => e instanceof ApiError && e.status === 409 && e.message === "Email is already registered");
  await assert.rejects(post("/api/fields"), (e) => e.fields.name === "must not be blank");
  await assert.rejects(get("/api/boom"), (e) => /our side/.test(e.message));
  let expired = 0; document.addEventListener("auth:expired", () => expired++);
  await assert.rejects(get("/api/expired")); assert.equal(expired, 1);
  globalThis.fetch = async () => { throw new TypeError("network down"); };
  await assert.rejects(get("/api/a"), (e) => e.status === 0 && /Can't reach SmartBill/.test(e.message));
});
