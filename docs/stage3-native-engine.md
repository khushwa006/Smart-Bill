# Stage 3 — C++ schedule engine

## What it does
`native-engine/` is a C++17 (standard library only) command-line program that computes recurring billing dates.
The Java backend calls it for every cycle generation and subscription renewal calculation, and falls back to the
Java reference (`RecurrenceCalculator`) if the binary is missing, slow, failing or returns anything invalid.

### Rules (identical in C++ and Java)
- Occurrence *n* is computed from the **anchor**, never from the previous date, so nothing drifts:
  monthly on the 31st gives Jan 31, Feb 28/29, Mar 31, Apr 30, ...
- `--month-end` pins every occurrence to the last day of the month (month-based schedules only).
- Weekly, monthly, quarterly, half-yearly, yearly and custom (1-3650 days / weeks / months).
- Domain: dates 1900-01-01..2200-12-31. Invalid dates (e.g. 2027-02-29), bad intervals and contradictory options are rejected.

### CLI contract
```
schedule-engine schedule --frequency F --anchor D --to D [--from D] [--start-index K] [--max N]
                         [--custom-value N --custom-unit DAYS|WEEKS|MONTHS] [--month-end]   -> {"dates":["2026-01-31",...]}
schedule-engine next     --frequency F --anchor D --on-or-after D [rule options]             -> {"date":"2026-02-28"}
schedule-engine version
```
Exit codes: `0` ok, `2` invalid input (JSON error on stderr, nothing on stdout), `1` internal error.
`--start-index -1` returns the date before the anchor, which Java uses as the period start of the first cycle.

## Build and test
```bash
cd native-engine && cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
```

## Java integration (`backend/.../schedule/NativeScheduleEngine.java`)
- Starts the process with an **argument list, never a shell**; arguments come only from enum names, ISO dates and bounded integers, all validated first.
- 2 s timeout (kills the process), stdout capped at 256 KB, stdin from /dev/null.
- Output must match a strict JSON grammar and be ascending, in range and within `max`; otherwise it is discarded.
- Every failure path falls back to Java and logs which implementation produced the result (`NATIVE` or `JAVA_FALLBACK`).
- `ScheduleService` (Spring) wraps it; `CycleService` and `SubscriptionService` use it.

## Verification actually performed (Ubuntu 24.04, g++ 13, JDK 21)
| Check | Result |
|---|---|
| C++ build with `-Wall -Wextra -Wpedantic` | no warnings |
| C++ unit tests (month-end, leap years, intervals, negative indices, date parsing, invalid rules) | 43/43 passed |
| CLI contract tests (output format, 16 invalid-input cases incl. shell metacharacters) | all passed (`ctest`) |
| Java client against the real binary (`backend/tools/NativeIntegrationCheck.java`) | 19/19 passed |
| Fallback on missing/non-executable binary, nonzero exit, timeout, garbage, unordered, out-of-range, extra keys, impossible date, oversized output | each verified, results identical to Java |
| **Cross-check: 2,000 random rules, native vs Java reference** (all frequencies, month-end, Feb 29 anchors, negative indices, from/to filters) | 0 mismatches, 0 silent fallbacks |

Re-run the Java integration check:
```bash
cd backend && S=src/main/java/com/smartbill && mkdir -p /tmp/ni && \
javac -d /tmp/ni $S/common/Enums.java $S/common/RecurrenceCalculator.java $S/schedule/NativeScheduleEngine.java tools/NativeIntegrationCheck.java && \
java -cp /tmp/ni NativeIntegrationCheck ../native-engine/build/schedule-engine 2000
```

## NOT verified
- The Spring wiring (`ScheduleService`, the edited `CycleService`/`SubscriptionService`) - needs `mvn test` (see stage 2 notes).
- `backend/Dockerfile` (multi-stage build; native stage uses Ubuntu 22.04 to match the JRE image's glibc) - no Docker available here.
- Behaviour on Render itself.
