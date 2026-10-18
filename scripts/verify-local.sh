#!/bin/sh
# Runs every check that can run without Maven/Docker/Neon and prints an honest table.
# Usage: sh scripts/verify-local.sh   (from the repo root)
ROOT=$(cd "$(dirname "$0")/.." && pwd); cd "$ROOT"
rows=""; add() { rows="$rows\n$1|$2|$3"; }
run() { name="$1"; shift; if out=$("$@" 2>&1); then add "$name" PASS "$(echo "$out" | tail -1 | cut -c1-70)"; else add "$name" FAIL "$(echo "$out" | tail -1 | cut -c1-70)"; fi; }
skip() { add "$1" SKIPPED "$2"; }

# 1. C++ engine
if command -v cmake >/dev/null && command -v g++ >/dev/null; then
  run "C++ build + unit + CLI tests" sh -c 'cd native-engine && rm -rf build && cmake -S . -B build >/dev/null && cmake --build build >/dev/null && ctest --test-dir build --output-on-failure | tail -3'
else skip "C++ build + tests" "cmake/g++ not installed"; fi
# 2. Java pure-logic checks (recurrence + native integration + cross-check)
if command -v javac >/dev/null && [ -x native-engine/build/schedule-engine ]; then
  S=backend/src/main/java/com/smartbill; rm -rf /tmp/sb_o && mkdir -p /tmp/sb_o
  run "Java recurrence + C++ integration + 2000-case cross-check" sh -c "javac -d /tmp/sb_o $S/common/Enums.java $S/common/RecurrenceCalculator.java $S/schedule/NativeScheduleEngine.java backend/tools/NativeIntegrationCheck.java && java -cp /tmp/sb_o NativeIntegrationCheck native-engine/build/schedule-engine 2000 2>&1 | grep -E 'ALL|FAILED'"
else skip "Java/C++ integration check" "javac missing or engine not built"; fi
# 3. Python service
if python3 -c "import fastapi,pandas,sklearn" 2>/dev/null; then run "Python prediction tests" sh -c 'cd prediction-service && python3 -m pytest -q -p no:cacheprovider 2>&1 | tail -1'; else skip "Python tests" "pip install -r prediction-service/requirements-dev.txt"; fi
# 4. Frontend
if [ -d frontend/node_modules/jsdom ]; then run "Frontend tests (jsdom)" sh -c 'cd frontend && node --test tests/*.test.js 2>&1 | grep -E "^# (pass|fail)" | tr "\n" " "'; else skip "Frontend tests" "cd frontend && npm install"; fi
# 5. SQL schema against a throwaway PostgreSQL (uses psql directly, or the postgres OS user when run as root)
SQLCMD='psql -q -c "DROP DATABASE IF EXISTS sb_verify" -c "CREATE DATABASE sb_verify" >/dev/null && for f in database/migrations/V*.sql; do psql -v ON_ERROR_STOP=1 -q sb_verify -f $f >/dev/null || exit 1; done && psql -q sb_verify -f database/tests/verify_schema.sql | grep -E "ALL CHECKS|FAILED"'
if command -v psql >/dev/null && psql -lqt >/dev/null 2>&1; then run "SQL migrations + 14 schema checks" sh -c "$SQLCMD"
elif command -v psql >/dev/null && [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then run "SQL migrations + 14 schema checks" su postgres -c "cd '$ROOT' && $SQLCMD"
else skip "SQL schema checks" "no reachable PostgreSQL (psql)"; fi
# 6. Not runnable here
skip "Java backend: mvn test" "needs Maven + dependencies: run 'cd backend && mvn test'"
skip "End-to-end acceptance" "needs the running stack: run 'python3 scripts/acceptance.py'"

printf "%b\n" "$rows" | awk -F'|' 'NF==3 { printf "%-58s %-8s %s\n", $1, $2, $3 }'
printf "%b\n" "$rows" | grep -q '|FAIL|' && exit 1 || exit 0
