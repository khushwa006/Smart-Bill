// Dependency-free unit tests for the schedule engine. Exit code 0 = all passed.
#include <iostream>
#include <string>
#include "schedule.hpp"

using namespace sb;
static int failures = 0, total = 0;

#define CHECK_EQ(name, actual, expected)                                                        \
    do {                                                                                        \
        ++total;                                                                                \
        auto a_ = (actual); auto e_ = (expected);                                               \
        if (a_ == e_) std::cout << "PASS " << name << "\n";                                     \
        else { ++failures; std::cout << "FAIL " << name << " got " << to_iso(a_) << " expected " << to_iso(e_) << "\n"; } \
    } while (0)

#define CHECK_TRUE(name, cond)                                                                  \
    do { ++total; if (cond) std::cout << "PASS " << name << "\n"; else { ++failures; std::cout << "FAIL " << name << "\n"; } } while (0)

static Rule rule(Frequency f, int y, int m, int d, bool month_end = false) {
    Rule r; r.frequency = f; r.anchor = Date{y, m, d}; r.month_end = month_end; return r;
}
static Rule custom(int v, Unit u, int y, int m, int d) {
    Rule r = rule(Frequency::Custom, y, m, d); r.custom_value = v; r.unit = u; r.has_custom = true; return r;
}

