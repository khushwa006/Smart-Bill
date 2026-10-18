import { get, post } from "../api.js";
import { fmtDate } from "../dates.js";
import { html, render, pageHead, inr, label, emptyState, skeleton, errorBox, bind, raw, toast } from "../ui.js";
import { forecastCard } from "./shared.js";

export async function page(ctx) {
  const { root, signal } = ctx;
  let results = "";   // newest result card(s) shown above the table
  async function draw() {
    const [bills, cycles, preds, flags] = await Promise.all([get("/api/bills", { active: true }, signal), get("/api/cycles", null, signal), get("/api/predictions", null, signal), get("/api/predictions/anomalies", null, signal)]);
    const latestConfirmed = new Map();
    cycles.filter((c) => c.amountConfirmed).forEach((c) => { const cur = latestConfirmed.get(c.billId); if (!cur || c.dueDate > cur.dueDate) latestConfirmed.set(c.billId, c); });
    const confirmedCount = new Map();
    cycles.filter((c) => c.amountConfirmed).forEach((c) => confirmedCount.set(c.billId, (confirmedCount.get(c.billId) || 0) + 1));
    const names = new Map(bills.map((b) => [b.id, b.name]));
    const sorted = [...bills].sort((a, b) => Number(b.variable) - Number(a.variable) || a.name.localeCompare(b.name));
    render(root, html`${pageHead("Predictions", "Forecasts and unusual-bill checks, based on the bill amounts you've confirmed.")}
      <div class="alert info" style="margin-bottom:1rem"><div class="grow">Forecasts are estimates and are always shown with a dashed outline. They never replace a real bill. SmartBill only learns from amounts you have confirmed.</div></div>
      <div id="results" aria-live="polite" class="stack" style="margin-bottom:1rem">${raw(results)}</div>
      ${bills.length === 0 ? html`<div class="card">${emptyState({ title: "Add a bill to get forecasts", text: "Forecasts need a bill and a few confirmed past amounts.", action: '<a class="btn primary" href="#/bills/new">Add a bill</a>' })}</div>`
      : html`<section class="card flush" aria-labelledby="b-h"><div style="padding:1rem 1rem 0"><h2 id="b-h">Your bills</h2></div><div class="table-wrap"><table class="table"><caption class="sr-only">Forecast and check actions for each bill</caption>
        <thead><tr><th scope="col">Bill</th><th scope="col" class="right">Confirmed amounts</th><th scope="col" class="right">Latest confirmed</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${sorted.map((b) => { const lc = latestConfirmed.get(b.id); return html`<tr><td><a class="rowlink" href="#/bills/${b.id}">${b.name}</a><div class="muted small">${label(b.category)}${b.variable ? " · varies each time" : " · fixed amount"}</div></td>
          <td class="right num">${confirmedCount.get(b.id) || 0}</td><td class="right num">${lc ? html`${inr(lc.amountPayable)}<div class="muted small">${fmtDate(lc.dueDate)}</div>` : "—"}</td>
          <td class="right"><div class="row" style="justify-content:flex-end"><button class="btn small primary" data-action="forecast" data-id="${b.id}">Forecast next bill</button>
            <button class="btn small" data-action="check" data-id="${lc ? lc.id : ""}" ${lc ? "" : raw("disabled")}>Check latest bill</button></div></td></tr>`; })}</tbody></table></div></section>`}
      <section class="card flush" style="margin-top:1rem" aria-labelledby="s-h"><div style="padding:1rem 1rem 0"><h2 id="s-h">Saved forecasts</h2></div>
        ${preds.length === 0 ? emptyState({ title: "No forecasts saved yet", text: "Choose \u201cForecast next bill\u201d above. Each forecast is saved here with how it was calculated." })
        : html`<ul class="list">${preds.map((p) => html`<li class="dashed" style="margin:.5rem 1rem;border-radius:10px;border:1px dashed var(--pred)"><div><strong>${names.get(p.billId) || "Bill"}</strong> <span class="chip pred">Predicted</span>
          <div class="muted small">For ${fmtDate(p.forecastPeriodStart)} to ${fmtDate(p.forecastPeriodEnd)} · ${p.method.toLowerCase().replace(/_/g, " ")} · ${p.observationsUsed} past bill${p.observationsUsed === 1 ? "" : "s"}</div><div class="small">${p.explanation}</div></div>
          <span class="num amt">${inr(p.forecastAmount)}</span></li>`)}</ul>`}</section>
      <section class="card flush" style="margin-top:1rem" aria-labelledby="a-h"><div style="padding:1rem 1rem 0"><h2 id="a-h">Unusual bills found</h2></div>
        ${flags.length === 0 ? emptyState({ title: "Nothing unusual so far", text: "Use \u201cCheck latest bill\u201d to compare a confirmed amount with that bill's own history. Bills are flagged only when they stand out from their normal range." })
        : html`<ul class="list">${flags.map((a) => html`<li><div><a class="rowlink" href="#/bills/${a.billId}"><strong>${a.billName}</strong></a> <span class="chip ${a.direction === "HIGH" ? "bad" : "info"}">${a.direction === "HIGH" ? "Higher than usual" : "Lower than usual"}</span><div class="small">${a.explanation}</div></div><span class="muted small">${fmtDate(a.dueDate)}</span></li>`)}</ul>`}</section>`);
  }
  bind(root, {
    forecast: async (el) => {
      el.disabled = true;
      try { const p = await post("/api/predictions/run", { billId: Number(el.dataset.id) }); results = forecastCard(p).toString() + results; }
      catch (e) { results = `<div class="alert error" role="alert"><div class="grow">${html`${e.message}`}</div></div>` + results; }
      await draw();
    },
    check: async (el) => {
      if (!el.dataset.id) return; el.disabled = true;
      try { const r = await post("/api/predictions/anomaly-check", { cycleId: Number(el.dataset.id) }); results = `<div class="alert ${r.anomaly ? "warn" : "info"}"><div class="grow">${html`${r.explanation}`}</div></div>` + results; }
      catch (e) { results = `<div class="alert error" role="alert"><div class="grow">${html`${e.message}`}</div></div>` + results; }
      await draw();
    }, retry: () => draw(),
  });
  await draw();
}
