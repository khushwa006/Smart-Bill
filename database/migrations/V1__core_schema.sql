-- SmartBill V1: core schema (PostgreSQL 15+/Neon compatible)
-- Conventions:
--   * All timestamps are TIMESTAMPTZ (stored in UTC).
--   * Due dates / periods are DATE values in the OWNING USER's timezone (users.timezone, default Asia/Kolkata).
--   * Money is NUMERIC(12,2) in INR. Never FLOAT.
--   * Billing-cycle status is DERIVED (see V2 view), not stored.
--   * user_id is carried on child tables and enforced with composite FKs so a child row
--     can never point at another user's parent row.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email              VARCHAR(254) NOT NULL,
    password_hash      VARCHAR(255) NOT NULL,
    full_name          VARCHAR(120) NOT NULL,
    timezone           VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    currency           CHAR(3)      NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    is_demo            BOOLEAN      NOT NULL DEFAULT FALSE,
    failed_login_count INTEGER      NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT users_email_format CHECK (position('@' in email) > 1)
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_preferences (
    user_id               BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_reminder_days INTEGER[] NOT NULL DEFAULT '{7,3,1,0}',
    due_soon_days         INTEGER    NOT NULL DEFAULT 7 CHECK (due_soon_days BETWEEN 1 AND 60),
    in_app_enabled        BOOLEAN    NOT NULL DEFAULT TRUE,
    email_enabled         BOOLEAN    NOT NULL DEFAULT FALSE,
    notify_overdue        BOOLEAN    NOT NULL DEFAULT TRUE,
    notify_renewals       BOOLEAN    NOT NULL DEFAULT TRUE,
    notify_anomalies      BOOLEAN    NOT NULL DEFAULT TRUE,
    anomaly_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (anomaly_threshold_pct > 0),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- bills (recurring definitions)
CREATE TABLE bills (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  VARCHAR(120) NOT NULL,
    category              VARCHAR(30)  NOT NULL CHECK (category IN (
        'ELECTRICITY','WATER','INTERNET','MOBILE_POSTPAID','MOBILE_RECHARGE','RENT','GAS',
        'INSURANCE','EDUCATION_FEES','MAINTENANCE','OTHER')),
    provider              VARCHAR(120),
    expected_amount       NUMERIC(12,2) NOT NULL CHECK (expected_amount >= 0),
    is_variable           BOOLEAN NOT NULL DEFAULT FALSE,   -- amount changes each cycle (electricity, water)
    frequency             VARCHAR(15) NOT NULL CHECK (frequency IN
        ('WEEKLY','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','CUSTOM')),
    custom_interval_value INTEGER CHECK (custom_interval_value > 0),
    custom_interval_unit  VARCHAR(10) CHECK (custom_interval_unit IN ('DAYS','WEEKS','MONTHS')),
    anchor_date           DATE NOT NULL,                    -- first due date; recurrence is computed from this
    month_end_anchored    BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE: always last day of month
    end_date              DATE,
    reminder_days         INTEGER[],                        -- NULL = use user_preferences default
    notes                 TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bills_custom_requires_interval CHECK (
        (frequency = 'CUSTOM' AND custom_interval_value IS NOT NULL AND custom_interval_unit IS NOT NULL)
        OR (frequency <> 'CUSTOM' AND custom_interval_value IS NULL AND custom_interval_unit IS NULL)),
    CONSTRAINT bills_end_after_anchor CHECK (end_date IS NULL OR end_date >= anchor_date),
    CONSTRAINT bills_id_user_unique UNIQUE (id, user_id)    -- target for composite FKs
);
CREATE INDEX idx_bills_user ON bills (user_id, is_active);
CREATE INDEX idx_bills_user_category ON bills (user_id, category);
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON bills
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- billing cycles (one row per occurrence)
CREATE TABLE billing_cycles (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bill_id          BIGINT NOT NULL,
    user_id          BIGINT NOT NULL,
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    issue_date       DATE,
    due_date         DATE NOT NULL,
    expected_amount  NUMERIC(12,2) NOT NULL CHECK (expected_amount >= 0),
    actual_amount    NUMERIC(12,2) CHECK (actual_amount >= 0),   -- NULL until the real bill is known
    is_waived        BOOLEAN NOT NULL DEFAULT FALSE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_cycle_bill_owner FOREIGN KEY (bill_id, user_id)
        REFERENCES bills (id, user_id) ON DELETE CASCADE,
    CONSTRAINT cycle_period_valid CHECK (period_end >= period_start),
    CONSTRAINT uq_cycle_bill_period UNIQUE (bill_id, period_start),   -- idempotent cycle generation
    CONSTRAINT billing_cycles_id_user_unique UNIQUE (id, user_id)
);
CREATE INDEX idx_cycles_user_due ON billing_cycles (user_id, due_date);
CREATE INDEX idx_cycles_bill_period ON billing_cycles (bill_id, period_start DESC);
CREATE TRIGGER trg_cycles_updated BEFORE UPDATE ON billing_cycles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- subscriptions
CREATE TABLE subscriptions (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_name          VARCHAR(120) NOT NULL,
    category              VARCHAR(30) NOT NULL CHECK (category IN (
        'OTT_STREAMING','MUSIC','CLOUD_STORAGE','SOFTWARE','GYM_MEMBERSHIP','LEARNING','MEMBERSHIP','OTHER')),
    provider              VARCHAR(120),
    amount                NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    frequency             VARCHAR(15) NOT NULL CHECK (frequency IN
        ('WEEKLY','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','CUSTOM')),
    custom_interval_value INTEGER CHECK (custom_interval_value > 0),
    custom_interval_unit  VARCHAR(10) CHECK (custom_interval_unit IN ('DAYS','WEEKS','MONTHS')),
    start_date            DATE NOT NULL,
    next_renewal_date     DATE,
    end_date              DATE,
    trial_end_date        DATE,
    state                 VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CHECK (state IN ('ACTIVE','PAUSED','CANCELLED','EXPIRED')),
    cancelled_at          TIMESTAMPTZ,       -- internal record only; no external provider is contacted
    reminder_days         INTEGER[],
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT subs_custom_requires_interval CHECK (
        (frequency = 'CUSTOM' AND custom_interval_value IS NOT NULL AND custom_interval_unit IS NOT NULL)
        OR (frequency <> 'CUSTOM' AND custom_interval_value IS NULL AND custom_interval_unit IS NULL)),
    CONSTRAINT subs_end_after_start CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT subs_cancelled_has_timestamp CHECK (state <> 'CANCELLED' OR cancelled_at IS NOT NULL),
    CONSTRAINT subs_active_has_renewal CHECK (state <> 'ACTIVE' OR next_renewal_date IS NOT NULL),
    CONSTRAINT subscriptions_id_user_unique UNIQUE (id, user_id)
);
CREATE INDEX idx_subs_user_state ON subscriptions (user_id, state);
CREATE INDEX idx_subs_user_renewal ON subscriptions (user_id, next_renewal_date) WHERE state = 'ACTIVE';
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscription_events (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    event_type      VARCHAR(20) NOT NULL CHECK (event_type IN
        ('CREATED','PRICE_CHANGED','PAUSED','RESUMED','CANCELLED','RENEWED','EXPIRED','EDITED')),
    old_amount      NUMERIC(12,2),
    new_amount      NUMERIC(12,2),
    note            TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_subevent_owner FOREIGN KEY (subscription_id, user_id)
        REFERENCES subscriptions (id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_subevents_sub ON subscription_events (subscription_id, occurred_at DESC);

-- ---------------------------------------------------------------- payments
-- A payment settles EITHER a billing cycle OR a subscription renewal. Corrections use reversal
-- (reversed_at set), never silent edits, so history stays auditable. "Valid" payment = reversed_at IS NULL.
CREATE TABLE payments (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    billing_cycle_id BIGINT,
    subscription_id  BIGINT,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_on          DATE NOT NULL,
    method           VARCHAR(15) NOT NULL CHECK (method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER')),
    transaction_ref  VARCHAR(100),
    note             TEXT,
    idempotency_key  VARCHAR(64),            -- client-supplied; blocks duplicate submissions
    reversed_at      TIMESTAMPTZ,
    reversal_reason  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_payment_cycle_owner FOREIGN KEY (billing_cycle_id, user_id)
        REFERENCES billing_cycles (id, user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_sub_owner FOREIGN KEY (subscription_id, user_id)
        REFERENCES subscriptions (id, user_id) ON DELETE RESTRICT,
    CONSTRAINT payment_single_target CHECK (num_nonnulls(billing_cycle_id, subscription_id) = 1),
    CONSTRAINT payment_reversal_consistent CHECK ((reversed_at IS NULL) = (reversal_reason IS NULL))
);
CREATE UNIQUE INDEX uq_payments_idempotency ON payments (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_payments_cycle ON payments (billing_cycle_id) WHERE reversed_at IS NULL;
CREATE INDEX idx_payments_sub ON payments (subscription_id) WHERE reversed_at IS NULL;
CREATE INDEX idx_payments_user_date ON payments (user_id, paid_on DESC);

-- ---------------------------------------------------------------- predictions & anomalies
CREATE TABLE predictions (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               BIGINT NOT NULL,
    bill_id               BIGINT NOT NULL,
    forecast_amount       NUMERIC(12,2) NOT NULL CHECK (forecast_amount >= 0),
    forecast_period_start DATE NOT NULL,
    forecast_period_end   DATE NOT NULL,
    currency              CHAR(3) NOT NULL DEFAULT 'INR',
    method                VARCHAR(40) NOT NULL,        -- e.g. HISTORICAL_MEAN, MOVING_AVERAGE, LINEAR_REGRESSION
    observations_used     INTEGER NOT NULL CHECK (observations_used >= 0),
    data_quality          VARCHAR(15) NOT NULL CHECK (data_quality IN ('INSUFFICIENT','LOW','MEDIUM','HIGH')),
    interval_lower        NUMERIC(12,2),               -- only when defensible; NULL otherwise
    interval_upper        NUMERIC(12,2),
    explanation           TEXT NOT NULL,
    generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_prediction_bill_owner FOREIGN KEY (bill_id, user_id)
        REFERENCES bills (id, user_id) ON DELETE CASCADE,
    CONSTRAINT prediction_period_valid CHECK (forecast_period_end >= forecast_period_start),
    CONSTRAINT prediction_interval_valid CHECK (
        (interval_lower IS NULL AND interval_upper IS NULL)
        OR (interval_lower IS NOT NULL AND interval_upper IS NOT NULL AND interval_lower <= interval_upper))
);
CREATE INDEX idx_predictions_bill ON predictions (bill_id, generated_at DESC);
CREATE INDEX idx_predictions_user ON predictions (user_id, forecast_period_start);

CREATE TABLE anomaly_flags (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    billing_cycle_id BIGINT NOT NULL,
    direction        VARCHAR(4) NOT NULL CHECK (direction IN ('HIGH','LOW')),
    observed_amount  NUMERIC(12,2) NOT NULL,
    baseline_amount  NUMERIC(12,2) NOT NULL CHECK (baseline_amount > 0),
    deviation_pct    NUMERIC(8,2) NOT NULL,
    threshold_pct    NUMERIC(5,2) NOT NULL,
    sample_size      INTEGER NOT NULL CHECK (sample_size > 0),
    explanation      TEXT NOT NULL,
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_anomaly_cycle_owner FOREIGN KEY (billing_cycle_id, user_id)
        REFERENCES billing_cycles (id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_anomaly_cycle UNIQUE (billing_cycle_id)
);
CREATE INDEX idx_anomaly_user ON anomaly_flags (user_id, detected_at DESC);

-- ---------------------------------------------------------------- notifications
-- event_key makes the scheduler idempotent, e.g. 'CYCLE_REMINDER:42:D-3', 'OVERDUE:42', 'RENEWAL:7:2026-11-01:D-1'.
CREATE TABLE notifications (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type               VARCHAR(20) NOT NULL CHECK (type IN
        ('BILL_DUE','BILL_OVERDUE','SUBSCRIPTION_RENEWAL','ANOMALY','PREDICTION')),
    title              VARCHAR(160) NOT NULL,
    message            TEXT NOT NULL,
    event_key          VARCHAR(120) NOT NULL,
    billing_cycle_id   BIGINT,
    subscription_id    BIGINT,
    is_read            BOOLEAN NOT NULL DEFAULT FALSE,
    read_at            TIMESTAMPTZ,
    email_sent_at      TIMESTAMPTZ,      -- set only after a confirmed SMTP hand-off
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_notif_cycle_owner FOREIGN KEY (billing_cycle_id, user_id)
        REFERENCES billing_cycles (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_sub_owner FOREIGN KEY (subscription_id, user_id)
        REFERENCES subscriptions (id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_notification_event UNIQUE (user_id, event_key),
    CONSTRAINT notif_read_consistent CHECK (is_read OR read_at IS NULL)
);
CREATE INDEX idx_notif_user_unread ON notifications (user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX idx_notif_user ON notifications (user_id, created_at DESC);
