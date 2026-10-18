import com.smartbill.common.Enums.*;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.common.RecurrenceCalculator.Rule;
import com.smartbill.schedule.NativeScheduleEngine;
import com.smartbill.schedule.NativeScheduleEngine.Implementation;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;

/** Plain-JDK integration check: real C++ binary + Java client. Usage: java NativeIntegrationCheck <path-to-schedule-engine> [cases] */
public class NativeIntegrationCheck {
    static int fails = 0, total = 0;
    static void check(String name, boolean ok, String detail) {
        total++; if (!ok) fails++;
        System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + detail));
    }
    static Path script(String body) throws Exception {
        Path p = Files.createTempFile("fakeengine", ".sh");
        Files.writeString(p, "#!/bin/sh\n" + body + "\n");
        Files.setPosixFilePermissions(p, PosixFilePermissions.fromString("rwxr-xr-x"));
        return p;
    }

    public static void main(String[] args) throws Exception {
        Path real = Path.of(args[0]);
        int cases = args.length > 1 ? Integer.parseInt(args[1]) : 2000;
        Rule monthly31 = new Rule(Frequency.MONTHLY, null, null, LocalDate.of(2026, 1, 31), false);
        LocalDate to = LocalDate.of(2026, 4, 30);

        // 1. native path is actually used and correct
        var eng = new NativeScheduleEngine(real, Duration.ofSeconds(2));
        var r = eng.schedule(monthly31, 0, null, to, 100);
        check("native implementation is used", r.implementation() == Implementation.NATIVE, r.implementation().toString());
        check("native result correct", r.dates().equals(List.of(LocalDate.of(2026,1,31), LocalDate.of(2026,2,28), LocalDate.of(2026,3,31), LocalDate.of(2026,4,30))), r.dates().toString());
        check("first-on-or-after via native", eng.firstOnOrAfter(monthly31, LocalDate.of(2026, 2, 1)).equals(LocalDate.of(2026, 2, 28)), "");

        // 2. failure modes all fall back to Java with identical dates
        List<LocalDate> expected = RecurrenceCalculator.range(monthly31, 0, null, to, 100);
        record Case(String name, NativeScheduleEngine e) {}
        Path sleeper = script("sleep 10");
        Path failing = script("echo '{\"error\":\"boom\"}' >&2; exit 3");
        Path garbage = script("echo 'not json at all'");
        Path unordered = script("echo '{\"dates\":[\"2026-03-31\",\"2026-01-31\"]}'");
        Path outOfRange = script("echo '{\"dates\":[\"2030-01-31\"]}'");
        Path extraKeys = script("echo '{\"dates\":[\"2026-01-31\"],\"x\":1}'");
        Path huge = script("yes '{\"dates\":[]}' | head -c 2000000");
        Path badDate = script("echo '{\"dates\":[\"2026-02-30\"]}'");
        List<Case> cs = List.of(
            new Case("missing executable", new NativeScheduleEngine(Path.of("/nonexistent/engine"), Duration.ofSeconds(2))),
            new Case("non-executable file", new NativeScheduleEngine(Files.createTempFile("x", ".txt"), Duration.ofSeconds(2))),
            new Case("nonzero exit", new NativeScheduleEngine(failing, Duration.ofSeconds(2))),
            new Case("garbage output", new NativeScheduleEngine(garbage, Duration.ofSeconds(2))),
            new Case("unordered dates", new NativeScheduleEngine(unordered, Duration.ofSeconds(2))),
            new Case("date outside requested range", new NativeScheduleEngine(outOfRange, Duration.ofSeconds(2))),
            new Case("unexpected extra JSON keys", new NativeScheduleEngine(extraKeys, Duration.ofSeconds(2))),
            new Case("impossible calendar date", new NativeScheduleEngine(badDate, Duration.ofSeconds(2))),
            new Case("oversized output", new NativeScheduleEngine(huge, Duration.ofSeconds(2))));
        for (Case c : cs) {
            var res = c.e().schedule(monthly31, 0, null, to, 100);
            check("fallback: " + c.name(), res.implementation() == Implementation.JAVA_FALLBACK && res.dates().equals(expected), res.toString());
        }
        long t0 = System.nanoTime();
        var slow = new NativeScheduleEngine(sleeper, Duration.ofMillis(500)).schedule(monthly31, 0, null, to, 100);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        check("fallback: timeout (returned in " + ms + " ms, limit 500)", slow.implementation() == Implementation.JAVA_FALLBACK && ms < 3000 && slow.dates().equals(expected), slow.toString());

        // 3. invalid input is rejected before any process is started
        boolean threw = false;
        try { eng.schedule(new Rule(Frequency.CUSTOM, null, null, LocalDate.of(2026,1,1), false), 0, null, to, 10); } catch (IllegalArgumentException e) { threw = true; }
        check("invalid rule rejected in Java", threw, "");
        threw = false;
        try { eng.schedule(monthly31, 0, null, LocalDate.of(2300,1,1), 10); } catch (IllegalArgumentException e) { threw = true; }
        check("'to' out of domain rejected", threw, "");
        threw = false;
        try { eng.schedule(monthly31, 0, null, to, 5000); } catch (IllegalArgumentException e) { threw = true; }
        check("max > 1000 rejected", threw, "");

        // 4. cross-check: C++ vs Java reference on random rules
        Random rnd = new Random(20261017L);
        Frequency[] freqs = Frequency.values();
        CustomUnit[] units = CustomUnit.values();
        int mismatches = 0, nonNative = 0, nextMismatch = 0;
        for (int i = 0; i < cases; i++) {
            Frequency f = freqs[rnd.nextInt(freqs.length)];
            Integer cv = null; CustomUnit cu = null;
            if (f == Frequency.CUSTOM) { cv = 1 + rnd.nextInt(rnd.nextInt(4) == 0 ? 3650 : 60); cu = units[rnd.nextInt(3)]; }
            LocalDate anchor = LocalDate.of(1950, 1, 1).plusDays(rnd.nextInt(365 * 150));
            if (rnd.nextInt(3) == 0) anchor = anchor.withDayOfMonth(Math.min(anchor.lengthOfMonth(), 28 + rnd.nextInt(4)));
            if (rnd.nextInt(10) == 0) { int ly = 2024 + 4 * rnd.nextInt(20); if (ly == 2100) ly = 2096; anchor = LocalDate.of(ly, 2, 29); }
            boolean monthBased = f != Frequency.WEEKLY && !(f == Frequency.CUSTOM && cu != CustomUnit.MONTHS);
            Rule rule = new Rule(f, cv, cu, anchor, monthBased && rnd.nextInt(3) == 0);
            LocalDate hi = anchor.plusDays(rnd.nextInt(365 * 8) + 1);
            if (hi.isAfter(RecurrenceCalculator.MAX_DATE)) hi = RecurrenceCalculator.MAX_DATE;
            LocalDate from = rnd.nextBoolean() ? null : anchor.plusDays(rnd.nextInt(2000) - 500);
            if (from != null && from.isBefore(RecurrenceCalculator.MIN_DATE)) from = null;
            int start = rnd.nextInt(6) - 3, max = 1 + rnd.nextInt(80);
            var nat = eng.schedule(rule, start, from, hi, max);
            var ref = RecurrenceCalculator.range(rule, start, from, hi, max);
            if (nat.implementation() != Implementation.NATIVE) nonNative++;
            if (!nat.dates().equals(ref)) { mismatches++; if (mismatches <= 3) System.out.println("  MISMATCH " + rule + " start=" + start + " from=" + from + " to=" + hi + "\n   native=" + nat.dates() + "\n   java  =" + ref); }
            LocalDate probe = anchor.plusDays(rnd.nextInt(3000) - 800);
            if (probe.isBefore(RecurrenceCalculator.MIN_DATE)) probe = RecurrenceCalculator.MIN_DATE;
            if (probe.isAfter(RecurrenceCalculator.MAX_DATE.minusYears(10))) probe = anchor;
            try {
                if (!eng.firstOnOrAfter(rule, probe).equals(RecurrenceCalculator.firstOnOrAfter(rule, probe))) nextMismatch++;
            } catch (IllegalArgumentException e) { /* both reject, fine */ }
        }
        check("cross-check " + cases + " random schedules: all native results identical to Java", mismatches == 0, mismatches + " mismatches");
        check("cross-check: every case really ran natively (no silent fallback)", nonNative == 0, nonNative + " fell back");
        check("cross-check: firstOnOrAfter identical", nextMismatch == 0, nextMismatch + " mismatches");

        System.out.println(fails == 0 ? "ALL " + total + " CHECKS PASSED" : fails + " OF " + total + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
