"""Anomaly detection for a single bill amount against its own history.

A bill is flagged only when ALL of these hold (so ordinary month-to-month variation is not flagged):
  1. at least `min_history` past bills exist;
  2. it deviates from the baseline (median of the last 12 bills) by >= `threshold_pct` percent;
  3. the absolute change is >= `min_absolute_change` rupees;
  4. it lies outside the bill's own typical variation: |observed - baseline| > 2.5 x robust sigma
     (sigma = 1.4826 x median absolute deviation); skipped only when history is perfectly constant.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

from .money import fmt_inr, to_money

BASELINE_WINDOW = 12
ROBUST_K = 2.5


@dataclass
class AnomalyResult:
    status: str                  # OK | INSUFFICIENT_HISTORY | BASELINE_ZERO
    is_anomaly: bool
    direction: str               # HIGH | LOW | NONE
    observed: float
    baseline: Optional[float]
    deviation_pct: Optional[float]
    typical_variation: Optional[float]
    robust_score: Optional[float]
    sample_size: int
    explanation: str


def detect(history: Sequence[float], observed: float, threshold_pct: float = 20.0,
           min_history: int = 6, min_absolute_change: float = 100.0, label: str = "This bill") -> AnomalyResult:
    h = np.asarray(history, dtype=float)
    n = len(h)
    if n < min_history:
        return AnomalyResult("INSUFFICIENT_HISTORY", False, "NONE", observed, None, None, None, None, n,
                             f"Not enough history to judge: {n} past bill{'s' if n != 1 else ''} available, "
                             f"{min_history} needed. {label} was {fmt_inr(observed)}.")
    window = h[-BASELINE_WINDOW:]
    baseline = float(np.median(window))
    if baseline <= 0:
        return AnomalyResult("BASELINE_ZERO", False, "NONE", observed, baseline, None, None, None, len(window),
                             "The typical past amount is zero, so a percentage change cannot be computed.")
    diff = observed - baseline
    pct = diff / baseline * 100.0
    mad = float(np.median(np.abs(window - baseline)))
    sigma = 1.4826 * mad
    score = abs(diff) / sigma if sigma > 0 else None

    outside_normal = True if sigma == 0 else abs(diff) > ROBUST_K * sigma
    flagged = abs(pct) >= threshold_pct and abs(diff) >= min_absolute_change and outside_normal
    direction = ("HIGH" if diff > 0 else "LOW") if flagged else "NONE"

    word = "above" if diff > 0 else "below"
    base_txt = f"the median of your last {len(window)} bills ({fmt_inr(baseline)}"
    if sigma > 0:
        base_txt += f"; typical variation about ±{fmt_inr(sigma)}"
    base_txt += ")"
    if flagged:
        expl = f"{label} of {fmt_inr(observed)} is {abs(pct):.1f}% {word} {base_txt}."
    else:
        expl = (f"{label} of {fmt_inr(observed)} is {abs(pct):.1f}% {word} {base_txt}, "
                f"which is within normal variation or below the alert thresholds.")
    return AnomalyResult("OK", flagged, direction, observed, baseline, round(pct, 2),
                         round(sigma, 2) if sigma > 0 else 0.0, round(score, 2) if score is not None else None,
                         len(window), expl)
