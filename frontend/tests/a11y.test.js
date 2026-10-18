import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupDom, fakeApi, freshRoot, flush, q, qa, USER, bill, cycle, summary, calItem } from "./helpers.js";

setupDom();
const here = path.dirname(fileURLToPath(import.meta.url)), jsDir = path.join(here, "../js");
const ctx = (o = {}) => ({ root: freshRoot(), user: USER, params: {}, query: {}, signal: undefined, refreshBell() {}, ...o });
const sub = { id: 3, serviceName: "StreamBox", category: "OTT_STREAMING", amount: 649, frequency: "MONTHLY", state: "ACTIVE", nextRenewalDate: "2026-11-05", startDate: "2026-03-05", estimatedMonthlyCost: 649, estimatedAnnualCost: 7788 };
globalThis.fetch = fakeApi({ "GET /api/analytics/summary": summary(), "GET /api/bills": [bill()], "GET /api/bills/1": bill(), "GET /api/calendar": [calItem()], "GET /api/cycles": [cycle()],
  "GET /api/bills/1/history": [cycle()], "GET /api/bills/1/payments": [], "GET /api/subscriptions": [sub], "GET /api/payments": [], "GET /api/preferences": { defaultReminderDays: [7], dueSoonDays: 7, inAppEnabled: true, notifyOverdue: true, notifyRenewals: true, notifyAnomalies: true, anomalyThresholdPct: 20 },
  "GET /api/notifications": [], "GET /api/predictions": [], "GET /api/predictions/anomalies": [], "GET /api/analytics/trends": { months: [{ month: "2026-10", paid: 5, billedActual: 5, billedChangePct: null }], note: "" },
  "GET /api/analytics/subscriptions": { byCategory: [], possibleOverlaps: [], estimatedSavings: {} } });

const PAGES = [["login", {}], ["dashboard", {}], ["bills", {}], ["bill-form", {}], ["bill-detail", { params: { id: "1" } }], ["subscriptions", {}], ["subscription-form", {}], ["calendar", {}],
  ["payments", {}], ["insights", {}], ["analytics", {}], ["notifications", {}], ["settings", {}]];

function accessibleName(el) {
  return (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim() || (el.querySelector("img[alt]")?.alt ?? "");
}
for (const [name, extra] of PAGES) {
  test(`a11y: ${name} page has labelled controls, named buttons/links, unique ids and one h1`, async () => {
    const c = ctx(extra); const p = (await import(`../js/pages/${name}.js`)).page(c); await p; await flush(40);
    const root = c.root;
    for (const el of qa(root, "input:not([type=hidden]), select, textarea")) {
      const labelled = (el.id && q(root, `label[for="${el.id}"]`)) || el.getAttribute("aria-label") || el.closest("label");
      assert.ok(labelled, `${name}: control #${el.id || el.name} has no label`);
    }
    for (const el of qa(root, "button, a[href]")) assert.ok(accessibleName(el), `${name}: ${el.tagName} without an accessible name: ${el.outerHTML.slice(0, 80)}`);
    const ids = qa(root, "[id]").map((e) => e.id); assert.equal(new Set(ids).size, ids.length, `${name}: duplicate ids ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
    for (const el of qa(root, "[aria-describedby]")) for (const id of el.getAttribute("aria-describedby").split(/\s+/)) assert.ok(q(root, `[id="${id}"]`), `${name}: aria-describedby points to missing #${id}`);
    for (const t of qa(root, "table")) { assert.ok(q(t, "caption"), `${name}: table without caption`); assert.ok(qa(t, "th[scope]").length > 0, `${name}: table headers without scope`); }
    for (const cv of qa(root, "canvas")) assert.ok(cv.getAttribute("role") === "img" && cv.getAttribute("aria-label"), `${name}: canvas needs a text alternative`);
    if (name !== "login") assert.equal(qa(root, "h1").length, 1, `${name}: expected exactly one h1`);
  });
}

test("a11y: dialogs are labelled and focus moves into them", async () => {
  const c = ctx({ params: { id: "1" } }); await (await import("../js/pages/bill-detail.js")).page(c);
  q(c.root, '[data-action="pay"]').click(); const d = document.querySelector("dialog"); assert.ok(d.getAttribute("aria-labelledby")); assert.ok(q(d, `#${d.getAttribute("aria-labelledby")}`));
  assert.ok(d.contains(document.activeElement), "focus is inside the dialog"); for (const el of qa(d, "input, select, textarea")) assert.ok(q(d, `label[for="${el.id}"]`));
});

test("a11y: html shell declares language, viewport, skip link target and no inline event handlers", () => {
  const html = fs.readFileSync(path.join(here, "../index.html"), "utf8");
  assert.match(html, /<html lang="en">/); assert.match(html, /name="viewport"/); assert.doesNotMatch(html, /\son\w+=/i); assert.match(html, /<noscript>/);
  const css = fs.readFileSync(path.join(here, "../css/base.css"), "utf8"); assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/);
});

test("bundle: every import resolves to a real file and every routed page exports page()", async () => {
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : f.name.endsWith(".js") && files.push(path.join(d, f.name)); })(jsDir);
  for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:from\s+|import\()\s*["'](\.[^"']+)["']/g)) assert.ok(fs.existsSync(path.resolve(path.dirname(f), m[1])), `${path.relative(jsDir, f)} imports missing ${m[1]}`);
  const { routes } = await import("../js/router.js");
  for (const r of routes) assert.equal(typeof (await r.page()).page, "function", `${r.path} does not export page()`);
});

test("security: no eval, no document.write, no localStorage tokens, no inline scripts with secrets", () => {
  const src = fs.readdirSync(jsDir, { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(jsDir, f), "utf8")).join("\n");
  assert.doesNotMatch(src, /\beval\(|new Function\(|document\.write\(/); assert.doesNotMatch(src, /localStorage|sessionStorage/); assert.doesNotMatch(src, /Authorization|Bearer|password.*=.*["']\w{6,}["']/i);
});
