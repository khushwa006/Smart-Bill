# Viva explanation

## Architecture
Four deployable parts with one source of truth. **Java (Spring Boot)** holds all business rules and is the only code that talks to **PostgreSQL (Neon)**. **Python** is a stateless calculator: Java sends bill history, gets a forecast back. **C++** is a command-line calculator Java calls for recurring-date maths. **Vercel** serves static files and proxies `/api` to Java so the browser sees one site.
*Why separate Python/C++?* Python has the data-science libraries; C++ is a self-contained, fast, testable calculation unit. Both are optional at runtime: if Python fails only forecasts stop; if C++ fails Java computes the same dates itself.

## Database design
Money is `NUMERIC(12,2)`. A *bill* is a recurring definition; each occurrence is a **billing cycle** row (`UNIQUE(bill_id, period_start)` makes generation idempotent). **Status is derived** in a view from dates and non-reversed payments, in the user's time zone, so a paid January cycle can never make February look paid. Payments are reversed, never deleted (audit trail). Child tables carry `user_id` and use **composite foreign keys** `(parent_id, user_id)`, so cross-user links are impossible at database level, not just in code. Reminders use `UNIQUE(user_id, event_key)` for idempotency.

## Recurrence and C++
Occurrence *n* is computed from the anchor, never from the previous date: a monthly bill on the 31st gives Jan 31, Feb 28/29, Mar 31, Apr 30 with no drift. The C++ CLI takes arguments only (no shell, no stdin). Java validates inputs, starts the process with an argument list, enforces a timeout and output cap, checks the output against a strict grammar and invariants, and otherwise falls back to the Java implementation. 2,000 random schedules produce identical results in both.

## Predictions
Ladder: no data = no number; 1-2 bills = preliminary; 3-8 = average of last 3; 9+ = rolling-origin validation (train on the past, predict the next bill, never shuffle) across several methods, and a richer method is chosen only if it beats the simple average by 5% out-of-sample. An interval appears only with >= 6 out-of-sample errors. No accuracy percentage is claimed. Anomalies need history, a percentage threshold, an absolute minimum, and must fall outside the bill's own robust variation (median/MAD), so "different from last month" is not an anomaly.

## Security
BCrypt passwords; JWT in an HttpOnly, Secure cookie (not readable by JavaScript); CSRF defence via a required custom header plus restricted CORS; every query filtered by `user_id` (other users get 404); login lockout after 5 failures; payment row locks and idempotency keys; strict input validation; service token between Java and Python; secrets only in environment variables; output escaping in the frontend plus a strict CSP. Trade-off: a stolen JWT stays valid until expiry.

## Deployment
Neon (managed Postgres, SSL, pooled URL) / Render (Java in Docker with the C++ binary built in a matching Ubuntu stage; Python as a Python service) / Vercel (static). Flyway runs versioned migrations on start; nothing resets tables.

## Honest limits to mention
The Java backend was written without being able to download Maven dependencies, so it was syntax-checked but not compiled in the authoring environment; everything else has real test evidence (see README table).
