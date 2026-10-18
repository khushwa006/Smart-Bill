import { get, post, ApiError } from "./api.js";
import { parseHash, match, routes, navigate } from "./router.js";
import { buildShell, setActiveNav, setBell } from "./shell.js";
import { getState, setState } from "./store.js";
import { render, html, errorBox, skeleton, toast } from "./ui.js";

let appEl, mainEl = null, navToken = 0, ctrl = null, bellTimer = null;

async function loadUser() {
  try { const user = await get("/api/auth/me"); setState({ user }); return user; }
  catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
}

async function refreshBell() {
  if (!getState().user) return;
  try { const { count } = await get("/api/notifications/unread-count"); setState({ unread: count }); setBell(appEl, count); } catch { /* bell is best effort */ }
}
export { refreshBell };

export async function logout() {
  try { await post("/api/auth/logout"); } catch { /* cookie may already be gone */ }
  clearInterval(bellTimer); setState({ user: null, unread: 0 }); mainEl = null; appEl.innerHTML = ""; navigate("/login");
}

async function route() {
  const token = ++navToken;
  if (ctrl) ctrl.abort(); ctrl = new AbortController();
  const { path, query } = parseHash(location.hash);
  let found = match(path);
  if (!found) { found = { route: routes.find((r) => r.path === "/dashboard"), params: {} }; }
  const { route: r, params } = found;
  let user = getState().user;
  if (r.layout !== "auth" && !user) { user = await loadUser(); if (token !== navToken) return; if (!user) return navigate("/login"); }
  if (r.layout === "auth") {
    if (!user) user = await loadUser();
    if (token !== navToken) return;
    if (user) return navigate("/dashboard");
    mainEl = null; appEl.innerHTML = ""; document.title = "Sign in · SmartBill";
    const root = document.createElement("div"); root.className = "auth-wrap"; appEl.appendChild(root);
    return mount(r, root, { params, query, user: null, signal: ctrl.signal }, token);
  }
  if (!mainEl || !appEl.contains(mainEl)) {
    mainEl = buildShell(appEl, user, logout);
    refreshBell(); clearInterval(bellTimer); bellTimer = setInterval(refreshBell, 60000); bellTimer?.unref?.();   // unref: lets Node-based tests exit; no-op in browsers
  }
  setActiveNav(appEl, r.nav); document.title = `${r.title} · SmartBill`;
  const page = document.createElement("div");            // fresh container per navigation: no stale listeners
  mainEl.replaceChildren(page); render(page, skeleton(4));
  await mount(r, page, { params, query, user, signal: ctrl.signal }, token);
  if (token === navToken && mainEl) mainEl.focus({ preventScroll: true });   // mainEl is null if the session expired mid-load
}

async function mount(r, root, ctx, token) {
  try {
    const mod = await r.page();
    if (token !== navToken) return;
    ctx.root = root; ctx.reload = () => route(); ctx.refreshBell = refreshBell; ctx.route = r;
    await mod.page(ctx);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    if (token !== navToken) return;
    if (e instanceof ApiError && e.status === 401) return;           // handled by auth:expired
    render(root, html`<div class="stack">${errorBox(e)}</div>`);
    root.querySelector('[data-action="retry"]')?.addEventListener("click", () => route());
  }
}

export function start(el) {
  appEl = el;
  document.addEventListener("auth:expired", () => {
    if (!getState().user) return;
    setState({ user: null, unread: 0 }); mainEl = null; appEl.innerHTML = ""; toast("Your session has ended. Please sign in again.", "error"); navigate("/login");
  });
  window.addEventListener("hashchange", route);
  return route();
}
