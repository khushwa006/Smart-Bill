import { html, render, icon, esc } from "./ui.js";
import { fmtDate, todayIso } from "./dates.js";

const NAV = [
  ["dashboard", "Dashboard", "dashboard"], ["bills", "Bills", "bills"], ["subscriptions", "Subscriptions", "repeat"],
  ["calendar", "Calendar", "calendar"], ["payments", "Payments", "payments"], ["insights", "Predictions", "insights"],
  ["analytics", "Analytics", "analytics"], ["notifications", "Notifications", "bell"], ["settings", "Settings", "settings"],
];
const BOTTOM = ["dashboard", "bills", "calendar", "subscriptions", "notifications"];

export function buildShell(app, user, onLogout) {
  const nav = NAV.map(([id, text, ic]) => html`<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${text}</span></a>`);
  const bottom = NAV.filter(([id]) => BOTTOM.includes(id)).map(([id, text, ic]) => html`<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${text}</span></a>`);
  render(app, html`
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="app">
      <aside class="sidebar"><a class="brand" href="#/dashboard" aria-label="SmartBill home"><span class="brand-mark" aria-hidden="true">₹</span><span>SmartBill</span></a>
        <nav class="nav" aria-label="Main">${nav}</nav></aside>
      <header class="topbar"><span class="today" id="today-label"></span><span class="spacer"></span>
        <a class="icon-btn" href="#/notifications" aria-label="Notifications" id="bell">${icon("bell")}<span class="badge-dot" id="bell-count" hidden></span></a>
        <div class="profile"><button class="icon-btn" id="profile-btn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">${icon("user")}</button>
          <div class="menu" id="profile-menu" hidden><div class="small muted" style="padding:.5rem .75rem" id="profile-who"></div>
            <a href="#/settings">Settings</a><button type="button" id="logout-btn">Sign out</button></div></div></header>
      <main class="main" id="main" tabindex="-1"></main>
      <nav class="bottomnav" aria-label="Main (mobile)">${bottom}</nav>
    </div>`);
  const $ = (id) => app.querySelector("#" + id);
  $("today-label").textContent = fmtDate(todayIso(user.timezone), true);
  $("profile-who").textContent = `${user.fullName} · ${user.email}`;
  const btn = $("profile-btn"), menu = $("profile-menu");
  const setMenu = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { setMenu(false); btn.focus(); } });
  $("logout-btn").addEventListener("click", onLogout);
  return app.querySelector("#main");
}

export function setActiveNav(app, id) {
  app.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}
export function setBell(app, count) {
  const el = app.querySelector("#bell-count"); if (!el) return;
  el.hidden = count <= 0; el.textContent = count > 99 ? "99+" : String(count);
  app.querySelector("#bell")?.setAttribute("aria-label", count > 0 ? `Notifications, ${count} unread` : "Notifications");
}