int main() {
    // --- month-end / day-of-month clamping, no drift
    Rule m31 = rule(Frequency::Monthly, 2026, 1, 31);
    CHECK_EQ("monthly 31st: Feb non-leap", occurrence(m31, 1), (Date{2026, 2, 28}));
    CHECK_EQ("monthly 31st: Mar back to 31", occurrence(m31, 2), (Date{2026, 3, 31}));
    CHECK_EQ("monthly 31st: Apr 30", occurrence(m31, 3), (Date{2026, 4, 30}));
    CHECK_EQ("monthly 31st: Feb 2028 leap 29", occurrence(m31, 25), (Date{2028, 2, 29}));
    CHECK_EQ("monthly 31st: Dec rolls year", occurrence(m31, 11), (Date{2026, 12, 31}));
    CHECK_EQ("monthly 31st: Jan next year", occurrence(m31, 12), (Date{2027, 1, 31}));
    Rule me = rule(Frequency::Monthly, 2026, 1, 30, true);
    CHECK_EQ("month-end anchored Jan->Feb 28", occurrence(me, 1), (Date{2026, 2, 28}));
    CHECK_EQ("month-end anchored Mar 31", occurrence(me, 2), (Date{2026, 3, 31}));
    CHECK_EQ("month-end anchored Apr 30", occurrence(me, 3), (Date{2026, 4, 30}));
    // --- leap years
    Rule leap = rule(Frequency::Yearly, 2024, 2, 29);
    CHECK_EQ("yearly Feb 29 -> 2025 Feb 28", occurrence(leap, 1), (Date{2025, 2, 28}));
    CHECK_EQ("yearly Feb 29 -> 2028 Feb 29", occurrence(leap, 4), (Date{2028, 2, 29}));
    CHECK_TRUE("1900 not leap", !is_leap(1900));
    CHECK_TRUE("2000 leap", is_leap(2000));
    CHECK_TRUE("2100 not leap", !is_leap(2100));
    // --- weekly / quarterly / half-yearly / custom
    CHECK_EQ("weekly +3", occurrence(rule(Frequency::Weekly, 2026, 10, 16), 3), (Date{2026, 11, 6}));
    CHECK_EQ("weekly across leap day", occurrence(rule(Frequency::Weekly, 2028, 2, 26), 1), (Date{2028, 3, 4}));
    CHECK_EQ("quarterly Nov30 -> Feb 28", occurrence(rule(Frequency::Quarterly, 2026, 11, 30), 1), (Date{2027, 2, 28}));
    CHECK_EQ("half-yearly Aug31 -> Feb 28", occurrence(rule(Frequency::HalfYearly, 2026, 8, 31), 1), (Date{2027, 2, 28}));
    CHECK_EQ("custom 45 days x2", occurrence(custom(45, Unit::Days, 2026, 1, 1), 2), (Date{2026, 4, 1}));
    CHECK_EQ("custom 2 weeks x3", occurrence(custom(2, Unit::Weeks, 2026, 1, 1), 3), (Date{2026, 2, 12}));
    CHECK_EQ("custom 2 months from Dec31 -> Feb 28", occurrence(custom(2, Unit::Months, 2026, 12, 31), 1), (Date{2027, 2, 28}));
    // --- negative indices (period start of first cycle)
    CHECK_EQ("monthly index -1 across year", occurrence(rule(Frequency::Monthly, 2026, 1, 15), -1), (Date{2025, 12, 15}));
    CHECK_EQ("monthly 31st index -2", occurrence(rule(Frequency::Monthly, 2026, 1, 31), -2), (Date{2025, 11, 30}));
    CHECK_EQ("weekly index -1", occurrence(rule(Frequency::Weekly, 2026, 1, 3), -1), (Date{2025, 12, 27}));
    // --- schedule()/first_on_or_after
    auto s = schedule(rule(Frequency::Monthly, 2026, 10, 18), 0, std::nullopt, Date{2027, 1, 18}, 100);
    CHECK_TRUE("schedule count Oct18..Jan18 = 4", s.size() == 4 && s.back() == (Date{2027, 1, 18}));
    auto s2 = schedule(rule(Frequency::Monthly, 2026, 10, 18), -1, std::nullopt, Date{2026, 12, 31}, 100);
    CHECK_TRUE("schedule start-index -1 includes prior date", s2.size() == 4 && s2.front() == (Date{2026, 9, 18}));
    auto s3 = schedule(rule(Frequency::Monthly, 2026, 10, 18), 0, Date{2026, 11, 1}, Date{2027, 1, 31}, 100);
    CHECK_TRUE("schedule honours from", s3.size() == 3 && s3.front() == (Date{2026, 11, 18}));
    auto s4 = schedule(rule(Frequency::Weekly, 2026, 1, 1), 0, std::nullopt, Date{2200, 12, 31}, 5);
    CHECK_TRUE("schedule honours max", s4.size() == 5);
    auto f = first_on_or_after(m31, Date{2026, 2, 1});
    CHECK_TRUE("first_on_or_after", f && *f == (Date{2026, 2, 28}));
    // --- date parsing
    CHECK_TRUE("parse valid", parse_iso("2028-02-29").has_value());
    CHECK_TRUE("parse rejects Feb 29 non-leap", !parse_iso("2027-02-29"));
    CHECK_TRUE("parse rejects month 13", !parse_iso("2026-13-01"));
    CHECK_TRUE("parse rejects garbage", !parse_iso("2026/01/01") && !parse_iso("26-1-1") && !parse_iso("2026-01-0x"));
    CHECK_TRUE("parse rejects whitespace/injection", !parse_iso("2026-01-01; rm") && !parse_iso(" 2026-01-01"));
    // --- validation of invalid schedules
    CHECK_TRUE("valid rule has no error", validate(m31).empty());
    Rule bad = rule(Frequency::Custom, 2026, 1, 1);
    CHECK_TRUE("custom without interval rejected", !validate(bad).empty());
    CHECK_TRUE("custom zero rejected", !validate(custom(0, Unit::Days, 2026, 1, 1)).empty());
    CHECK_TRUE("custom too large rejected", !validate(custom(3651, Unit::Days, 2026, 1, 1)).empty());
    Rule m = rule(Frequency::Monthly, 2026, 1, 1); m.has_custom = true; m.custom_value = 1;
    CHECK_TRUE("interval on non-custom rejected", !validate(m).empty());
    CHECK_TRUE("month-end on weekly rejected", !validate(rule(Frequency::Weekly, 2026, 1, 1, true)).empty());
    CHECK_TRUE("month-end on custom days rejected", !validate([] { Rule r = custom(5, Unit::Days, 2026, 1, 1); r.month_end = true; return r; }()).empty());
    CHECK_TRUE("anchor out of domain rejected", !validate(rule(Frequency::Monthly, 1899, 12, 31)).empty());
    CHECK_TRUE("invalid anchor date rejected", !validate(rule(Frequency::Monthly, 2026, 2, 30)).empty());

    std::cout << (total - failures) << "/" << total << " passed\n";
    return failures == 0 ? 0 : 1;
}
