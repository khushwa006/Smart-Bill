# SmartBill prediction service (Python / FastAPI)

Stateless forecasting and anomaly detection. It never touches the database: the Java backend sends confirmed bill
history and receives numbers back, so there is no second source of truth.

## Run
```bash
pip install -r requirements-dev.txt
python -m pytest -q                                   # 60 tests
PREDICTION_SERVICE_TOKEN=change-me uvicorn app.main:app --port 8000
# local dev without a token:  ALLOW_NO_AUTH=true uvicorn app.main:app --reload
```
**Render:** build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
health check path `/health`, env `PREDICTION_SERVICE_TOKEN` (same value as the Java service). Set `ENABLE_DOCS=true`
only if you want `/docs`; the exported contract is in `openapi.json`.

## API (all but /health need `Authorization: Bearer <PREDICTION_SERVICE_TOKEN>`)
| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness, no secrets |
| `POST /predict` | forecast the next amount of one bill from its confirmed history |
| `POST /detect-anomalies` | compare one confirmed amount with that bill's own history |

### Forecast method ladder (n = confirmed past bills)
| n | Method | Notes |
|---|---|---|
| 0 | none | `INSUFFICIENT_DATA`, no number. If the user's expected amount is supplied it is returned as `NOT_A_FORECAST` |
| 1 | LAST_VALUE | `PRELIMINARY` |
| 2 | HISTORICAL_MEAN | `PRELIMINARY` |
| 3-8 | MOVING_AVERAGE_3 | no validation possible, no interval |
| >= 9 | best of MOVING_AVERAGE_3 / HISTORICAL_MEAN / MOVING_AVERAGE_6 / WEIGHTED_MOVING_AVERAGE / LINEAR_REGRESSION (and SEASONAL_NAIVE_12 once n >= 15) | chosen by **rolling-origin validation**; a richer method is used only if its out-of-sample MAE beats the 3-bill average by >= 5% |

- Rolling-origin validation: fold *t* trains on `x[:t]` and predicts `x[t]`; data is never shuffled, nothing from the future is used (unit-tested with a spy).
- Interval: only with >= 6 out-of-sample errors; it is the 80th percentile of those absolute errors around the forecast, labelled approximate.
- Quality: INSUFFICIENT (<3), LOW (3-5), MEDIUM (6-11), HIGH (12+), lowered one level for very volatile history.
- No accuracy percentage is ever reported. Evidence returned is the measured MAE per method (`validation`).

### Anomaly rule
Flagged only when **all** hold: >= `minHistory` (6) past bills; deviation from the median of the last 12 bills >= `thresholdPct` (20);
absolute change >= `minAbsoluteChange` (Rs 100); and the amount is outside the bill's own normal variation
(> 2.5 x robust sigma, sigma = 1.4826 x MAD). A bill that merely differs from last month is not flagged.

Amounts are returned as strings (`"1420.00"`), rounded half-up to paise. Dates are ISO `YYYY-MM-DD`; `generatedAt` is UTC.
