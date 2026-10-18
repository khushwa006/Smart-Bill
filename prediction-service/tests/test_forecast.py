from datetime import date
from decimal import Decimal

import numpy as np
import pytest

from app import forecast as fc

P0, P1 = date(2026, 11, 18), date(2026, 12, 17)


def run(values, expected=None):
    return fc.forecast(values, P0, P1, expected)


# ---- cold start: never invent results
def test_no_history_no_forecast():
    f = run([])
    assert f.status == "INSUFFICIENT_DATA" and f.amount is None and f.observations == 0


def test_no_history_with_expected_amount_is_labelled_not_a_forecast():
    f = run([], Decimal("799"))
    assert f.status == "NOT_A_FORECAST" and f.amount == Decimal("799.00") and f.method == "EXPECTED_AMOUNT"
    assert "not" in f.explanation.lower() or "just the expected" in f.explanation


def test_one_bill_is_preliminary_last_value_without_interval():
    f = run([1200])
    assert (f.status, f.method, f.amount, f.quality, f.interval) == ("PRELIMINARY", "LAST_VALUE", Decimal("1200.00"), "INSUFFICIENT", None)
    assert "preliminary" in f.explanation.lower() and "1 confirmed bill " in f.explanation


def test_two_bills_use_mean_preliminary():
    f = run([1000, 1200])
    assert f.method == "HISTORICAL_MEAN" and f.amount == Decimal("1100.00") and f.status == "PRELIMINARY"


def test_three_to_eight_bills_use_moving_average_3_no_validation_no_interval():
    for n in range(3, 9):
        vals = list(range(1000, 1000 + 100 * n, 100))
        f = run(vals)
        assert f.method == "MOVING_AVERAGE_3" and f.validation is None and f.interval is None
        assert f.amount == Decimal(str(round(np.mean(vals[-3:]), 2))).quantize(Decimal("0.01"))
        assert f.status == "OK"


def test_quality_levels():
    assert fc.quality_for(2, [1, 1]) == "INSUFFICIENT"
    assert fc.quality_for(4, [100] * 4) == "LOW"
    assert fc.quality_for(8, [100] * 8) == "MEDIUM"
    assert fc.quality_for(12, [100] * 12) == "HIGH"
    assert fc.quality_for(12, [10, 300] * 6) == "MEDIUM"   # volatile history lowers confidence one notch


# ---- validation selects richer methods only on evidence
def test_clear_linear_trend_selects_regression_and_extrapolates():
    vals = [1000 + 50 * i for i in range(12)]
    f = run(vals)
    assert f.method == "LINEAR_REGRESSION"
    assert f.amount == Decimal("1600.00")
    assert f.validation.selected_mae < f.validation.baseline_mae * 0.95


def test_noisy_flat_history_keeps_simple_baseline():
    rng = np.random.default_rng(7)
    vals = list(1500 + rng.normal(0, 120, 14).round())
    f = run(vals)
    v = f.validation
    best = min(m for _, m in v.candidates)
    if f.method != fc.BASELINE:   # a richer method may only win by >= 5% out-of-sample MAE
        assert v.selected_mae <= v.baseline_mae * 0.95
    assert v.baseline_mae >= best - 1e-9


def test_richer_method_must_beat_baseline_by_five_percent(monkeypatch):
    # rising series: the 3-bill average lags by 20 each fold, so MAE(baseline) = 20
    x = np.arange(100.0, 200.0, 10.0)
    base = fc.CANDIDATES[fc.BASELINE]
    marginal = {fc.BASELINE: base, "EDGE": (lambda t: fc._ma(3)(t) + 0.5, 3)}      # MAE 19.5 -> only 2.5% better
    monkeypatch.setattr(fc, "CANDIDATES", marginal)
    assert fc._choose(x)[0] == fc.BASELINE
    clear = {fc.BASELINE: base, "EDGE": (lambda t: fc._ma(3)(t) + 3.0, 3)}         # MAE 17 -> 15% better
    monkeypatch.setattr(fc, "CANDIDATES", clear)
    assert fc._choose(x)[0] == "EDGE"


