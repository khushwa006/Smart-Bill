from decimal import Decimal

from app.money import fmt_inr, to_money


def test_indian_grouping():
    assert fmt_inr(0) == "₹0.00"
    assert fmt_inr(799) == "₹799.00"
    assert fmt_inr(1450) == "₹1,450.00"
    assert fmt_inr(145000.5) == "₹1,45,000.50"
    assert fmt_inr(12345678) == "₹1,23,45,678.00"
    assert fmt_inr(-2500) == "-₹2,500.00"


def test_rounding_half_up_to_paise():
    assert to_money(1.005) == Decimal("1.01")
    assert to_money(Decimal("2.345")) == Decimal("2.35")
