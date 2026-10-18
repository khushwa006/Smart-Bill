#!/bin/sh
# CLI contract tests. Usage: cli_tests.sh /path/to/schedule-engine
BIN="$1"; fails=0
ok()   { echo "PASS $1"; }
bad()  { echo "FAIL $1"; fails=$((fails+1)); }

out=$("$BIN" schedule --frequency MONTHLY --anchor 2026-01-31 --to 2026-04-30 2>/dev/null)
[ "$out" = '{"dates":["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]}' ] && ok "schedule output format" || bad "schedule output format: $out"

out=$("$BIN" schedule --frequency MONTHLY --anchor 2026-10-18 --start-index -1 --to 2026-11-30 2>/dev/null)
[ "$out" = '{"dates":["2026-09-18","2026-10-18","2026-11-18"]}' ] && ok "start-index -1" || bad "start-index -1: $out"

out=$("$BIN" schedule --frequency MONTHLY --anchor 2026-01-30 --month-end --to 2026-03-31 2>/dev/null)
[ "$out" = '{"dates":["2026-01-31","2026-02-28","2026-03-31"]}' ] && ok "month-end flag" || bad "month-end flag: $out"

out=$("$BIN" schedule --frequency CUSTOM --custom-value 45 --custom-unit DAYS --anchor 2026-01-01 --to 2026-04-02 2>/dev/null)
[ "$out" = '{"dates":["2026-01-01","2026-02-15","2026-04-01"]}' ] && ok "custom interval" || bad "custom interval: $out"

out=$("$BIN" next --frequency MONTHLY --anchor 2026-01-31 --on-or-after 2026-02-01 2>/dev/null)
[ "$out" = '{"date":"2026-02-28"}' ] && ok "next" || bad "next: $out"

out=$("$BIN" schedule --frequency WEEKLY --anchor 2026-01-01 --to 2026-12-31 --max 3 2>/dev/null)
[ "$out" = '{"dates":["2026-01-01","2026-01-08","2026-01-15"]}' ] && ok "max" || bad "max: $out"

"$BIN" version >/dev/null 2>&1 && ok "version" || bad "version"

expect_exit2() {  # name, args...
    name="$1"; shift
    out=$("$BIN" "$@" 2>/tmp/sb_err); code=$?
    if [ "$code" = "2" ] && [ -z "$out" ] && grep -q '"error"' /tmp/sb_err; then ok "$name"; else bad "$name (code=$code out=$out)"; fi
}
expect_exit2 "no command"
expect_exit2 "unknown command" explode
expect_exit2 "invalid date" schedule --frequency MONTHLY --anchor 2026-02-30 --to 2026-12-31
expect_exit2 "non-leap Feb 29" schedule --frequency MONTHLY --anchor 2027-02-29 --to 2027-12-31
expect_exit2 "missing --to" schedule --frequency MONTHLY --anchor 2026-01-01
expect_exit2 "bad frequency" schedule --frequency DAILY --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "custom without interval" schedule --frequency CUSTOM --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "custom zero" schedule --frequency CUSTOM --custom-value 0 --custom-unit DAYS --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "custom too large" schedule --frequency CUSTOM --custom-value 99999 --custom-unit DAYS --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "interval on monthly" schedule --frequency MONTHLY --custom-value 2 --custom-unit DAYS --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "month-end on weekly" schedule --frequency WEEKLY --month-end --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "unknown flag" schedule --frequency MONTHLY --anchor 2026-01-01 --to 2026-02-01 --evil x
expect_exit2 "duplicate flag" schedule --frequency MONTHLY --anchor 2026-01-01 --anchor 2026-01-02 --to 2026-02-01
expect_exit2 "max too big" schedule --frequency WEEKLY --anchor 2026-01-01 --to 2026-12-31 --max 100000
expect_exit2 "shell metacharacters" schedule --frequency 'MONTHLY; echo hi' --anchor 2026-01-01 --to 2026-02-01
expect_exit2 "date out of domain" schedule --frequency MONTHLY --anchor 1800-01-01 --to 2026-02-01
expect_exit2 "missing value" schedule --frequency
[ "$fails" = "0" ] && echo "CLI: ALL PASSED" || echo "CLI: $fails FAILED"
[ "$fails" = "0" ]
