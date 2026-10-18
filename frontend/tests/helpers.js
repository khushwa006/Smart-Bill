import { JSDOM } from "jsdom";

export function setupDom(url = "http://localhost/") {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url, pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ["window", "document", "location", "navigator", "HTMLElement", "CustomEvent", "Event", "MouseEvent", "KeyboardEvent", "URLSearchParams"]) {
    try { Object.defineProperty(globalThis, k, { value: k === "window" ? w : w[k] ?? globalThis[k], configurable: true, writable: true }); } catch { /* read-only global in this Node version */ }
  }
  w.Chart = FakeChart;
  return dom;
}

export class FakeChart {
  static instances = [];
  constructor(canvas, cfg) { this.canvas = canvas; this.cfg = cfg; FakeChart.instances.push(this); }
  destroy() { this.destroyed = true; }
}

export const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const flush = async (ms = 260) => { await sleep(ms); };   // lets debounced handlers + promises settle

/** In-memory fake of the SmartBill API. routes: { "GET /api/bills": (req) => body | {status, body} } */
export function fakeApi(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    const method = (opts.method || "GET").toUpperCase();
    const req = { method, path: u.pathname, query: Object.fromEntries(u.searchParams), queryAll: u.searchParams, body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers || {}, credentials: opts.credentials };
    calls.push(req);
    let handler = routes[`${method} ${u.pathname}`];
    if (!handler) for (const [k, h] of Object.entries(routes)) { const [m, pat] = k.split(" "); if (m === method && pat.includes(":")) { const re = new RegExp("^" + pat.replace(/:[^/]+/g, "([^/]+)") + "$"); const mm = re.exec(u.pathname); if (mm) { req.params = mm.slice(1); handler = h; break; } } }
    if (!handler) return respond(404, { error: `no mock for ${method} ${u.pathname}` });
    let out = typeof handler === "function" ? await handler(req) : handler;
    if (out && out.__status) return respond(out.__status, out.body);
    return respond(200, out ?? null, out === undefined);
  };
  fn.calls = calls;
  fn.called = (method, path) => calls.filter((c) => c.method === method && c.path === path);
  return fn;
}
export const status = (code, body) => ({ __status: code, body });
function respond(code, body, empty = false) {
  if (code === 204 || (code === 200 && body === null && empty)) return { ok: true, status: 204, json: async () => null };
  return { ok: code >= 200 && code < 300, status: code, json: async () => body };
}

export const q = (root, sel) => root.querySelector(sel);
export const qa = (root, sel) => [...root.querySelectorAll(sel)];
export const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
export function submit(form) { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); }
export function type(el, value) { el.value = value; el.dispatchEvent(new window.Event("input", { bubbles: true })); el.dispatchEvent(new window.Event("change", { bubbles: true })); }
export function freshRoot() { document.body.querySelectorAll("dialog").forEach((d) => d.remove()); document.getElementById("toasts")?.remove(); const r = document.createElement("div"); document.body.appendChild(r); return r; }

// ---- fixtures
export const USER = { id: 1, email: "asha@example.in", fullName: "Asha Rao", timezone: "Asia/Kolkata", demo: false };
export const bill = (o = {}) => ({ id: 1, name: "Internet", category: "INTERNET", provider: "FiberNet", expectedAmount: 799, variable: false, frequency: "MONTHLY", customIntervalValue: null,
  customIntervalUnit: null, anchorDate: "2026-01-18", monthEndAnchored: false, endDate: null, reminderDays: null, notes: null, active: true, ...o });
export const cycle = (o = {}) => ({ id: 10, billId: 1, billName: "Internet", category: "INTERNET", provider: "FiberNet", periodStart: "2026-09-18", periodEnd: "2026-10-17", issueDate: null,
  dueDate: "2026-10-18", expectedAmount: 799, actualAmount: null, amountPayable: 799, amountConfirmed: false, paidAmount: 0, outstandingAmount: 799, partiallyPaid: false, status: "DUE_TODAY", notes: null, ...o });
export const summary = (o = {}) => ({ asOf: "2026-10-18", overdue: { amount: 0, count: 0 }, dueNext7Days: { confirmed: 799, expected: 0, count: 1 }, dueNext30Days: { confirmed: 799, expected: 1400, count: 2 },
  renewalsNext30Days: { amount: 1500, count: 1 }, paidLast30Days: 5000, recurringMonthlyEstimate: { bills: 2000, subscriptions: 2500, total: 4500, kind: "ESTIMATE" },
  recurringAnnualEstimate: { total: 54000, kind: "ESTIMATE" }, predictedNext30Days: 1450, anomaliesLast90Days: 0, ...o });
export const calItem = (o = {}) => ({ type: "BILL", id: 10, refId: 1, title: "Internet", category: "INTERNET", date: "2026-10-18", amount: 799, amountKind: "EXPECTED", status: "DUE_TODAY", outstanding: 799, ...o });
