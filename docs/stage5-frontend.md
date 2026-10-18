# Stage 5 - Frontend (+ the backend endpoints it needs)

## Frontend: verified here
Node 22 + jsdom 25 with a fake API. **85/85 tests pass** (`cd frontend && npm test`):
| Area | What is checked |
|---|---|
| Core | dates (month-end clamping, leap days, week/month grid, time zones), INR formatting, HTML escaping (XSS), validators, router, API client (credentials, CSRF header, friendly error mapping, session-expiry event) |
| Auth | empty/invalid forms, success, wrong password, register, duplicate email |
| Bills | loading skeleton, list with next-due status, filters/search/sort sent to API, empty vs no-match states, error + retry, add/edit form validation, custom interval, month-end option, exact request bodies, server field errors |
| Payments | dialog prefilled, single idempotency key per dialog, validation, over-limit server error keeps dialog open, reverse needs a reason, outstanding list, filters |
| Subscriptions | estimates labelled, filters, cancel says it only updates SmartBill, form, detail + history |
| Calendar | exactly 42 visible days requested, prev/next/today, week + list views, filters, "+N more", dashed predicted pills, error + retry |
| Predictions / analytics | dashed forecasts, 503 explained while page keeps working, confirmed vs expected vs predicted vs estimated metrics, charts get gaps (not zeros) for missing months, what-if savings |
| Notifications / settings | unread highlight, read / read-all / check-now, preference validation and exact payload, profile, password |
| App | sign-in redirect, shell + bell count, navigation without stacked listeners, unknown route, load failure retry, sign-out, mid-session expiry, menu keyboard |
| Accessibility | 13 pages: every control labelled, named buttons/links, unique ids, aria-describedby targets exist, tables have captions + scoped headers, charts have text alternatives, one h1, dialogs labelled with focus inside |
| Security / bundle | no eval/document.write/storage/tokens in JS; every import resolves; every route exports `page()` |

**Test quality check:** 8 deliberate bugs were injected (CSRF header removed, dashed styling removed, idempotency key dropped, escaping disabled, forecast not dashed, wrong week step, cancel wording claiming a real cancellation, filters not applied): the suite failed each time and passed again after restoring. Tests also found two real bugs, now fixed (a crash when the session expires during page load, missing table captions).
Static serving was checked over HTTP: index, CSS, config, vendored Chart.js and page modules return 200 with correct types.

## Frontend: NOT verified
- **No real browser was available.** Layout, colours, responsive breakpoints, focus rings, real `<dialog>` modals, Chart.js rendering and the Google Font were never seen on a screen. Please open it on desktop and a phone and screenshot anything that looks wrong; I will fix it.
- Screen-reader behaviour and colour contrast were reasoned about (token contrast ratios are documented in `tokens.css`) but not measured with a tool.

## Backend endpoints added for the UI (Java, written, NOT compiled)
`GET /api/calendar` (bills + subscription renewals; amountKind CONFIRMED/EXPECTED/PREDICTED/SCHEDULED), `GET /api/analytics/summary|trends|subscriptions`,
`GET /api/notifications`, `.../unread-count`, `PATCH .../{id}/read`, `POST .../read-all`, `POST .../generate`, `GET/PUT /api/preferences`,
`GET /api/subscriptions/{id}/events`, `GET /api/predictions/anomalies`, hourly `NotificationScheduler`, opt-in `DemoSeeder`.
- Reminder dedup: deterministic `event_key` + `UNIQUE(user_id, event_key)` + `ON CONFLICT DO NOTHING`; a missed run still sends one reminder for the smallest window that covers the days left.
- Verified with javac only: Java syntax parses; `Money.inr` matches the Python/JS formatter (7/7). Everything else needs `mvn test`.
- Demo data: set `APP_DEMO_ENABLED=true` and `DEMO_PASSWORD=<your own>` once; creates `demo@smartbill.example` with synthetic bills/subscriptions. No default password exists. Forecasts are not seeded; click "Forecast" and the real Python service computes them.

## Known limitations
- Email reminders are not implemented (UI says so); reminders are in-app only.
- Subscription renewals have no per-renewal "paid" state: past renewal dates show as "Past".
- Bill/subscription filtering runs in memory per user (fine for personal use).
- Cross-site cookies: use the `vercel.json` `/api` rewrite (set `window.SMARTBILL_API_BASE = ""` in `config.js`) so the browser sees one site; replace `YOUR-BACKEND` with your Render hostname.
