-- Run AFTER migrations on a THROWAWAY database. Everything happens inside a rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE results(name text, passed boolean);

CREATE FUNCTION pg_temp.expect_error(n text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO results VALUES (n, false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES (n, true);
  END;
END $$ LANGUAGE plpgsql;

INSERT INTO users(email,password_hash,full_name) VALUES ('a@x.in','h','A'),('b@x.in','h','B');
INSERT INTO bills(user_id,name,category,expected_amount,frequency,anchor_date)
  SELECT id,'Internet','INTERNET',799,'MONTHLY','2026-10-18' FROM users WHERE email='a@x.in';
INSERT INTO billing_cycles(bill_id,user_id,period_start,period_end,due_date,expected_amount)
  SELECT id,user_id,'2026-09-18','2026-10-17','2026-10-01',799 FROM bills;

SELECT pg_temp.expect_error('duplicate email (case-insensitive) rejected',
  $q$INSERT INTO users(email,password_hash,full_name) VALUES ('A@X.IN','h','dup')$q$);
SELECT pg_temp.expect_error('duplicate billing cycle rejected',
  $q$INSERT INTO billing_cycles(bill_id,user_id,period_start,period_end,due_date,expected_amount)
     SELECT id,user_id,'2026-09-18','2026-10-17','2026-10-01',799 FROM bills$q$);
SELECT pg_temp.expect_error('cycle cannot reference another user bill',
  $q$INSERT INTO billing_cycles(bill_id,user_id,period_start,period_end,due_date,expected_amount)
     SELECT b.id,(SELECT id FROM users WHERE email='b@x.in'),'2026-11-18','2026-12-17','2026-12-01',799 FROM bills b$q$);
SELECT pg_temp.expect_error('payment cannot reference another user cycle',
  $q$INSERT INTO payments(user_id,billing_cycle_id,amount,paid_on,method)
     SELECT (SELECT id FROM users WHERE email='b@x.in'),id,100,'2026-10-02','UPI' FROM billing_cycles$q$);
SELECT pg_temp.expect_error('negative money rejected',
  $q$INSERT INTO bills(user_id,name,category,expected_amount,frequency,anchor_date)
     SELECT id,'x','RENT',-1,'MONTHLY','2026-01-01' FROM users LIMIT 1$q$);
SELECT pg_temp.expect_error('CUSTOM frequency without interval rejected',
  $q$INSERT INTO bills(user_id,name,category,expected_amount,frequency,anchor_date)
     SELECT id,'x','RENT',1,'CUSTOM','2026-01-01' FROM users LIMIT 1$q$);
SELECT pg_temp.expect_error('invalid category rejected',
  $q$INSERT INTO bills(user_id,name,category,expected_amount,frequency,anchor_date)
     SELECT id,'x','CRYPTO',1,'MONTHLY','2026-01-01' FROM users LIMIT 1$q$);
SELECT pg_temp.expect_error('payment with no target rejected',
  $q$INSERT INTO payments(user_id,amount,paid_on,method) SELECT id,10,'2026-10-02','UPI' FROM users LIMIT 1$q$);

INSERT INTO payments(user_id,billing_cycle_id,amount,paid_on,method,idempotency_key)
  SELECT user_id,id,300,'2026-10-02','UPI','k1' FROM billing_cycles;
SELECT pg_temp.expect_error('duplicate idempotency key rejected',
  $q$INSERT INTO payments(user_id,billing_cycle_id,amount,paid_on,method,idempotency_key)
     SELECT user_id,id,300,'2026-10-02','UPI','k1' FROM billing_cycles$q$);

INSERT INTO notifications(user_id,type,title,message,event_key)
  SELECT id,'BILL_DUE','t','m','CYCLE_REMINDER:1:D-3' FROM users WHERE email='a@x.in';
SELECT pg_temp.expect_error('duplicate notification event rejected',
  $q$INSERT INTO notifications(user_id,type,title,message,event_key)
     SELECT id,'BILL_DUE','t','m','CYCLE_REMINDER:1:D-3' FROM users WHERE email='a@x.in'$q$);

-- past due + 300 of 799 paid => OVERDUE, partially paid, outstanding 499
INSERT INTO results SELECT 'status OVERDUE + partial, outstanding 499',
  (status='OVERDUE' AND is_partially_paid AND outstanding_amount=499)
  FROM billing_cycle_status WHERE due_date='2026-10-01';

UPDATE payments SET reversed_at=now(), reversal_reason='entered in error';
INSERT INTO results SELECT 'reversal restores outstanding 799',
  (outstanding_amount=799 AND NOT is_partially_paid)
  FROM billing_cycle_status WHERE due_date='2026-10-01';

INSERT INTO payments(user_id,billing_cycle_id,amount,paid_on,method)
  SELECT user_id,id,799,'2026-10-03','CASH' FROM billing_cycles;
INSERT INTO billing_cycles(bill_id,user_id,period_start,period_end,due_date,expected_amount)
  SELECT bill_id,user_id,'2037-01-18','2037-02-17','2037-02-01',799 FROM billing_cycles;
INSERT INTO results SELECT 'old cycle PAID while new future cycle is UPCOMING',
  (SELECT status FROM billing_cycle_status WHERE due_date='2026-10-01')='PAID'
  AND (SELECT status FROM billing_cycle_status WHERE due_date='2037-02-01')='UPCOMING';
INSERT INTO results SELECT 'expected-only cycle has is_confirmed = false',
  NOT is_confirmed FROM billing_cycle_status WHERE due_date='2037-02-01';

SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name FROM results ORDER BY passed, name;
SELECT count(*) FILTER (WHERE NOT passed) AS failures FROM results \gset
ROLLBACK;
\if :failures
  \echo 'SCHEMA VERIFICATION FAILED'
  \quit 3
\else
  \echo 'ALL CHECKS PASSED'
\endif
