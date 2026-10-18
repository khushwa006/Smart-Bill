# Stage 4 — Python prediction service + Java integration

## Verified here (Python 3.12, FastAPI 0.143, pandas 3.0.2, numpy 2.4.4, scikit-learn 1.8.0)
| Check | Result |
|---|---|
| `pytest` (forecasting, validation without leakage, interval rules, anomaly rules, INR formatting, API auth/validation, error handling, Java JSON contract) | **60/60 passed** |
| Service started with `uvicorn` on a real port and called over HTTP with curl: `/health` 200, no/wrong token 401, `/predict` correct, `/detect-anomalies` flags a spike with numbers | passed |
| Exported OpenAPI contract: `prediction-service/openapi.json` (3 paths) | generated from the live service |

## Written but NOT compiled (needs `mvn test` on your machine)
`backend/.../prediction/`: `PredictionClient` (RestClient, timeouts, bearer token), `PredictionService`, `PredictionController`, DTOs.
- `POST /api/predictions/run {billId}` - history = confirmed amounts only (`actual_amount` set, not waived); forecast period = the next cycle without an actual amount.
- `GET /api/predictions?billId=` - stored forecasts. Every item has `kind: "PREDICTED"`.
- `POST /api/predictions/anomaly-check {cycleId}` - uses the user's `anomaly_threshold_pct`; anomalies saved in `anomaly_flags` (one per cycle).
- Java validates the Python response (bill id, currency, observation count matches what was sent, period echoed, quality/method whitelist, interval ordering) before saving. Only `OK`/`PRELIMINARY` forecasts are stored; `INSUFFICIENT_DATA` and `NOT_A_FORECAST` are returned but never stored.
- **Python down / slow / misconfigured:** every failure becomes HTTP 503 "prediction service unavailable" on the prediction endpoints only; bills, payments, subscriptions keep working. (Implemented in code, unverified until the Java tests run.)
- The JSON shapes Java sends/expects are pinned by `tests/test_java_contract.py` on the Python side.

## Still unverified end to end
Java -> Python -> Neon (needs Maven + a database), acceptance steps 7, 8 and 11 from your checklist. Local run: start the Python service
(`PREDICTION_SERVICE_TOKEN=x uvicorn app.main:app --port 8000`), then the backend with `PREDICTION_SERVICE_URL=http://localhost:8000 PREDICTION_SERVICE_TOKEN=x`;
stop the Python process to test the 503 path.

## Security trade-offs
- Render private networking needs a paid private service; on a public web service the protection is the bearer token (constant-time compare, refuses all calls if unset), HTTPS, no data stored, and a size-capped, strictly validated request schema.
- Render free instances sleep: the first call after idle can exceed the 8 s Java timeout and return 503; retry works. Raise `PREDICTION_TIMEOUT_MS` or use a paid instance.
