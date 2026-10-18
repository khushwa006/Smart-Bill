// Hash router (#/bills/12). Hash routing needs no server rewrite rules, so it works on any static host.
export const routes = [
  { path: "/login", page: () => import("./pages/login.js"), title: "Sign in", layout: "auth" },
  { path: "/dashboard", page: () => import("./pages/dashboard.js"), title: "Dashboard", nav: "dashboard" },
  { path: "/bills", page: () => import("./pages/bills.js"), title: "Bills", nav: "bills" },
  { path: "/bills/new", page: () => import("./pages/bill-form.js"), title: "Add bill", nav: "bills" },
  { path: "/bills/:id/edit", page: () => import("./pages/bill-form.js"), title: "Edit bill", nav: "bills" },
  { path: "/bills/:id", page: () => import("./pages/bill-detail.js"), title: "Bill details", nav: "bills" },
  { path: "/subscriptions", page: () => import("./pages/subscriptions.js"), title: "Subscriptions", nav: "subscriptions" },
  { path: "/subscriptions/new", page: () => import("./pages/subscription-form.js"), title: "Add subscription", nav: "subscriptions" },
  { path: "/subscriptions/:id/edit", page: () => import("./pages/subscription-form.js"), title: "Edit subscription", nav: "subscriptions" },
  { path: "/subscriptions/:id", page: () => import("./pages/subscription-detail.js"), title: "Subscription details", nav: "subscriptions" },
  { path: "/calendar", page: () => import("./pages/calendar.js"), title: "Calendar", nav: "calendar" },
  { path: "/payments", page: () => import("./pages/payments.js"), title: "Payments", nav: "payments" },
  { path: "/insights", page: () => import("./pages/insights.js"), title: "Predictions", nav: "insights" },
  { path: "/analytics", page: () => import("./pages/analytics.js"), title: "Analytics", nav: "analytics" },
  { path: "/notifications", page: () => import("./pages/notifications.js"), title: "Notifications", nav: "notifications" },
  { path: "/settings", page: () => import("./pages/settings.js"), title: "Settings", nav: "settings" },
];

export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "") || "/dashboard";
  const [pathPart, queryPart = ""] = raw.split("?");
  return { path: pathPart.replace(/\/+$/, "") || "/", query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

export function match(path) {
  const segs = path.split("/").filter(Boolean);
  for (const r of routes) {
    const rs = r.path.split("/").filter(Boolean);
    if (rs.length !== segs.length) continue;
    const params = {}; let ok = true;
    rs.forEach((s, i) => { if (s.startsWith(":")) params[s.slice(1)] = decodeURIComponent(segs[i]); else if (s !== segs[i]) ok = false; });
    if (ok) return { route: r, params };
  }
  return null;
}
export const navigate = (path) => { location.hash = "#" + path; };
export const link = (path) => "#" + path;
