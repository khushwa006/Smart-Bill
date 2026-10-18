-- SmartBill V2: derived billing-cycle status. Nothing here is stored; it is always computed
-- from dates + valid (non-reversed) payments, evaluated in the owning user's timezone.
--
-- amount_payable = COALESCE(actual_amount, expected_amount)
-- is_confirmed   = actual_amount IS NOT NULL   (FALSE => the amount is still an estimate)
-- status precedence: WAIVED > PAID > OVERDUE > DUE_TODAY > DUE_SOON > UPCOMING
-- A partial payment is reported separately (is_partially_paid) so an overdue cycle stays OVERDUE.
CREATE VIEW billing_cycle_status AS
WITH paid AS (
    SELECT billing_cycle_id, SUM(amount) AS paid_amount
    FROM payments
    WHERE billing_cycle_id IS NOT NULL AND reversed_at IS NULL
    GROUP BY billing_cycle_id
), base AS (
    SELECT c.*,
           b.name AS bill_name, b.category, b.provider,
           COALESCE(c.actual_amount, c.expected_amount)  AS amount_payable,
           (c.actual_amount IS NOT NULL)                 AS is_confirmed,
           COALESCE(p.paid_amount, 0)                    AS paid_amount,
           (now() AT TIME ZONE u.timezone)::date         AS today,
           COALESCE(pr.due_soon_days, 7)                 AS due_soon_days
    FROM billing_cycles c
    JOIN bills b ON b.id = c.bill_id AND b.user_id = c.user_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_preferences pr ON pr.user_id = c.user_id
    LEFT JOIN paid p ON p.billing_cycle_id = c.id
)
SELECT base.*,
       GREATEST(amount_payable - paid_amount, 0)          AS outstanding_amount,
       (paid_amount > 0 AND paid_amount < amount_payable) AS is_partially_paid,
       CASE
           WHEN is_waived                      THEN 'WAIVED'
           WHEN paid_amount >= amount_payable  THEN 'PAID'
           WHEN due_date <  today              THEN 'OVERDUE'
           WHEN due_date =  today              THEN 'DUE_TODAY'
           WHEN due_date <= today + due_soon_days THEN 'DUE_SOON'
           ELSE 'UPCOMING'
       END AS status
FROM base;
