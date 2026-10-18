#!/usr/bin/env python3
"""End-to-end acceptance checks against a RUNNING SmartBill stack (backend + Postgres + prediction service).
Standard library only. Creates throwaway users/bills: run it against a LOCAL or TEST database, never production.

    python3 scripts/acceptance.py                       # http://localhost:8080
    python3 scripts/acceptance.py --base https://x.onrender.com
    python3 scripts/acceptance.py --python-down         # after stopping the prediction service: checks graceful failure

STATUS: written but not executed by the author (no running backend was available). Read failures literally, then send me the output.
"""
import argparse, datetime as dt, http.cookiejar, json, sys, urllib.error, urllib.request, uuid

p = argparse.ArgumentParser()
p.add_argument("--base", default="http://localhost:8080")
p.add_argument("--python-down", action="store_true", help="prediction service is stopped: only check graceful degradation")
args = p.parse_args()
BASE = args.base.rstrip("/")
results = []


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Accept": "application/json", "X-SmartBill-Client": "acceptance"})
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with self.op.open(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw) if raw else None
            except ValueError:
                return e.code, raw.decode(errors="replace")


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"   <- {detail}"))
    return ok


def need(name, ok, detail=""):
    if not check(name, ok, detail):
        print("\nStopping: later steps depend on this one.")
        sys.exit(1)


today = dt.date.today()
iso = lambda d: d.isoformat()
tag = uuid.uuid4().hex[:8]
a = Client()

print(f"SmartBill acceptance run against {BASE} (tag {tag})\n")
s, b = a.call("GET", "/health")
need("backend is up (/health)", s == 200, f"{s} {b}")
s, b = a.call("GET", "/health/db")
need("database reachable (/health/db)", s == 200, f"{s} {b}")

# 1. register + login --------------------------------------------------------
s, b = a.call("POST", "/api/auth/register", {"email": f"alice-{tag}@test.example", "password": "Passw0rd!x1", "fullName": "Alice Test"})
need("1. register works and signs the user in", s == 201, f"{s} {b}")
s, b = a.call("GET", "/api/auth/me")
check("1. session cookie authenticates /me", s == 200 and b.get("email") == f"alice-{tag}@test.example", f"{s} {b}")
s, _ = Client().call("GET", "/api/bills")
check("1. unauthenticated request is rejected (401)", s == 401, s)
s, _ = a.call("POST", "/api/auth/logout")
s2, _ = a.call("GET", "/api/auth/me")
check("1. logout clears the session", s in (200, 204) and s2 == 401, f"{s} {s2}")
s, b = a.call("POST", "/api/auth/login", {"email": f"alice-{tag}@test.example", "password": "Passw0rd!x1"})
need("1. login works", s == 200, f"{s} {b}")

if args.python_down:
    # 11. graceful degradation ------------------------------------------------
    s, b = a.call("POST", "/api/bills", {"name": "Water", "category": "WATER", "expectedAmount": "450", "variable": True, "frequency": "MONTHLY", "anchorDate": iso(today.replace(day=1))})
    need("create a bill", s == 201, f"{s} {b}")
    s, b = a.call("POST", "/api/predictions/run", {"billId": b["id"]})
    check("11. forecast fails with a clear 503 when Python is down", s == 503 and "unavailable" in json.dumps(b).lower(), f"{s} {b}")
    s, _ = a.call("GET", "/api/bills")
    check("11. normal bill management still works", s == 200, s)
    print("\n" + ("ALL PASSED" if all(results) else f"{results.count(False)} FAILED"))
    sys.exit(0 if all(results) else 1)

