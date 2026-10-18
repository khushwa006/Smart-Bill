# SmartBill frontend

Plain HTML, CSS and JavaScript (ES modules). No framework and no build step. Chart.js 4.4.7 is vendored in `vendor/`.

```bash
npm install            # only needed for tests (jsdom)
npm test               # 85 tests
python3 -m http.server 5173   # then open http://localhost:5173
```
Local backend: `COOKIE_SECURE=false FRONTEND_ORIGIN=http://localhost:5173` (see `.env.example`). `config.js` points at `http://localhost:8080`.

## Layout
- `index.html` shell; `config.js` runtime API base (public values only); `vercel.json` headers + `/api` proxy rewrite.
- `css/` tokens, base, layout, components. `js/` api, router, shell, ui helpers, dates, charts, `pages/` (one module per screen).
- Pages: login/register, dashboard, bills, add/edit bill, bill details + billing history, subscriptions, add/edit subscription, subscription details, calendar (month/week/list), payments, predictions, analytics, notifications, settings.

## Design rule that matters
**Solid = confirmed money. Dashed outline + label = expected, predicted, scheduled or estimated.** Forecasts are always drawn dashed and called "Predicted"; a prediction can never look like a bill.

## Security notes
No tokens in JavaScript or browser storage (HttpOnly cookie). All dynamic text is escaped by the `html` template tag. Every write sends `X-SmartBill-Client`. CSP in `vercel.json` blocks inline scripts and third-party scripts.
