"""SmartBill prediction service. Stateless: it never touches the database - Java sends the history, gets numbers back."""
from __future__ import annotations

import hmac
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from . import anomaly as anomaly_mod
from . import forecast as forecast_mod
from .money import to_money
from .schemas import (AnomalyRequest, AnomalyResponse, CandidateScore, Interval, PredictRequest, PredictResponse,
                      ValidationInfo)

VERSION = "1.0.0"
log = logging.getLogger("smartbill.prediction")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

docs_on = os.environ.get("ENABLE_DOCS", "false").lower() == "true"
app = FastAPI(title="SmartBill Prediction Service", version=VERSION,
              docs_url="/docs" if docs_on else None, redoc_url=None, openapi_url="/openapi.json" if docs_on else None)


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Service-to-service auth: `Authorization: Bearer <PREDICTION_SERVICE_TOKEN>`.
    Refuses everything when no token is configured, unless ALLOW_NO_AUTH=true (local development only)."""
    expected = os.environ.get("PREDICTION_SERVICE_TOKEN", "")
    if not expected:
        if os.environ.get("ALLOW_NO_AUTH", "false").lower() == "true":
            return
        raise HTTPException(status_code=503, detail="Service token is not configured")
    supplied = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing service token")


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"error": "Unexpected server error"})


@app.get("/health")
def health():
    return {"status": "UP", "service": "smartbill-prediction", "version": VERSION}


@app.post("/predict", response_model=PredictResponse, response_model_by_alias=True, dependencies=[Depends(require_token)])
def predict(req: PredictRequest) -> PredictResponse:
    amounts = [float(p.amount) for p in req.history]
    f = forecast_mod.forecast(amounts, req.forecast_period_start, req.forecast_period_end, req.expected_amount)
    interval = None
    if f.interval:
        interval = Interval(lower=f.interval[0], upper=f.interval[1], level=forecast_mod.INTERVAL_LEVEL,
                            basis=f.interval_note or "")
    validation = None
    if f.validation:
        v = f.validation
        validation = ValidationInfo(
            folds=v.folds, selected_method=v.selected, selected_mae=to_money(v.selected_mae),
            baseline_method=forecast_mod.BASELINE, baseline_mae=to_money(v.baseline_mae),
            candidates=[CandidateScore(method=m, mae=to_money(e)) for m, e in v.candidates])
    return PredictResponse(
        bill_id=req.bill_id, status=f.status, forecast_amount=f.amount,
        forecast_period_start=req.forecast_period_start, forecast_period_end=req.forecast_period_end,
        generated_at=datetime.now(timezone.utc), currency=req.currency, method=f.method,
        observations_used=f.observations, data_quality=f.quality, interval=interval, validation=validation,
        explanation=f.explanation)


@app.post("/detect-anomalies", response_model=AnomalyResponse, response_model_by_alias=True,
          dependencies=[Depends(require_token)])
def detect_anomalies(req: AnomalyRequest) -> AnomalyResponse:
    r = anomaly_mod.detect([float(p.amount) for p in req.history], float(req.observed.amount),
                           req.threshold_pct, req.min_history, float(req.min_absolute_change),
                           label=req.bill_name or "This bill")
    return AnomalyResponse(
        bill_id=req.bill_id, status=r.status, is_anomaly=r.is_anomaly, direction=r.direction,
        observed_amount=req.observed.amount,
        baseline_amount=to_money(r.baseline) if r.baseline is not None else None,
        baseline_method=f"MEDIAN_LAST_{anomaly_mod.BASELINE_WINDOW}", deviation_pct=r.deviation_pct,
        typical_variation=to_money(r.typical_variation) if r.typical_variation is not None else None,
        robust_score=r.robust_score, threshold_pct=req.threshold_pct, sample_size=r.sample_size,
        generated_at=datetime.now(timezone.utc), explanation=r.explanation)
