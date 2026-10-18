"""Pins the exact JSON shapes the Java backend (PredictionDtos.java) sends and expects."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token-123"}

# Jackson serialises BigDecimal as a bare JSON number and LocalDate as an ISO string; null optionals are omitted or null.
JAVA_PREDICT = {
    "billId": 12, "currency": "INR",
    "history": [{"date": "2026-06-18", "amount": 1234.56}, {"date": "2026-07-18", "amount": 1300.00},
                {"date": "2026-08-18", "amount": 1400}, {"date": "2026-09-18", "amount": 1500.5}],
    "forecastPeriodStart": "2026-10-18", "forecastPeriodEnd": "2026-11-17", "expectedAmount": None,
}
JAVA_PREDICT_FIELDS = {"billId", "status", "forecastAmount", "forecastPeriodStart", "forecastPeriodEnd", "generatedAt",
                       "currency", "method", "observationsUsed", "dataQuality", "interval", "validation", "explanation"}
JAVA_ANOMALY_FIELDS = {"billId", "status", "isAnomaly", "direction", "observedAmount", "baselineAmount", "baselineMethod",
                       "deviationPct", "typicalVariation", "robustScore", "thresholdPct", "sampleSize", "generatedAt", "explanation"}


def test_predict_accepts_java_payload_and_returns_every_field_java_reads():
    r = client.post("/predict", json=JAVA_PREDICT, headers=AUTH)
    assert r.status_code == 200
    j = r.json()
    assert set(j) == JAVA_PREDICT_FIELDS               # nothing missing, nothing unexpected for the Java record
    assert j["forecastPeriodStart"] == "2026-10-18" and j["observationsUsed"] == 4
    assert j["forecastAmount"] == "1400.17"            # mean(1300, 1400, 1500.5)
    assert j["generatedAt"].endswith("Z")              # parseable as java.time.Instant


def test_predict_without_optional_fields_and_with_empty_history():
    body = {k: v for k, v in JAVA_PREDICT.items() if k != "expectedAmount"}
    body["history"] = []
    j = client.post("/predict", json=body, headers=AUTH).json()
    assert j["status"] == "INSUFFICIENT_DATA" and j["forecastAmount"] is None
    assert set(j) == JAVA_PREDICT_FIELDS


def test_anomaly_accepts_java_payload_and_returns_every_field_java_reads():
    hist = [{"date": f"2026-{m:02d}-18", "amount": a} for m, a in
            zip(range(1, 9), [1400, 1450.00, 1380, 1420, 1460, 1390, 1430, 1410])]
    body = {"billId": 12, "billName": "Electricity", "observed": {"date": "2026-10-18", "amount": 1830.00},
            "history": hist, "thresholdPct": 20.0}
    r = client.post("/detect-anomalies", json=body, headers=AUTH)
    assert r.status_code == 200 and set(r.json()) == JAVA_ANOMALY_FIELDS
    assert r.json()["isAnomaly"] is True
    insufficient = client.post("/detect-anomalies", json={**body, "history": hist[:2]}, headers=AUTH).json()
    assert set(insufficient) == JAVA_ANOMALY_FIELDS and insufficient["baselineAmount"] is None
