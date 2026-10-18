// schedule-engine CLI. Arguments only (no shell, no stdin); output is a single JSON line on stdout.
//   schedule-engine schedule --frequency F --anchor D --to D [--from D] [--start-index K] [--max N]
//                            [--custom-value N --custom-unit DAYS|WEEKS|MONTHS] [--month-end]
//   schedule-engine next     --frequency F --anchor D --on-or-after D [same rule options]
//   schedule-engine version
// Exit codes: 0 ok | 2 invalid input (JSON error on stderr) | 1 internal error.
#include <cstdlib>
#include <exception>
#include <iostream>
#include <map>
#include <set>
#include <string>

#include "schedule.hpp"

namespace {
constexpr std::size_t kHardMax = 1000;

struct UsageError { std::string message; };

std::string json_escape(const std::string& s) {
    std::string o;
    for (char c : s) {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (static_cast<unsigned char>(c) < 0x20) o += ' ';
        else o += c;
    }
    return o;
}

int fail(const std::string& msg) {
    std::cerr << "{\"error\":\"" << json_escape(msg) << "\"}\n";
    return 2;
}

bool parse_long(const std::string& s, long lo, long hi, long& out) {
    if (s.empty() || s.size() > 12) return false;
    std::size_t i = (s[0] == '-') ? 1 : 0;
    if (i == s.size()) return false;
    for (std::size_t k = i; k < s.size(); ++k) if (s[k] < '0' || s[k] > '9') return false;
    out = std::strtol(s.c_str(), nullptr, 10);
    return out >= lo && out <= hi;
}

sb::Date require_date(const std::map<std::string, std::string>& o, const std::string& key) {
    auto it = o.find(key);
    if (it == o.end()) throw UsageError{"missing --" + key};
    auto d = sb::parse_iso(it->second);
    if (!d || !sb::in_domain(*d)) throw UsageError{"--" + key + " must be a valid date (YYYY-MM-DD) between 1900 and 2200"};
    return *d;
}

sb::Rule build_rule(const std::map<std::string, std::string>& o, bool month_end) {
    sb::Rule r;
    auto f = o.find("frequency");
    if (f == o.end()) throw UsageError{"missing --frequency"};
    static const std::map<std::string, sb::Frequency> freqs = {
        {"WEEKLY", sb::Frequency::Weekly}, {"MONTHLY", sb::Frequency::Monthly},
        {"QUARTERLY", sb::Frequency::Quarterly}, {"HALF_YEARLY", sb::Frequency::HalfYearly},
        {"YEARLY", sb::Frequency::Yearly}, {"CUSTOM", sb::Frequency::Custom}};
    auto fi = freqs.find(f->second);
    if (fi == freqs.end()) throw UsageError{"unknown frequency"};
    r.frequency = fi->second;
    r.anchor = require_date(o, "anchor");
    r.month_end = month_end;
    auto cv = o.find("custom-value");
    auto cu = o.find("custom-unit");
    if (cv != o.end() || cu != o.end()) {
        if (cv == o.end() || cu == o.end()) throw UsageError{"--custom-value and --custom-unit must be given together"};
        long v;
        if (!parse_long(cv->second, 1, sb::kMaxCustom, v)) throw UsageError{"--custom-value must be 1..3650"};
        static const std::map<std::string, sb::Unit> units = {
            {"DAYS", sb::Unit::Days}, {"WEEKS", sb::Unit::Weeks}, {"MONTHS", sb::Unit::Months}};
        auto ui = units.find(cu->second);
        if (ui == units.end()) throw UsageError{"unknown --custom-unit"};
        r.custom_value = static_cast<int>(v);
        r.unit = ui->second;
        r.has_custom = true;
    }
    std::string why = sb::validate(r);
    if (!why.empty()) throw UsageError{why};
    return r;
}

int run(int argc, char** argv) {
    if (argc < 2) throw UsageError{"missing command (schedule | next | version)"};
    const std::string cmd = argv[1];
    if (cmd == "version") { std::cout << "{\"engine\":\"smartbill-schedule\",\"version\":\"1.0.0\"}\n"; return 0; }
    if (cmd != "schedule" && cmd != "next") throw UsageError{"unknown command"};

    static const std::set<std::string> known = {"frequency", "anchor", "to", "from", "start-index", "max",
        "custom-value", "custom-unit", "on-or-after"};
    std::map<std::string, std::string> opts;
    bool month_end = false;
    for (int i = 2; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--month-end") { month_end = true; continue; }
        if (a.rfind("--", 0) != 0 || !known.count(a.substr(2))) throw UsageError{"unknown argument"};
        if (i + 1 >= argc) throw UsageError{"missing value for " + a};
        std::string key = a.substr(2);
        if (opts.count(key)) throw UsageError{"duplicate argument --" + key};
        opts[key] = argv[++i];
    }
    sb::Rule rule = build_rule(opts, month_end);

    if (cmd == "next") {
        auto d = sb::first_on_or_after(rule, require_date(opts, "on-or-after"));
        if (!d) throw UsageError{"no occurrence found"};
        std::cout << "{\"date\":\"" << sb::to_iso(*d) << "\"}\n";
        return 0;
    }
    sb::Date to = require_date(opts, "to");
    std::optional<sb::Date> from;
    if (opts.count("from")) from = require_date(opts, "from");
    long start = 0, max = 100;
    if (opts.count("start-index") && !parse_long(opts["start-index"], -1000000, 1000000, start))
        throw UsageError{"--start-index out of range"};
    if (opts.count("max") && !parse_long(opts["max"], 1, static_cast<long>(kHardMax), max))
        throw UsageError{"--max must be 1..1000"};
    auto dates = sb::schedule(rule, start, from, to, static_cast<std::size_t>(max));
    std::cout << "{\"dates\":[";
    for (std::size_t i = 0; i < dates.size(); ++i) std::cout << (i ? "," : "") << '"' << sb::to_iso(dates[i]) << '"';
    std::cout << "]}\n";
    return 0;
}
}  // namespace

int main(int argc, char** argv) {
    try {
        return run(argc, argv);
    } catch (const UsageError& e) {
        return fail(e.message);
    } catch (const std::exception& e) {
        std::cerr << "{\"error\":\"internal error\"}\n";
        return 1;
    }
}
