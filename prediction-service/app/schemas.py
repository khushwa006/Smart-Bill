from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

MAX_HISTORY = 240
MAX_AMOUNT = Decimal("1000000000")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class HistoryPoint(CamelModel):
    date: date                                            # the bill's due date
    amount: Decimal = Field(ge=0, le=MAX_AMOUNT, decimal_places=2, allow_inf_nan=False)


def _check_history(points: list[HistoryPoint]) -> list[HistoryPoint]:
    dates = [p.date for p in points]
    if len(set(dates)) != len(dates):
        raise ValueError("history contains duplicate dates")
    return sorted(points, key=lambda p: p.date)


class PredictRequest(CamelModel):
    bill_id: int = Field(gt=0)
    currency: Literal["INR"] = "INR"
    history: list[HistoryPoint] = Field(max_length=MAX_HISTORY)   # CONFIRMED actual amounts only
    forecast_period_start: date
    forecast_period_end: date
    expected_amount: Optional[Decimal] = Field(default=None, ge=0, le=MAX_AMOUNT, decimal_places=2)

    @field_validator("history")
    @classmethod
    def _history(cls, v):
        return _check_history(v)

    @model_validator(mode="after")
    def _period(self):
        if self.forecast_period_end < self.forecast_period_start:
            raise ValueError("forecastPeriodEnd is before forecastPeriodStart")
        if self.history and self.history[-1].date >= self.forecast_period_end:
            raise ValueError("history must be older than the forecast period")
        return self


class Interval(CamelModel):
    lower: Decimal
    upper: Decimal
    level: float
    basis: str


class CandidateScore(CamelModel):
    method: str
    mae: Decimal


class ValidationInfo(CamelModel):
    folds: int
    selected_method: str
    selected_mae: Decimal
    baseline_method: str
    baseline_mae: Decimal
    candidates: list[CandidateScore]


class PredictResponse(CamelModel):
    bill_id: int
    status: Literal["OK", "PRELIMINARY", "INSUFFICIENT_DATA", "NOT_A_FORECAST"]
    forecast_amount: Optional[Decimal]
    forecast_period_start: date
    forecast_period_end: date
    generated_at: datetime
    currency: str
    method: str
    observations_used: int
    data_quality: Literal["INSUFFICIENT", "LOW", "MEDIUM", "HIGH"]
    interval: Optional[Interval] = None
    validation: Optional[ValidationInfo] = None
    explanation: str


class Observation(CamelModel):
    date: date
    amount: Decimal = Field(ge=0, le=MAX_AMOUNT, decimal_places=2, allow_inf_nan=False)


class AnomalyRequest(CamelModel):
    bill_id: int = Field(gt=0)
    bill_name: Optional[str] = Field(default=None, max_length=120)
    observed: Observation
    history: list[HistoryPoint] = Field(max_length=MAX_HISTORY)   # confirmed past bills, EXCLUDING the observed one
    threshold_pct: float = Field(default=20.0, ge=1, le=500)
    min_history: int = Field(default=6, ge=3, le=60)
    min_absolute_change: Decimal = Field(default=Decimal("100"), ge=0, le=MAX_AMOUNT)

    @field_validator("history")
    @classmethod
    def _history(cls, v):
        return _check_history(v)

    @model_validator(mode="after")
    def _order(self):
        if self.history and self.history[-1].date >= self.observed.date:
            raise ValueError("history must be older than the observed bill")
        return self


class AnomalyResponse(CamelModel):
    bill_id: int
    status: Literal["OK", "INSUFFICIENT_HISTORY", "BASELINE_ZERO"]
    is_anomaly: bool
    direction: Literal["HIGH", "LOW", "NONE"]
    observed_amount: Decimal
    baseline_amount: Optional[Decimal]
    baseline_method: str
    deviation_pct: Optional[float]
    typical_variation: Optional[Decimal]
    robust_score: Optional[float]
    threshold_pct: float
    sample_size: int
    generated_at: datetime
    explanation: str
