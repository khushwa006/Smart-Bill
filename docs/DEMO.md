# Demo script (about 6 minutes)
Setup: stack running, demo user created (`APP_DEMO_ENABLED=true`, your own `DEMO_PASSWORD`). Sign in as `demo@smartbill.example`.

1. **Dashboard (45 s).** "SmartBill answers what to pay and when." Point at the red overdue banner, the 14-day ribbon, and the rule: *solid = confirmed, dashed = expected or predicted*. Note "₹X expected, not yet confirmed".
2. **Bills (45 s).** Search "elec", filter a category, sort by amount. Open **Electricity**: confirmed amounts chart, billing history with statuses.
3. **Payment (60 s).** Record a partial payment on an overdue cycle (UPI, reference). Show the status stays Overdue with "Partly paid", outstanding drops. Double-click Save: only one payment (idempotency). Reverse it with a reason: outstanding returns; history keeps the record.
4. **Forecast (60 s).** Predictions page > "Forecast next bill" for Electricity. The card is dashed and says Predicted; read the explanation (method, number of bills, test results). Then "Check latest bill": explain it only flags bills outside their normal range.
5. **Python outage (30 s).** Stop the prediction service, click Forecast again: clear "temporarily unavailable" message; open Bills: everything else still works.
6. **Calendar (45 s).** Month, week, list. Filter to subscriptions. Predicted amounts are dashed pills.
7. **Subscriptions (45 s).** Estimated monthly/yearly cost (labelled estimates), overlap warning (two streaming services), "What if I cancelled" savings. Cancel one: read the dialog that says SmartBill never contacts the provider.
8. **Notifications (30 s).** "Check for new reminders", then again: nothing duplicated.
9. **Security (30 s).** Register a second account: it sees none of this data; guessing IDs returns 404.
