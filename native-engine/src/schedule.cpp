#include "schedule.hpp"

#include <algorithm>
#include <cstdio>

namespace sb {
namespace {
constexpr long kMaxSteps = 20000;

// Howard Hinnant's civil-date algorithms (proleptic Gregorian calendar).
int64_t days_from_civil(int y, int m, int d) {
    y -= m <= 2;
    const int64_t era = (y >= 0 ? y : y - 399) / 400;
    const int64_t yoe = y - era * 400;
    const int64_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
    const int64_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
}

Date civil_from_days(int64_t z) {
    z += 719468;
    const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
    const int64_t doe = z - era * 146097;
    const int64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    const int64_t y = yoe + era * 400;
    const int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    const int64_t mp = (5 * doy + 2) / 153;
    const int d = static_cast<int>(doy - (153 * mp + 2) / 5 + 1);
    const int m = static_cast<int>(mp < 10 ? mp + 3 : mp - 9);
    return Date{static_cast<int>(y + (m <= 2)), m, d};
}

int64_t floor_div(int64_t a, int64_t b) {
    int64_t q = a / b;
    if ((a % b != 0) && ((a < 0) != (b < 0))) --q;
    return q;
}

Date add_days(const Date& d, int64_t days) { return civil_from_days(days_from_civil(d.y, d.m, d.d) + days); }

Date add_months(const Rule& r, int64_t months) {
    const int64_t total = static_cast<int64_t>(r.anchor.y) * 12 + (r.anchor.m - 1) + months;
    const int ny = static_cast<int>(floor_div(total, 12));
    const int nm = static_cast<int>(total - floor_div(total, 12) * 12) + 1;
    const int dim = days_in_month(ny, nm);
    const int day = r.month_end ? dim : std::min(r.anchor.d, dim);
    return Date{ny, nm, day};
}

bool month_based(const Rule& r) {
    switch (r.frequency) {
        case Frequency::Monthly: case Frequency::Quarterly:
        case Frequency::HalfYearly: case Frequency::Yearly: return true;
        case Frequency::Custom: return r.unit == Unit::Months;
        case Frequency::Weekly: return false;
    }
    return false;
}
}  // namespace

bool is_leap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }

int days_in_month(int y, int m) {
    static const int dim[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    return (m == 2 && is_leap(y)) ? 29 : dim[m - 1];
}

bool is_valid_date(const Date& d) {
    return d.m >= 1 && d.m <= 12 && d.d >= 1 && d.y >= 1 && d.d <= days_in_month(d.y, d.m);
}

bool in_domain(const Date& d) { return is_valid_date(d) && d.y >= kMinYear && d.y <= kMaxYear; }

std::optional<Date> parse_iso(const std::string& s) {
    if (s.size() != 10 || s[4] != '-' || s[7] != '-') return std::nullopt;
    for (std::size_t i = 0; i < s.size(); ++i) {
        if (i == 4 || i == 7) continue;
        if (s[i] < '0' || s[i] > '9') return std::nullopt;
    }
    Date d{std::stoi(s.substr(0, 4)), std::stoi(s.substr(5, 2)), std::stoi(s.substr(8, 2))};
    if (!is_valid_date(d)) return std::nullopt;
    return d;
}

std::string to_iso(const Date& d) {
    char buf[16];
    std::snprintf(buf, sizeof buf, "%04d-%02d-%02d", d.y, d.m, d.d);
    return buf;
}

std::string validate(const Rule& r) {
    if (!in_domain(r.anchor)) return "anchor date must be a valid date between 1900-01-01 and 2200-12-31";
    if (r.frequency == Frequency::Custom) {
        if (!r.has_custom || r.custom_value <= 0) return "custom frequency needs a positive interval and a unit";
        if (r.custom_value > kMaxCustom) return "custom interval is too large (max 3650)";
    } else if (r.has_custom) {
        return "custom interval is only allowed with CUSTOM frequency";
    }
    if (r.month_end && !month_based(r)) return "month-end anchoring only applies to month-based schedules";
    return "";
}

Date occurrence(const Rule& r, long n) {
    switch (r.frequency) {
        case Frequency::Weekly: return add_days(r.anchor, 7LL * n);
        case Frequency::Monthly: return add_months(r, n);
        case Frequency::Quarterly: return add_months(r, 3LL * n);
        case Frequency::HalfYearly: return add_months(r, 6LL * n);
        case Frequency::Yearly: return add_months(r, 12LL * n);
        case Frequency::Custom:
            switch (r.unit) {
                case Unit::Days: return add_days(r.anchor, static_cast<int64_t>(r.custom_value) * n);
                case Unit::Weeks: return add_days(r.anchor, 7LL * r.custom_value * n);
                case Unit::Months: return add_months(r, static_cast<int64_t>(r.custom_value) * n);
            }
    }
    return r.anchor;
}

std::vector<Date> schedule(const Rule& r, long start_index, const std::optional<Date>& from,
                           const Date& to, std::size_t max) {
    std::vector<Date> out;
    for (long n = start_index; n < start_index + kMaxSteps && out.size() < max; ++n) {
        const Date d = occurrence(r, n);
        if (to < d) break;
        if (!from || !(d < *from)) out.push_back(d);
    }
    return out;
}

std::optional<Date> first_on_or_after(const Rule& r, const Date& date) {
    for (long n = 0; n < kMaxSteps; ++n) {
        const Date d = occurrence(r, n);
        if (!(d < date)) return d;
    }
    return std::nullopt;
}

}  // namespace sb
