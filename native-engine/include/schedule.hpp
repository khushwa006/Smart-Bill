// SmartBill native schedule engine: recurring billing date calculations (C++17, standard library only).
// Semantics MUST match backend RecurrenceCalculator.java (verified by tools/crosscheck.py):
//  * occurrence n is computed from the ANCHOR, never from the previous occurrence (no drift);
//  * month-based rules clamp the anchor day to the month length (31st -> Feb 28/29 -> back to 31st);
//  * month_end=true always means the last day of the month;
//  * supported domain: dates 1900-01-01..2200-12-31, custom interval 1..3650.
#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace sb {

struct Date {
    int y = 0, m = 0, d = 0;
    bool operator==(const Date& o) const { return y == o.y && m == o.m && d == o.d; }
    bool operator<(const Date& o) const { return y != o.y ? y < o.y : (m != o.m ? m < o.m : d < o.d); }
    bool operator<=(const Date& o) const { return !(o < *this); }
};

enum class Frequency { Weekly, Monthly, Quarterly, HalfYearly, Yearly, Custom };
enum class Unit { Days, Weeks, Months };

struct Rule {
    Frequency frequency = Frequency::Monthly;
    int custom_value = 0;          // only for Custom
    Unit unit = Unit::Days;        // only for Custom
    bool has_custom = false;       // true when custom_value/unit were supplied
    Date anchor;
    bool month_end = false;
};

constexpr int kMinYear = 1900;
constexpr int kMaxYear = 2200;
constexpr int kMaxCustom = 3650;

bool is_leap(int y);
int days_in_month(int y, int m);
bool is_valid_date(const Date& d);
bool in_domain(const Date& d);
std::optional<Date> parse_iso(const std::string& s);   // strict YYYY-MM-DD, real calendar dates only
std::string to_iso(const Date& d);

// Empty string when valid, otherwise a human-readable reason.
std::string validate(const Rule& r);

// n-th occurrence (0 = anchor, negative = before the anchor). Rule must be valid.
Date occurrence(const Rule& r, long n);

// Occurrences with index >= start_index, date >= from (if set), date <= to; at most max entries.
std::vector<Date> schedule(const Rule& r, long start_index, const std::optional<Date>& from,
                           const Date& to, std::size_t max);

// First occurrence on or after `date` (searches at most 20000 steps).
std::optional<Date> first_on_or_after(const Rule& r, const Date& date);

}  // namespace sb
