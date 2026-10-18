"""Bill forecasting: simple baselines first, richer methods only when data AND validation justify them.

Method ladder (n = number of confirmed past bills):
  n = 0      no forecast (or the user's own expected amount, clearly labelled as NOT a forecast)
  n = 1      LAST_VALUE            n = 2     HISTORICAL_MEAN
  3 <= n < 9 MOVING_AVERAGE_3 (mean of the last 3)
  n >= 9     rolling-origin (time-ordered) validation over several candidate methods; a richer method is
             used only if its out-of-sample MAE beats the MOVING_AVERAGE_3 baseline by >= 5%.
Nothing here shuffles data: every validation fold trains strictly on the past and predicts the next bill.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Callable, Optional, Sequence

import numpy as np
from sklearn.linear_model import LinearRegression

from .money import fmt_inr, to_money

BASELINE = "MOVING_AVERAGE_3"
MIN_TRAIN = 6          # smallest training window used in validation
MIN_FOLDS = 3          # validation needs at least this many out-of-sample predictions
MIN_FOLDS_INTERVAL = 6 # an interval is only offered with at least this many out-of-sample errors
IMPROVEMENT_REQUIRED = 0.05
INTERVAL_LEVEL = 0.8


def _mean_all(x: np.ndarray) -> float:
    return float(np.mean(x))


def _ma(k: int) -> Callable[[np.ndarray], float]:
    return lambda x: float(np.mean(x[-k:]))


def _wma(x: np.ndarray) -> float:
    v = x[-6:]
    w = np.arange(1, len(v) + 1, dtype=float)
    return float(np.dot(w, v) / w.sum())


def _linreg(x: np.ndarray) -> float:
    v = x[-12:]
    idx = np.arange(len(v)).reshape(-1, 1)
    model = LinearRegression().fit(idx, v)
    return float(model.predict(np.array([[len(v)]]))[0])


def _seasonal12(x: np.ndarray) -> float:
    return float(x[-12])


# name -> (function, minimum training length)
CANDIDATES: dict[str, tuple[Callable[[np.ndarray], float], int]] = {
    BASELINE: (_ma(3), 3),
    "HISTORICAL_MEAN": (_mean_all, 1),
    "MOVING_AVERAGE_6": (_ma(6), 6),
    "WEIGHTED_MOVING_AVERAGE": (_wma, 3),
    "LINEAR_REGRESSION": (_linreg, 6),
    "SEASONAL_NAIVE_12": (_seasonal12, 12),
}

DESCRIPTIONS = {
    "LAST_VALUE": "your only confirmed bill",
    "HISTORICAL_MEAN": "the average of all your confirmed bills",
    BASELINE: "the average of your 3 most recent confirmed bills",
    "MOVING_AVERAGE_6": "the average of your 6 most recent confirmed bills",
    "WEIGHTED_MOVING_AVERAGE": "a weighted average of your most recent bills (up to 6; newer bills count more)",
    "LINEAR_REGRESSION": "a straight-line trend fitted to your most recent bills (up to 12)",
    "SEASONAL_NAIVE_12": "the bill from the same point last year",
}


@dataclass
class Validation:
    folds: int
    selected: str
    selected_mae: float
    baseline_mae: float
    candidates: list[tuple[str, float]]


@dataclass
class Forecast:
    status: str                     # OK | PRELIMINARY | INSUFFICIENT_DATA | NOT_A_FORECAST
    amount: Optional[Decimal]
    method: str
    observations: int
    quality: str                    # INSUFFICIENT | LOW | MEDIUM | HIGH
    interval: Optional[tuple[Decimal, Decimal]] = None
    interval_note: Optional[str] = None
    validation: Optional[Validation] = None
    explanation: str = ""
    warnings: list[str] = field(default_factory=list)


def quality_for(n: int, values: Sequence[float]) -> str:
    level = 0 if n < 3 else 1 if n < 6 else 2 if n < 12 else 3
    mean = float(np.mean(values)) if n else 0.0
    if n >= 3 and mean > 0 and float(np.std(values)) / mean > 0.5 and level > 1:
        level -= 1   # very volatile history lowers confidence one notch
    return ["INSUFFICIENT", "LOW", "MEDIUM", "HIGH"][level]


def rolling_origin(x: np.ndarray, candidates=None):
    """Time-ordered validation. Returns (common_start, {name: [abs_errors]}) or None when n is too small.

    Fold t trains on x[:t] only and predicts x[t]. Candidates needing a longer history are dropped until
    every remaining candidate is scored on the SAME folds and there are at least MIN_FOLDS of them.
    """
    cands = dict(candidates if candidates is not None else CANDIDATES)
    n = len(x)
    while cands:
        start = max(MIN_TRAIN, max(m for _, m in cands.values()))
        if n - start >= MIN_FOLDS:
            errors: dict[str, list[float]] = {name: [] for name in cands}
            for t in range(start, n):
                train = x[:t]
                for name, (fn, _) in cands.items():
                    pred = max(0.0, fn(train))
                    errors[name].append(abs(float(x[t]) - pred))
            return start, errors
        # drop the candidate with the longest history requirement and retry
        longest = max(cands, key=lambda k: cands[k][1])
        if longest == BASELINE:
            return None
        del cands[longest]
    return None


def _choose(x: np.ndarray):
    out = rolling_origin(x)
    if out is None:
        return None
    start, errors = out
    maes = {name: float(np.mean(e)) for name, e in errors.items()}
    base = maes[BASELINE]
    best = min(maes, key=lambda k: (maes[k], list(CANDIDATES).index(k)))   # ties -> simpler method
    selected = best if (best != BASELINE and maes[best] <= base * (1 - IMPROVEMENT_REQUIRED)) else BASELINE
    val = Validation(folds=len(errors[selected]), selected=selected, selected_mae=maes[selected],
                     baseline_mae=base, candidates=sorted(maes.items(), key=lambda kv: kv[1]))
    return selected, val, errors[selected]


def forecast(amounts: Sequence[float], period_start: date, period_end: date,
             expected_amount: Optional[Decimal] = None) -> Forecast:
    x = np.asarray(amounts, dtype=float)
    n = len(x)
    period = f"{period_start.isoformat()} to {period_end.isoformat()}"

    if n == 0:
        if expected_amount is not None:
            return Forecast("NOT_A_FORECAST", to_money(expected_amount), "EXPECTED_AMOUNT", 0, "INSUFFICIENT",
                            explanation=(f"There are no confirmed past bills yet, so no forecast can be made. "
                                         f"{fmt_inr(expected_amount)} is just the expected amount you entered for this bill."))
        return Forecast("INSUFFICIENT_DATA", None, "NONE", 0, "INSUFFICIENT",
                        explanation="No forecast: at least one confirmed past bill is needed.")

    val: Optional[Validation] = None
    errors: list[float] = []
    if n == 1:
        method, value = "LAST_VALUE", float(x[0])
    elif n == 2:
        method, value = "HISTORICAL_MEAN", float(np.mean(x))
    elif n < 9:
        method, value = BASELINE, CANDIDATES[BASELINE][0](x)
    else:
        chosen = _choose(x)
        if chosen is None:   # defensive: should not happen for n >= 9
            method, value = BASELINE, CANDIDATES[BASELINE][0](x)
        else:
            method, val, errors = chosen
            value = CANDIDATES[method][0](x)
    value = max(0.0, value)
    amount = to_money(value)
    quality = quality_for(n, x)
    status = "PRELIMINARY" if n < 3 else "OK"

    interval = None
    note = None
    if val is not None and len(errors) >= MIN_FOLDS_INTERVAL:
        half = float(np.quantile(np.asarray(errors), INTERVAL_LEVEL, method="higher"))
        interval = (to_money(max(0.0, value - half)), to_money(value + half))
        note = (f"Approximate {int(INTERVAL_LEVEL * 100)}% range from the {len(errors)} out-of-sample errors of this method")

    recent = ", ".join(fmt_inr(v) for v in x[-3:])
    parts = [f"Estimated {fmt_inr(amount)} for {period}, using {DESCRIPTIONS[method]}.",
             f"Based on {n} confirmed bill{'s' if n != 1 else ''} (most recent: {recent})."]
    if n < 3:
        parts.append("This is a preliminary estimate: fewer than 3 bills are available.")
    if val is not None:
        if val.selected == BASELINE:
            parts.append(f"No other method beat the simple 3-bill average in time-ordered testing on {val.folds} past bills "
                         f"(average miss {fmt_inr(val.baseline_mae)}), so the simple average is used.")
        else:
            parts.append(f"In time-ordered testing on {val.folds} past bills this method missed by {fmt_inr(val.selected_mae)} "
                         f"on average versus {fmt_inr(val.baseline_mae)} for the simple 3-bill average.")
    if interval:
        parts.append(f"Likely range: {fmt_inr(interval[0])} to {fmt_inr(interval[1])} ({note.lower()}).")
    elif n >= 3:
        parts.append("No range is shown because there is not enough history to measure forecast error reliably.")
    return Forecast(status, amount, method, n, quality, interval, note, val, " ".join(parts))
