from app.anomaly import detect

STABLE = [1400, 1450, 1380, 1420, 1460, 1390, 1430, 1410]
VOLATILE = [900, 1800, 1100, 2100, 950, 1700, 1250, 2000, 1000, 1900, 1150, 1750]


def test_insufficient_history_never_flags():
    r = detect([1400, 1450, 1380], 5000)
    assert r.status == "INSUFFICIENT_HISTORY" and not r.is_anomaly and r.baseline is None
    assert "3 past bills" in r.explanation and "6 needed" in r.explanation


def test_clear_spike_is_flagged_with_numbers():
    r = detect(STABLE, 1830, label="Your electricity bill")
    assert r.is_anomaly and r.direction == "HIGH"
    assert r.baseline == 1415.0                          # median of 8 values = mean of the two middle ones (1410, 1420)
    assert r.deviation_pct == 29.33                      # (1830-1415)/1415
    assert "29.3% above" in r.explanation and "₹1,830.00" in r.explanation and "₹1,415.00" in r.explanation
    assert r.explanation.startswith("Your electricity bill")


def test_meaningful_drop_is_flagged_low():
    r = detect(STABLE, 900)
    assert r.is_anomaly and r.direction == "LOW" and r.deviation_pct < -30
    assert "below" in r.explanation


def test_not_flagged_just_because_it_differs_from_last_month():
    r = detect(STABLE, 1500)   # +5.6% vs median, and last month was 1410
    assert not r.is_anomaly and r.direction == "NONE"
    assert "within normal variation" in r.explanation


def test_volatile_bill_is_not_flagged_for_normal_swings():
    # swings of +-50% are normal for this bill; 1900 is >20% above the median but inside its usual range
    r = detect(VOLATILE, 1900)
    assert r.deviation_pct > 20
    assert not r.is_anomaly


def test_volatile_bill_still_flags_extreme_outlier():
    assert detect(VOLATILE, 6000).is_anomaly


def test_threshold_is_configurable():
    assert not detect(STABLE, 1500, threshold_pct=20).is_anomaly
    assert detect(STABLE, 1500, threshold_pct=5, min_absolute_change=50).is_anomaly


def test_tiny_absolute_changes_ignored():
    r = detect([100, 101, 99, 100, 102, 98, 100], 135)   # +35% but only Rs 35
    assert not r.is_anomaly
    assert detect([100, 101, 99, 100, 102, 98, 100], 135, min_absolute_change=10).is_anomaly


def test_constant_history_flags_by_threshold():
    assert detect([1000] * 8, 1300).is_anomaly
    assert not detect([1000] * 8, 1100).is_anomaly


def test_zero_baseline_not_computable():
    r = detect([0] * 8, 500)
    assert r.status == "BASELINE_ZERO" and not r.is_anomaly


def test_baseline_uses_only_last_twelve():
    old_high = [5000] * 10
    recent = [1000] * 12
    assert detect(old_high + recent, 1000).baseline == 1000.0
