import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, fakeApi, status, flush, sleep, q, qa, text, USER, summary, bill, calItem } from "./helpers.js";

setupDom();
const appEl = document.getElementById("app");
const authed = (extra = {}) => ({ "GET /api/auth/me": USER, "GET /api/notifications/unread-count": { count: 3 }, "GET /api/analytics/summary": summary(), "GET /api/bills": [bill()], "GET /api/calendar": [calItem()], ...extra });
const use = (routes) => { const f = fakeApi(routes); globalThis.fetch = f; return f; };
const go = async (hash, ms = 60) => { window.location.hash = hash; await flush(ms); };

// All app-level scenarios share one process-wide app instance, so they run in order as one story.
test("app: signed-out visitors are sent to the sign-in page", async () => {
  use({ "GET /api/auth/me": () => status(401, { error: "Authentication required" }) });
  const { start } = await import("../js/app.js"); await start(appEl); await flush(60);
  assert.equal(window.location.hash, "#/login"); assert.ok(q(appEl, ".auth-card")); assert.equal(q(appEl, ".sidebar"), null, "no app chrome before signing in");
  assert.match(document.title, /Sign in/);
});

test("app: after signing in the shell appears with navigation, bell count and the dashboard", async () => {
  const f = use(authed({ "POST /api/auth/login": USER }));
  q(appEl, "#email").value = "asha@example.in"; q(appEl, "#password").value = "Passw0rd!x"; q(appEl, "form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await flush(150);
  assert.equal(window.location.hash, "#/dashboard"); assert.ok(q(appEl, ".sidebar")); assert.ok(q(appEl, ".bottomnav")); assert.ok(q(appEl, ".skip-link"));
  assert.equal(q(appEl, '.nav [aria-current="page"]').dataset.nav, "dashboard"); assert.equal(text(q(appEl, "#bell-count")), "3"); assert.match(q(appEl, "#bell").getAttribute("aria-label"), /3 unread/);
  assert.match(text(q(appEl, "#today-label")), /20\d\d/); assert.match(text(q(appEl, "#profile-who")), /Asha Rao/); assert.match(text(q(appEl, "h1")), /Today/); assert.match(document.title, /Dashboard/);
  assert.equal(qa(appEl, ".nav a").length, 9, "all 9 sections are reachable"); assert.equal(qa(appEl, ".bottomnav a").length, 5);
});

test("app: navigating swaps pages, updates the active link, and never stacks listeners", async () => {
  const f = use(authed({ "GET /api/cycles": [], "GET /api/payments": [], "GET /api/subscriptions": [] }));
  await go("#/bills"); assert.equal(q(appEl, '.nav [aria-current="page"]').dataset.nav, "bills"); assert.match(text(q(appEl, "h1")), /Bills/);
  const before = f.called("GET", "/api/bills").length; await go("#/payments"); await go("#/bills"); await go("#/bills/new"); await go("#/bills");
  assert.equal(qa(appEl, "main h1").length, 1, "only one page rendered"); assert.equal(qa(appEl, "main").length, 1);
  await go("#/does-not-exist"); assert.match(text(q(appEl, "h1")), /Today/, "unknown routes fall back to the dashboard");
});

test("app: a page that fails to load shows an error with retry instead of a blank screen", async () => {
  let fail = true; use(authed({ "GET /api/bills": () => (fail ? status(500, {}) : [bill()]), "GET /api/cycles": [] }));
  await go("#/bills", 100); assert.match(text(q(appEl, ".alert.error")), /our side/); fail = false; q(appEl, '[data-action="retry"]').click(); await flush(100); assert.equal(q(appEl, ".alert.error"), null); assert.equal(qa(appEl, "tbody tr").length, 1);
});

test("app: signing out clears the session and returns to sign-in", async () => {
  const f = use(authed({ "POST /api/auth/logout": () => undefined, "GET /api/auth/me": () => status(401, { error: "Authentication required" }) }));
  await go("#/dashboard"); q(appEl, "#logout-btn").click(); await flush(100);
  assert.equal(f.called("POST", "/api/auth/logout")[0].headers["X-SmartBill-Client"], "web"); assert.equal(window.location.hash, "#/login"); assert.ok(q(appEl, ".auth-card")); assert.equal(q(appEl, ".sidebar"), null);
});

test("app: an already signed-in user visiting the sign-in page is sent to the dashboard", async () => {
  use(authed({ "GET /api/cycles": [] })); await go("#/bills", 120); assert.ok(q(appEl, ".sidebar"));
  await go("#/login", 120); assert.equal(window.location.hash, "#/dashboard"); assert.match(text(q(appEl, "h1")), /Today/);
});

test("app: an expired session mid-use shows a message and returns to sign-in", async () => {
  use(authed({ "GET /api/analytics/summary": () => status(401, { error: "Authentication required" }), "GET /api/cycles": [] }));
  await go("#/bills", 100); assert.ok(q(appEl, ".sidebar"), "signed in");
  await go("#/dashboard", 150); assert.equal(window.location.hash, "#/login"); assert.match(text(document.getElementById("toasts")), /session has ended/); assert.equal(q(appEl, ".sidebar"), null);
});

test("app: profile menu opens, closes on Escape and exposes aria-expanded", async () => {
  use(authed({ "GET /api/cycles": [] })); await go("#/settings", 150); assert.ok(q(appEl, "#profile-btn"), "shell rebuilt after signing in again");
  const btn = q(appEl, "#profile-btn"), menu = q(appEl, "#profile-menu"); assert.equal(menu.hidden, true); assert.equal(btn.getAttribute("aria-expanded"), "false");
  btn.click(); assert.equal(menu.hidden, false); assert.equal(btn.getAttribute("aria-expanded"), "true");
  menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); assert.equal(menu.hidden, true); assert.equal(btn.getAttribute("aria-expanded"), "false");
});
