# Stage 1 — Database (Neon PostgreSQL + Flyway)

## Neon setup
1. Create a Neon project and database (Postgres 16 or 17).
2. Connection details: copy the **pooled** host (contains `-pooler`) for the app and the **direct** host for Flyway.
3. Convert `postgresql://user:pass@host/db?sslmode=require` into `jdbc:postgresql://host/db?sslmode=require`,
   with user and password supplied separately via `DATABASE_USERNAME` / `DATABASE_PASSWORD`.
4. Set these in Render's environment settings (see `.env.example`). Never commit them.
5. Flyway runs `database/migrations/V*.sql` in order at backend startup. Never edit an applied migration; add `V3__...`.
6. Keep the Hikari pool small (e.g. max 5-10) on Neon's free tier.

## Design decisions
- Money: `NUMERIC(12,2)`. Timestamps: `TIMESTAMPTZ`. Dates are in the user's `users.timezone`.
- Ownership: child tables carry `user_id`; composite FKs `(parent_id, user_id)` make cross-user references impossible at DB level.
- No duplicate cycles: `UNIQUE(bill_id, period_start)`. No duplicate notifications: `UNIQUE(user_id, event_key)`.
- Duplicate payment submits: unique `(user_id, idempotency_key)`. Corrections: reversal (`reversed_at`), not deletion.
- Status is derived in view `billing_cycle_status`; `is_confirmed=false` means the amount is only expected.
- Demo data: NOT in migrations. A separate seed (`database/seed/`) comes in Stage 4 so predictions use the real Python service.

## Verification (actually run)
Migrations V1+V2 applied cleanly to a local PostgreSQL 16; `database/tests/verify_schema.sql`: 14/14 checks passed.
**Not verified:** connection to a real Neon instance, and Flyway execution (no Maven/Neon access here).
