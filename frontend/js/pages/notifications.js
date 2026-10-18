import { get, patch, post } from "../api.js";
import { fmtDate } from "../dates.js";
import { html, render, pageHead, emptyState, skeleton, errorBox, bind, toast, label } from "../ui.js";

const TYPE = { BILL_DUE: ["warn", "Bill due"], BILL_OVERDUE: ["bad", "Overdue"], SUBSCRIPTION_RENEWAL: ["info", "Renewal"], ANOMALY: ["bad", "Unusual amount"], PREDICTION: ["pred", "Forecast"] };
const target = (n) => (n.subscriptionId ? `#/subscriptions/${n.subscriptionId}` : n.billingCycleId ? `#/payments` : null);

export async function page(ctx) {
  const { root, signal } = ctx;
  let unreadOnly = false;
  render(root, html`${pageHead("Notifications", "Reminders for bills, renewals and unusual amounts.", html`<button class="btn" data-action="generate">Check for new reminders</button><button class="btn" data-action="readall">Mark all as read</button>`.toString())}
    <div class="segmented" role="group" aria-label="Filter notifications" style="margin-bottom:1rem"><button data-action="filter" data-unread="false" aria-pressed="true">All</button><button data-action="filter" data-unread="true" aria-pressed="false">Unread</button></div>
    <div id="list" aria-live="polite"></div>`);
  const list = root.querySelector("#list");
  async function load() {
    root.querySelectorAll("[data-unread]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.unread === "true") === unreadOnly)));
    render(list, skeleton(3));
    try {
      const items = await get("/api/notifications", { unreadOnly }, signal);
      if (!items.length) return render(list, html`<div class="card">${emptyState({ title: unreadOnly ? "You're all caught up" : "No notifications yet", text: unreadOnly ? "No unread reminders." : "Reminders appear here before bills fall due, when a subscription is about to renew, and when a bill looks unusual. Choose \u201cCheck for new reminders\u201d to look now." })}</div>`);
      render(list, html`<div class="card flush"><ul class="list">${items.map((n) => { const [cls, text] = TYPE[n.type] || ["muted", label(n.type)]; const href = target(n); return html`<li class="${n.read ? "" : "unread"}">
        <div><span class="chip ${cls}">${text}</span> ${n.read ? "" : html`<span class="sr-only">Unread.</span>`}<div><strong>${n.title}</strong></div><div class="small muted">${n.message}</div><div class="small muted">${fmtDate(n.createdAt.slice(0, 10))}</div></div>
        <div class="row">${href ? html`<a class="btn small" href="${href}">Open</a>` : ""}${n.read ? "" : html`<button class="btn small" data-action="read" data-id="${n.id}">Mark as read</button>`}</div></li>`; })}</ul></div>`);
    } catch (e) { if (e.name === "AbortError") return; render(list, errorBox(e)); }
  }
  bind(root, {
    filter: (el) => { unreadOnly = el.dataset.unread === "true"; load(); },
    read: async (el) => { try { await patch(`/api/notifications/${el.dataset.id}/read`); await load(); ctx.refreshBell(); } catch (e) { toast(e.message, "error"); } },
    readall: async () => { try { await post("/api/notifications/read-all"); await load(); ctx.refreshBell(); } catch (e) { toast(e.message, "error"); } },
    generate: async (el) => {
      el.disabled = true;
      try { const r = await post("/api/notifications/generate"); toast(r.created ? `${r.created} new reminder${r.created === 1 ? "" : "s"}` : "No new reminders right now", r.created ? "success" : "info"); await load(); ctx.refreshBell(); }
      catch (e) { toast(e.message, "error"); } finally { el.disabled = false; }
    }, retry: () => load(),
  });
  await load();
}
