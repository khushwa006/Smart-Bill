package com.smartbill.schedule;

import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.common.RecurrenceCalculator.Rule;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Calls the compiled C++ schedule engine and falls back to the Java reference implementation
 * ({@link RecurrenceCalculator}) when the executable is missing, slow, fails, or returns anything
 * that does not validate. Pure JDK on purpose (no Spring) so it can be tested in isolation.
 *
 * Safety: the process is started with an argument LIST (never a shell), arguments are built only from
 * enum names, ISO dates and bounded integers (validated first), stdout is size-capped, a timeout kills
 * the process, and the output must match a strict grammar and invariants before it is trusted.
 */
public class NativeScheduleEngine {
    public enum Implementation { NATIVE, JAVA_FALLBACK }

    public record Result(List<LocalDate> dates, Implementation implementation) {}

    private static final System.Logger LOG = System.getLogger(NativeScheduleEngine.class.getName());
    private static final int MAX_OUTPUT_BYTES = 256 * 1024;
    private static final Pattern DATES_JSON =
            Pattern.compile("^\\{\"dates\":\\[(?:\"\\d{4}-\\d{2}-\\d{2}\"(?:,\"\\d{4}-\\d{2}-\\d{2}\")*)?]}\\s*$");
    private static final Pattern DATE_JSON = Pattern.compile("^\\{\"date\":\"(\\d{4}-\\d{2}-\\d{2})\"}\\s*$");
    private static final Pattern DATE_TOKEN = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private final Path executable;
    private final Duration timeout;

    public NativeScheduleEngine(Path executable, Duration timeout) {
        this.executable = executable;
        this.timeout = timeout;
    }

    /** Occurrences with index >= startIndex, date >= from (nullable) and date <= to, at most max (1..1000). */
    public Result schedule(Rule rule, int startIndex, LocalDate from, LocalDate to, int max) {
        RecurrenceCalculator.validate(rule);                       // IllegalArgumentException for bad input
        if (to == null || to.isBefore(RecurrenceCalculator.MIN_DATE) || to.isAfter(RecurrenceCalculator.MAX_DATE))
            throw new IllegalArgumentException("'to' must be between 1900-01-01 and 2200-12-31");
        if (max < 1 || max > 1000) throw new IllegalArgumentException("max must be 1..1000");

        List<String> args = ruleArgs(rule);
        args.addAll(List.of("--to", to.toString(), "--start-index", Integer.toString(startIndex), "--max", Integer.toString(max)));
        if (from != null) args.addAll(List.of("--from", from.toString()));

        Optional<String> out = runNative("schedule", args);
        if (out.isPresent()) {
            List<LocalDate> parsed = parseDates(out.get(), from, to, max);
            if (parsed != null) return new Result(parsed, Implementation.NATIVE);
            LOG.log(System.Logger.Level.WARNING, "Native engine output failed validation; using Java fallback");
        }
        LOG.log(System.Logger.Level.INFO, "Schedule computed by Java fallback");
        return new Result(RecurrenceCalculator.range(rule, startIndex, from, to, max), Implementation.JAVA_FALLBACK);
    }

    /** First occurrence on or after {@code date}. */
    public LocalDate firstOnOrAfter(Rule rule, LocalDate date) {
        RecurrenceCalculator.validate(rule);
        if (date == null || date.isBefore(RecurrenceCalculator.MIN_DATE) || date.isAfter(RecurrenceCalculator.MAX_DATE))
            throw new IllegalArgumentException("date must be between 1900-01-01 and 2200-12-31");
        List<String> args = ruleArgs(rule);
        args.addAll(List.of("--on-or-after", date.toString()));
        Optional<String> out = runNative("next", args);
        if (out.isPresent()) {
            Matcher m = DATE_JSON.matcher(out.get());
            if (m.matches()) {
                try {
                    LocalDate d = LocalDate.parse(m.group(1));
                    if (!d.isBefore(date)) return d;
                } catch (DateTimeParseException ignored) { /* fall through to fallback */ }
            }
            LOG.log(System.Logger.Level.WARNING, "Native engine 'next' output failed validation; using Java fallback");
        }
        return RecurrenceCalculator.firstOnOrAfter(rule, date);
    }

    private static List<String> ruleArgs(Rule r) {
        List<String> a = new ArrayList<>(List.of("--frequency", r.frequency().name(), "--anchor", r.anchor().toString()));
        if (r.customValue() != null) {
            a.addAll(List.of("--custom-value", Integer.toString(r.customValue()), "--custom-unit", r.customUnit().name()));
        }
        if (r.monthEndAnchored()) a.add("--month-end");
        return a;
    }

    /** Returns stdout on exit code 0, or empty (after logging why) for every failure mode. */
    private Optional<String> runNative(String command, List<String> args) {
        if (executable == null || !Files.isExecutable(executable)) {
            LOG.log(System.Logger.Level.WARNING, "Native engine not found or not executable: {0}", executable);
            return Optional.empty();
        }
        List<String> cmd = new ArrayList<>();
        cmd.add(executable.toString());
        cmd.add(command);
        cmd.addAll(args);
        Process p = null;
        try {
            p = new ProcessBuilder(cmd).redirectInput(ProcessBuilder.Redirect.from(nullFile())).start();
            CompletableFuture<byte[]> stdout = readCapped(p.getInputStream());
            CompletableFuture<byte[]> stderr = readCapped(p.getErrorStream());
            if (!p.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                LOG.log(System.Logger.Level.WARNING, "Native engine timed out after {0} ms", timeout.toMillis());
                return Optional.empty();
            }
            int code = p.exitValue();
            if (code != 0) {
                String err = new String(stderr.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8);
                LOG.log(System.Logger.Level.WARNING, "Native engine exited with code {0}: {1}", code, err.strip());
                return Optional.empty();
            }
            return Optional.of(new String(stdout.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (p != null) p.destroyForcibly();
            return Optional.empty();
        } catch (Exception e) {
            LOG.log(System.Logger.Level.WARNING, "Native engine invocation failed: {0}", e.toString());
            if (p != null) p.destroyForcibly();
            return Optional.empty();
        }
    }

    private static java.io.File nullFile() { return new java.io.File("/dev/null"); }

    private static CompletableFuture<byte[]> readCapped(InputStream in) {
        return CompletableFuture.supplyAsync(() -> {
            try (in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[4096];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    if (buf.size() + n > MAX_OUTPUT_BYTES) throw new IOException("output too large");
                    buf.write(chunk, 0, n);
                }
                return buf.toByteArray();
            } catch (IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
    }

    /** Strict grammar + invariants (ascending, in range, count cap). Returns null when anything is off. */
    static List<LocalDate> parseDates(String json, LocalDate from, LocalDate to, int max) {
        if (!DATES_JSON.matcher(json).matches()) return null;
        List<LocalDate> out = new ArrayList<>();
        Matcher m = DATE_TOKEN.matcher(json);
        try {
            while (m.find()) out.add(LocalDate.parse(m.group()));
        } catch (DateTimeParseException e) {
            return null;
        }
        if (out.size() > max) return null;
        for (int i = 0; i < out.size(); i++) {
            LocalDate d = out.get(i);
            if (d.isAfter(to) || (from != null && d.isBefore(from))) return null;
            if (i > 0 && !d.isAfter(out.get(i - 1))) return null;
        }
        return out;
    }
}
