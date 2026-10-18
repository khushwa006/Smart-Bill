import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token-123"}


def hist(values, start_month=1):
    return [{"date": f"2026-{start_month + i:02d}-18", "amount": v} for i, v in enumerate(values)]


def predict_body(values, **extra):
    body = {"billId": 7, "history": hist(values), "forecastPeriodStart": "2026-11-18", "forecastPeriodEnd": "2026-12-17"}
    body.update(extra)
    return body


def test_health_is_open_and_minimal():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "UP"


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "test-token-123"},
                                     {"Authorization": "Basic test-token-123"}])
def test_endpoints_require_the_service_token(headers):
    assert client.post("/predict", json=predict_body([1, 2, 3]), headers=headers).status_code == 401
    assert client.post("/detect-anomalies", json={}, headers=headers).status_code == 401


def test_refuses_when_token_not_configured(monkeypatch):
    monkeypatch.delenv("PREDICTION_SERVICE_TOKEN")
    assert client.post("/predict", json=predict_body([1, 2, 3])).status_code == 503


def test_predict_happy_path_contract():
    r = client.post("/predict", json=predict_body([1300, 1400, 1470, 1390]), headers=AUTH)
    assert r.status_code == 200
    j = r.json()
    for key in ["billId", "status", "forecastAmount", "forecastPeriodStart", "forecastPeriodEnd", "generatedAt", "currency",
                "method", "observationsUsed", "dataQuality", "interval", "explanation"]:
        assert key in j
    assert j["forecastAmount"] == "1420.00" and j["method"] == "MOVING_AVERAGE_3"
    assert j["observationsUsed"] == 4 and j["currency"] == "INR" and j["dataQuality"] == "LOW"
    assert j["generatedAt"].endswith("Z")


def test_predict_cold_start_returns_no_number():
    j = client.post("/predict", json=predict_body([]), headers=AUTH).json()
    assert j["status"] == "INSUFFICIENT_DATA" and j["forecastAmount"] is None and j["observationsUsed"] == 0


def test_predict_sorts_history_by_date():
    body = predict_body([1000, 1100, 1500])
    body["history"].reverse()
    j = client.post("/predict", json=body, headers=AUTH).json()
    assert j["forecastAmount"] == "1200.00"          # mean of all three regardless of input order


def test_predict_includes_validation_block_when_enough_data():
    vals = [1000 + 50 * i for i in range(12)]
    body = {"billId": 1, "history": [{"date": f"2025-{i + 1:02d}-18", "amount": v} for i, v in enumerate(vals)],
            "forecastPeriodStart": "2026-01-18", "forecastPeriodEnd": "2026-02-17"}
    j = client.post("/predict", json=body, headers=AUTH).json()
    assert j["method"] == "LINEAR_REGRESSION" and j["validation"]["baselineMethod"] == "MOVING_AVERAGE_3"
    assert j["interval"] is not None and j["interval"]["level"] == 0.8


@pytest.mark.parametrize("mutate,why", [
    (lambda b: b["history"].append(dict(b["history"][0])), "duplicate dates"),
    (lambda b: b["history"][0].update(amount=-5), "negative amount"),
    (lambda b: b["history"][0].update(amount="abc"), "non-numeric amount"),
    (lambda b: b["history"][0].update(amount="1.234"), "more than 2 decimals"),
    (lambda b: b["history"][0].update(date="2026-02-30"), "impossible date"),
    (lambda b: b.update(currency="USD"), "wrong currency"),
    (lambda b: b.update(billId=0), "bad bill id"),
    (lambda b: b.update(forecastPeriodEnd="2026-11-01"), "period reversed"),
    (lambda b: b.update(unexpected=1), "unknown field"),
    (lambda b: b.update(history=[{"date": "2025-01-01", "amount": 1}] * 241), "too many points"),
    (lambda b: b["history"].append({"date": "2027-01-01", "amount": 5}), "history after the forecast period"),
])
def test_predict_rejects_invalid_input(mutate, why):
    body = predict_body([1000, 1100, 1200])
    mutate(body)
    assert client.post("/predict", json=body, headers=AUTH).status_code == 422, why


def anomaly_body(observed, values=(1400, 1450, 1380, 1420, 1460, 1390, 1430, 1410), **extra):
    body = {"billId": 3, "billName": "Electricity", "observed": {"date": "2026-10-18", "amount": observed},
            "history": hist(list(values))}
    body.update(extra)
    return body


def test_anomaly_flagged_response_contract():
    j = client.post("/detect-anomalies", json=anomaly_body(1830), headers=AUTH).json()
    assert j["isAnomaly"] is True and j["direction"] == "HIGH" and j["status"] == "OK"
    assert j["baselineAmount"] == "1415.00" and j["baselineMethod"] == "MEDIAN_LAST_12"
    assert j["deviationPct"] == 29.33 and j["sampleSize"] == 8 and j["thresholdPct"] == 20.0
    assert j["explanation"].startswith("Electricity of ₹1,830.00 is 29.3% above")


def test_anomaly_not_flagged_and_insufficient_history():
    assert client.post("/detect-anomalies", json=anomaly_body(1500), headers=AUTH).json()["isAnomaly"] is False
    j = client.post("/detect-anomalies", json=anomaly_body(9000, values=(1, 2)), headers=AUTH).json()
    assert j["status"] == "INSUFFICIENT_HISTORY" and j["isAnomaly"] is False and j["baselineAmount"] is None


def test_anomaly_custom_threshold_and_validation():
    assert client.post("/detect-anomalies", json=anomaly_body(1500, thresholdPct=5, minAbsoluteChange=10), headers=AUTH).json()["isAnomaly"]
    assert client.post("/detect-anomalies", json=anomaly_body(1500, thresholdPct=0), headers=AUTH).status_code == 422
    assert client.post("/detect-anomalies", json=anomaly_body(1500, minHistory=1), headers=AUTH).status_code == 422
    late = anomaly_body(1500)
    late["observed"]["date"] = "2026-01-01"
    assert client.post("/detect-anomalies", json=late, headers=AUTH).status_code == 422


def test_server_errors_do_not_leak_details(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.forecast_mod, "forecast", lambda *a, **k: 1 / 0)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/predict", json=predict_body([1, 2, 3]), headers=AUTH)
    assert r.status_code == 500 and r.json() == {"error": "Unexpected server error"}