def test_validation_is_time_ordered_and_never_sees_the_future():
    x = np.arange(100.0, 100.0 + 12 * 10, 10)
    seen = []

    def spy(train):
        seen.append(train.copy())
        return float(train[-1])

    out = fc.rolling_origin(x, {fc.BASELINE: (fc._ma(3), 3), "SPY": (spy, 1)})
    start, errors = out
    assert start == fc.MIN_TRAIN
    assert len(seen) == len(x) - start
    for k, train in enumerate(seen):
        t = start + k
        assert len(train) == t                       # trains on exactly the first t points
        assert np.array_equal(train, x[:t])           # ...and nothing after them (no leakage)
    # last-value on a rising series misses by exactly one step each fold
    assert all(abs(e - 10.0) < 1e-9 for e in errors["SPY"])


def test_rolling_origin_needs_enough_folds():
    assert fc.rolling_origin(np.arange(8.0)) is None


def test_seasonal_candidate_only_with_enough_history():
    short = fc.rolling_origin(np.arange(1000.0, 1012.0))[1]
    assert "SEASONAL_NAIVE_12" not in short
    long = fc.rolling_origin(np.arange(1000.0, 1020.0))[1]
    assert "SEASONAL_NAIVE_12" in long
    assert len({len(e) for e in long.values()}) == 1   # all candidates scored on the same folds


def test_seasonal_pattern_detected_with_two_years_of_data():
    pattern = [900, 900, 950, 1300, 1800, 2200, 2400, 2300, 1700, 1100, 950, 900]
    f = run(pattern * 2)
    assert f.method == "SEASONAL_NAIVE_12" and f.amount == Decimal("900.00")


# ---- intervals only when defensible
def test_interval_requires_six_out_of_sample_errors():
    f9 = run([1000 + (i % 3) * 40 for i in range(11)])    # 5 folds
    assert f9.interval is None
    f14 = run([1000 + (i % 3) * 40 for i in range(14)])   # 8 folds
    assert f14.interval is not None
    lo, hi = f14.interval
    assert lo >= 0 and lo <= hi
    assert "out-of-sample" in f14.interval_note


def test_interval_matches_empirical_error_quantile():
    vals = [1000, 1100, 900, 1050, 950, 1000, 1100, 900, 1050, 950, 1000, 1100]
    f = run(vals)
    assert f.interval is not None
    x = np.asarray(vals, dtype=float)
    method, _, errors = fc._choose(x)
    value = fc.CANDIDATES[method][0](x)
    half = float(np.quantile(np.asarray(errors), 0.8, method="higher"))
    assert f.interval == (fc.to_money(max(0.0, value - half)), fc.to_money(value + half))


# ---- safety properties
def test_forecast_never_negative():
    f = run([500, 400, 300, 200, 100, 50, 20, 10, 5, 2, 1, 0, 0])
    assert f.amount >= 0 and (f.interval is None or f.interval[0] >= 0)


def test_constant_history_gives_exact_value_and_zero_width_interval():
    f = run([1234] * 14)
    assert f.amount == Decimal("1234.00")
    assert f.interval == (Decimal("1234.00"), Decimal("1234.00"))


def test_explanation_only_states_computed_facts():
    f = run([1300, 1400, 1470, 1390])
    assert "₹1,420.00" in f.explanation        # mean of 1400, 1470, 1390 = 1420
    assert "4 confirmed bills" in f.explanation
    assert "₹1,400.00, ₹1,470.00, ₹1,390.00" in f.explanation


def test_no_accuracy_percentage_is_ever_claimed():
    for vals in ([], [1], [1, 2], list(range(1000, 1014))):
        assert "accuracy" not in run(vals).explanation.lower()
        assert "%" not in run(vals).explanation.replace("80%", "")
