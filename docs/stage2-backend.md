# Stage 2 — Spring Boot core (STATUS: written, NOT compiled)

Maven Central was unreachable from the authoring environment, so `mvn` could not download Spring Boot.
**Nothing in `backend/` has been compiled or run by Maven.** Treat the first `mvn test` on your machine as the real verification.

## Run it
```bash
# 1. local throwaway Postgres (Docker) - NOT Neon production
docker run -d --name sb-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=smartbill -p 5432:5432 postgres:16
# 2. env (Linux/macOS; on Windows use $env:NAME="value")
export DATABASE_URL=jdbc:postgresql://localhost:5432/smartbill
export DATABASE_USERNAME=postgres DATABASE_PASSWORD=pw
export JWT_SECRET=$(openssl rand -base64 32)
export COOKIE_SECURE=false FRONTEND_ORIGIN=http://localhost:5173
# 3. unit tests, then DB-backed integration tests, then run
cd backend && mvn test
RUN_DB_TESTS=true mvn test          # runs ApiIntegrationTest against the DB above
mvn spring-boot:run                 # Swagger UI: http://localhost:8080/swagger-ui.html
```
Flyway applies `../database/migrations` automatically (copied into the jar at build time).
If Maven reports an error, send it as a screenshot or paste and I will fix it.

## What is implemented
| Area | Endpoints |
|---|---|
| Auth/profile | `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `PUT /api/profile`, `POST /api/profile/password` |
| Bills | `GET/POST /api/bills`, `GET/PUT/DELETE /api/bills/{id}` (`?confirm=true`), `GET /api/bills/{id}/history`, `GET /api/bills/{id}/payments` |
| Cycles | `GET /api/cycles?from&to&status`, `GET/PUT /api/cycles/{id}` (set actual amount, issue date, waive) |
| Subscriptions | CRUD + `PATCH /api/subscriptions/{id}/state` (pause/resume/cancel; internal record only) |
| Payments | `GET/POST /api/payments`, `POST /api/payments/{id}/reverse` |
| Health | `GET /health` (no DB), `GET /health/db` |

Not yet in Stage 2: calendar, analytics, predictions, notifications scheduler, C++ integration, demo seed.

## Security decisions
- JWT in an **HttpOnly, Secure, SameSite=None** cookie (never readable by JS). Passwords: BCrypt (cost 12).
- CSRF: disabled in Spring but replaced by a required `X-SmartBill-Client` header on every non-GET `/api` call (forces a CORS preflight, which only `FRONTEND_ORIGIN` passes). **The frontend must send it.**
- Ownership: every repository lookup filters by `user_id`; the DB also blocks cross-user links via composite foreign keys. Other users' IDs return 404.
- Login: 5 failures lock the account 15 minutes; one generic error message; dummy hash compare for unknown emails.
- Payments: row-locked cycle, amount <= outstanding, idempotency key, reversal instead of delete.
- Trade-offs: logout cannot revoke an already-copied JWT before expiry (8 h default). Cross-site cookies can be blocked by Safari/Brave when frontend (vercel.app) and API (onrender.com) are different sites; the planned fix is a Vercel rewrite that proxies `/api` so the browser sees one site (Stage 6).

## Verification status
| Item | Status |
|---|---|
| `RecurrenceCalculator` logic (month-end, leap years, custom, invalid) | **Verified**: 20/20 via `java -cp ... RecurrenceCheck` (see `backend/tools/`) with JDK 21 |
| All `src/main` Java files parse (no syntax errors) | **Verified** with `javac` parse pass (semantic errors cannot be checked without dependencies) |
| Compilation against Spring/Hibernate, JUnit tests, integration tests, Flyway at startup, Hibernate schema validation | **UNVERIFIED** |
| Neon connectivity | **UNVERIFIED** |

Run the recurrence check without Maven:
```bash
mkdir -p /tmp/o && javac -d /tmp/o backend/src/main/java/com/smartbill/common/{Enums,RecurrenceCalculator}.java backend/tools/RecurrenceCheck.java && java -cp /tmp/o RecurrenceCheck
```

## Known limitations / likely first failures
- Entities use public fields for brevity (Hibernate field access). Refactor to getters if your viva requires strict encapsulation.
- Bill/subscription search, filter and sort run in memory per user (fine for personal scale; move to SQL if data grows).
- Cycle generation runs on create/update only; the scheduled job (Stage 5/6 notifications) will extend the horizon.
- Subscription renewals are not yet auto-rolled into new cycles.
