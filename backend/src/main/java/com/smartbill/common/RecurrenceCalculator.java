package com.smartbill.common;

import com.smartbill.common.Enums.CustomUnit;
import com.smartbill.common.Enums.Frequency;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Pure-Java recurrence rules. This is the FALLBACK implementation; Stage 3 adds a C++ engine that
 * must produce identical results (the same test vectors will be run against both).
 *
 * Every occurrence is computed from the ANCHOR (not from the previous occurrence), so dates never drift:
 * a monthly bill anchored on the 31st gives Jan 31, Feb 28/29, Mar 31, Apr 30 ...
 * With monthEndAnchored=true the occurrence is always the last day of the month, whatever the anchor day.
 */
public final class RecurrenceCalculator {
    private RecurrenceCalculator() {}

    /** Supported domain; the C++ engine enforces the same limits. */
    public static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
    public static final LocalDate MAX_DATE = LocalDate.of(2200, 12, 31);
    public static final int MAX_CUSTOM_INTERVAL = 3650;

    public record Rule(Frequency frequency, Integer customValue, CustomUnit customUnit,
                       LocalDate anchor, boolean monthEndAnchored) {}

    /** @throws IllegalArgumentException for invalid schedules */
    public static void validate(Rule r) {
        if (r.anchor() == null || r.frequency() == null) throw new IllegalArgumentException("Frequency and anchor date are required");
        if (r.anchor().isBefore(MIN_DATE) || r.anchor().isAfter(MAX_DATE))
            throw new IllegalArgumentException("Anchor date must be between 1900-01-01 and 2200-12-31");
        if (r.frequency() == Frequency.CUSTOM) {
            if (r.customValue() == null || r.customValue() <= 0 || r.customUnit() == null)
                throw new IllegalArgumentException("Custom frequency needs a positive interval and a unit");
            if (r.customValue() > MAX_CUSTOM_INTERVAL)
                throw new IllegalArgumentException("Custom interval is too large (max " + MAX_CUSTOM_INTERVAL + ")");
        } else if (r.customValue() != null || r.customUnit() != null) {
            throw new IllegalArgumentException("Custom interval is only allowed with CUSTOM frequency");
        }
        if (r.monthEndAnchored() && !isMonthBased(r))
            throw new IllegalArgumentException("Month-end anchoring only applies to month-based schedules");
    }

    private static boolean isMonthBased(Rule r) {
        return switch (r.frequency()) {
            case MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY -> true;
            case CUSTOM -> r.customUnit() == CustomUnit.MONTHS;
            case WEEKLY -> false;
        };
    }

    /** n-th occurrence (n = 0 is the anchor; negative n goes backwards). */
    public static LocalDate occurrence(Rule r, int n) {
        return switch (r.frequency()) {
            case WEEKLY -> r.anchor().plusWeeks(n);
            case MONTHLY -> addMonths(r, n);
            case QUARTERLY -> addMonths(r, 3L * n);
            case HALF_YEARLY -> addMonths(r, 6L * n);
            case YEARLY -> addMonths(r, 12L * n);
            case CUSTOM -> switch (r.customUnit()) {
                case DAYS -> r.anchor().plusDays((long) r.customValue() * n);
                case WEEKS -> r.anchor().plusWeeks((long) r.customValue() * n);
                case MONTHS -> addMonths(r, (long) r.customValue() * n);
            };
        };
    }

    private static LocalDate addMonths(Rule r, long months) {
        YearMonth ym = YearMonth.from(r.anchor()).plusMonths(months);
        int day = r.monthEndAnchored() ? ym.lengthOfMonth() : Math.min(r.anchor().getDayOfMonth(), ym.lengthOfMonth());
        return ym.atDay(day);
    }

    /** Occurrences with from <= date <= to, in order, starting at index 0. Caps the result at {@code max} entries. */
    public static List<LocalDate> between(Rule r, LocalDate from, LocalDate to, int max) {
        return range(r, 0, from, to, max);
    }

    /**
     * Occurrences with index >= startIndex (negative = before the anchor), date >= from (if non-null)
     * and date <= to, in order, at most {@code max} entries. Mirrors `schedule-engine schedule`.
     */
    public static List<LocalDate> range(Rule r, int startIndex, LocalDate from, LocalDate to, int max) {
        validate(r);
        List<LocalDate> out = new ArrayList<>();
        for (int n = startIndex; n < startIndex + 20000 && out.size() < max; n++) {
            LocalDate d = occurrence(r, n);
            if (d.isAfter(to)) break;
            if (from == null || !d.isBefore(from)) out.add(d);
        }
        return out;
    }

    /** First occurrence on or after {@code date}. */
    public static LocalDate firstOnOrAfter(Rule r, LocalDate date) {
        validate(r);
        for (int n = 0; n < 20000; n++) {
            LocalDate d = occurrence(r, n);
            if (!d.isBefore(date)) return d;
        }
        throw new IllegalArgumentException("No occurrence found");
    }
}
