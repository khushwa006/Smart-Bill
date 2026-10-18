# SmartBill: intelligent bill and subscription management

SmartBill shows **what you need to pay, when, how much your recurring commitments cost, and what your next bills are likely to be**.
It is not an expense tracker: it is built around due dates, billing cycles, renewals and forecasts. Currency: INR (₹).

```
Browser ──► Vercel (static frontend: HTML/CSS/JS + Chart.js)
               │  /api/*  (rewrite, same origin)
               ▼
           Render: Spring Boot 3 / Java 17  ──► Neon PostgreSQL (Flyway migrations)
               │   ├── HTTP + bearer token ──► Render: Python FastAPI (forecasts, anomalies; stateless)
               │   └── process call (no shell) ► C++17 schedule engine (falls back to Java if unavailable)
```
Java owns all business rules and is the only component that touches the database.

## Repository
| Path | What |
|---|---|
| `frontend/` | vanilla JS app, 14 pages, 85 tests (`npm test`) |
| `backend/` | Spring Boot: auth, bills, cycles, subscriptions, payments, calendar, analytics, notifications, predictions client |
| `database/` | Flyway migrations (`migrations/`), schema checks (`tests/`) |
| `prediction-service/` | Python forecasting + anomaly detection, 60 tests, `openapi.json` |
| `native-engine/` | C++17 recurrence engine, CMake, 43 unit + CLI tests |
| `scripts/` | `verify-local.sh` (all runnable checks), `acceptance.py` (end-to-end against a running stack) |
| `docs/` | per-stage notes, `VIVA.md`, `DEMO.md` |
| `render.yaml`, `docker-compose.yml`, `.env.example` | deployment and configuration |

## Run everything locally
```bash
export JWT_SECRET=$(openssl rand -base64 48)
APP_DEMO_ENABLED=true DEMO_PASSWORD='choose-your-own' docker compose up --build     # db + python + backend(+C++)
cd frontend && python3 -m http.server 5173                                            # http://localhost:5173
```
Demo account (synthetic data): `demo@smartbill.example` with the password you set in `DEMO_PASSWORD`. There is no default password.
Without Docker: see `docs/stage2-backend.md` (Postgres + `mvn spring-boot:run`) and `prediction-service/README.md`.

## Deploy (free tiers are enough)
1. **Neon:** create a project (Postgres 16). Copy the *pooled* host for the app and the *direct* host if you run migrations separately. Build the JDBC URL as `jdbc:postgresql://<host>/<db>?sslmode=require`; username and password go in separate variables. See `docs/stage1-database.md`.
2. **Render, Python service:** New > Blueprint from this repo (`render.yaml`), or a Web Service with root `prediction-service`. Set `PREDICTION_SERVICE_TOKEN` (`openssl rand -hex 32`).
3. **Render, Java backend:** Docker web service, Dockerfile `backend/Dockerfile`, context = repo root. Set the variables in `.env.example` (DATABASE_*, JWT_SECRET, FRONTEND_ORIGIN, PREDICTION_SERVICE_URL/TOKEN). Flyway applies the schema on first start. Health check: `/health`.
4. **Vercel:** import the repo, set *Root Directory* to `frontend`, no build command. In `vercel.json` replace `YOUR-BACKEND` with your Render hostname, and set `window.SMARTBILL_API_BASE = ""` in `frontend/config.js` so the browser only ever talks to your Vercel domain (no cross-site cookie problems).
5. Verify: `python3 scripts/acceptance.py --base https://<your-vercel-domain>` (creates throwaway users: use a test database).

## Verification status (honest)
Run `sh scripts/verify-local.sh` for the live version of this table.
| Component | Status |
|---|---|
| SQL migrations + 14 constraint/isolation/status checks (PostgreSQL 16) | **verified** |
| C++ engine: build with strict warnings, 43 unit tests, 16+ CLI contract tests | **verified** |
| Java <-> C++ integration (19 checks) incl. every fallback path; 2,000-case random cross-check, 0 mismatches | **verified** |
| Python service: 60 tests, live HTTP run with auth | **verified** |
| Frontend: 85 jsdom tests (forms, flows, calendar, a11y, security), mutation-checked | **verified** |
| Java backend (Spring wiring, JPA mapping, security, Flyway at startup), Java prediction client | **written, NOT compiled** (Maven Central was unreachable): run `cd backend && mvn test` |
| Backend Dockerfile, docker-compose, render.yaml, vercel.json | **written, not run** |
| End-to-end acceptance (`scripts/acceptance.py`) | **written, not run** |
| Real browser rendering (layout, colours, responsive, Chart.js) | **never seen on a screen** |
| Neon connectivity, Render and Vercel deployments, live URLs | **not done: no access** |

## Known limitations
Email reminders are not implemented (in-app only). Subscription renewals have no per-renewal paid state. Listing/filtering is in memory per user.
Logout cannot revoke an already-copied JWT before it expires (8 h). Render's free Python instance sleeps, so the first forecast after idle can time out (retry).
Cancelling a subscription in SmartBill never contacts the provider. No real bank/payment integration exists or is claimed.