# 2-3. create variable bill with 7 past months; persistence --------------------
anchor = (today.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
for _ in range(6):
    anchor = (anchor - dt.timedelta(days=1)).replace(day=1)
anchor = anchor.replace(day=10)
s, bill = a.call("POST", "/api/bills", {"name": "Electricity", "category": "ELECTRICITY", "provider": "Test Power", "expectedAmount": "1400.00", "variable": True,
                                         "frequency": "MONTHLY", "anchorDate": iso(anchor)})
need("2. create a bill", s == 201 and bill["id"], f"{s} {bill}")
bid = bill["id"]
s, got = a.call("GET", f"/api/bills/{bid}")
check("3. bill is persisted and readable", s == 200 and got["name"] == "Electricity" and str(got["expectedAmount"]).startswith("1400"), f"{s} {got}")
s, hist = a.call("GET", f"/api/bills/{bid}/history")
need("3. billing cycles were generated", s == 200 and len(hist) >= 7, f"{s} {len(hist or [])} cycles")
past = sorted([c for c in hist if c["dueDate"] < iso(today)], key=lambda c: c["dueDate"])
check("3. cycles are not duplicated (unique due dates)", len({c["dueDate"] for c in hist}) == len(hist))

# 4. dashboard + calendar -----------------------------------------------------
month_start = today.replace(day=1)
month_end = (month_start + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
s, cal = a.call("GET", f"/api/calendar?from={iso(month_start)}&to={iso(month_end)}")
check("4. calendar returns this month's bill with a labelled amount kind", s == 200 and any(i["title"] == "Electricity" and i["amountKind"] in ("EXPECTED", "PREDICTED", "CONFIRMED") for i in cal), f"{s} {cal}")
s, summ = a.call("GET", "/api/analytics/summary")
check("4. dashboard summary loads and has an overdue figure", s == 200 and "overdue" in summ and summ["overdue"]["count"] >= 1, f"{s} {summ}")

# 5-6. actual amounts, payment, outstanding, idempotency, overpay -----------------
amounts = ["1180.00", "1260.00", "1390.00", "1530.00", "1560.00", "1420.00", "1310.00", "1440.00"]
for c, amt in zip(past, amounts):
    s, _ = a.call("PUT", f"/api/cycles/{c['id']}", {"actualAmount": amt})
    need(f"set actual amount {amt} for cycle due {c['dueDate']}", s == 200, s)
c0 = past[0]
pay = {"billingCycleId": c0["id"], "amount": "500.00", "paidOn": iso(today), "method": "UPI", "transactionRef": "UTR-TEST", "idempotencyKey": f"key-{tag}"}
s, p1 = a.call("POST", "/api/payments", pay)
need("5. record a partial payment", s == 201, f"{s} {p1}")
s, p2 = a.call("POST", "/api/payments", pay)
check("5. repeating the same submission returns the SAME payment (no duplicate)", s == 201 and p2["id"] == p1["id"], f"{s} {p2}")
s, cyc = a.call("GET", f"/api/cycles/{c0['id']}")
check("6. outstanding = bill amount - payment (1180 - 500 = 680)", s == 200 and float(cyc["outstandingAmount"]) == 680.0 and cyc["partiallyPaid"], f"{s} {cyc}")
s, b = a.call("POST", "/api/payments", {**pay, "amount": "9999.00", "idempotencyKey": f"over-{tag}"})
check("6. paying more than outstanding is refused (422)", s == 422, f"{s} {b}")
s, _ = a.call("POST", f"/api/payments/{p1['id']}/reverse", {"reason": "acceptance test"})
s2, cyc = a.call("GET", f"/api/cycles/{c0['id']}")
check("6. reversing restores the full outstanding amount", s == 200 and float(cyc["outstandingAmount"]) == 1180.0, f"{s} {cyc}")

# 7-8. forecast generated by the real Python service, then visible ----------------
s, pred = a.call("POST", "/api/predictions/run", {"billId": bid})
need("7. forecast generated (is the prediction service running?)", s == 200 and pred["forecastAmount"] is not None, f"{s} {pred}")
check("7. forecast is labelled PREDICTED and explains itself", pred["kind"] == "PREDICTED" and len(pred["explanation"]) > 20 and pred["observationsUsed"] >= 7, pred)
s, saved = a.call("GET", f"/api/predictions?billId={bid}")
check("8. saved forecast is listed", s == 200 and any(x["id"] == pred["id"] for x in saved), f"{s} {saved}")
s, an = a.call("POST", "/api/predictions/anomaly-check", {"cycleId": past[-1]["id"]})
check("7. anomaly check works on a confirmed amount", s == 200 and an["status"] in ("OK", "INSUFFICIENT_HISTORY"), f"{s} {an}")

# 9. reminders without duplicates -------------------------------------------------
s, g1 = a.call("POST", "/api/notifications/generate")
s2, n1 = a.call("GET", "/api/notifications")
s3, g2 = a.call("POST", "/api/notifications/generate")
s4, n2 = a.call("GET", "/api/notifications")
check("9. reminders generated (overdue bills exist)", s == 200 and g1["created"] >= 1 and len(n1) >= 1, f"{s} {g1}")
check("9. running it again creates NO duplicates", s3 == 200 and g2["created"] == 0 and len(n2) == len(n1), f"{g2} {len(n1)}->{len(n2)}")

# 10. user isolation ----------------------------------------------------------------
b_client = Client()
s, _ = b_client.call("POST", "/api/auth/register", {"email": f"bob-{tag}@test.example", "password": "Passw0rd!x1", "fullName": "Bob Test"})
need("10. second user registered", s == 201, s)
checks = [("GET", f"/api/bills/{bid}"), ("GET", f"/api/bills/{bid}/history"), ("GET", f"/api/bills/{bid}/payments"), ("GET", f"/api/cycles/{c0['id']}"), ("PUT", f"/api/bills/{bid}")]
valid_bill = {"name": "Hijack", "category": "OTHER", "expectedAmount": "1", "frequency": "MONTHLY", "anchorDate": iso(today)}
for m, path in checks:
    s, _ = b_client.call(m, path, valid_bill if m == "PUT" else None)
    check(f"10. other user gets 404 for {m} {path}", s == 404, s)
s, _ = b_client.call("POST", "/api/payments", {**pay, "idempotencyKey": f"x-{tag}"})
check("10. other user cannot pay someone else's cycle", s == 404, s)
s, _ = b_client.call("POST", "/api/predictions/run", {"billId": bid})
check("10. other user cannot forecast someone else's bill", s == 404, s)
s, lst = b_client.call("GET", "/api/bills")
check("10. other user's bill list is empty", s == 200 and lst == [], lst)
s, _ = b_client.call("PATCH", f"/api/notifications/{n1[0]['id']}/read")
check("10. other user cannot mark someone else's notification read", s == 404, s)

# 12. month-end schedule correct (C++ engine or Java fallback: both must agree) ----------
yr = today.year - 1
s, me = a.call("POST", "/api/bills", {"name": "Month-end test", "category": "OTHER", "expectedAmount": "100", "frequency": "MONTHLY", "anchorDate": f"{yr}-01-31"})
need("12. create a bill anchored on the 31st", s == 201, f"{s} {me}")
s, h = a.call("GET", f"/api/bills/{me['id']}/history")
dues = sorted(c["dueDate"] for c in h)[:5]
want = [f"{yr}-01-31", f"{yr}-02-{29 if yr % 4 == 0 and (yr % 100 or yr % 400 == 0) else 28}", f"{yr}-03-31", f"{yr}-04-30", f"{yr}-05-31"]
check("12. 31st-of-month schedule: Jan 31, Feb 28/29, Mar 31, Apr 30, May 31 (no drift)", dues == want, f"{dues} != {want}")
print("      (To confirm WHICH engine ran, search the backend log: 'Schedule computed by Java fallback' means C++ was NOT used.)")

print("\n" + ("ALL PASSED" if all(results) else f"{results.count(False)} FAILED"))
sys.exit(0 if all(results) else 1)
