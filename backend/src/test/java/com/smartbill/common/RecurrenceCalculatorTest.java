package com.smartbill.common;

import static org.junit.jupiter.api.Assertions.*;

import com.smartbill.common.Enums.CustomUnit;
import com.smartbill.common.Enums.Frequency;
import com.smartbill.common.RecurrenceCalculator.Rule;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class RecurrenceCalculatorTest {
    private static Rule rule(Frequency f, int y, int m, int d, boolean monthEnd) {
        return new Rule(f, null, null, LocalDate.of(y, m, d), monthEnd);
    }

    @Test void monthlyOn31stClampsThenRecovers() {
        Rule r = rule(Frequency.MONTHLY, 2026, 1, 31, false);
        assertEquals(LocalDate.of(2026, 2, 28), RecurrenceCalculator.occurrence(r, 1));
        assertEquals(LocalDate.of(2026, 3, 31), RecurrenceCalculator.occurrence(r, 2));
        assertEquals(LocalDate.of(2026, 4, 30), RecurrenceCalculator.occurrence(r, 3));
        assertEquals(LocalDate.of(2028, 2, 29), RecurrenceCalculator.occurrence(r, 25));
    }

    @Test void monthEndAnchoredAlwaysLastDay() {
        Rule r = rule(Frequency.MONTHLY, 2026, 1, 30, true);
        assertEquals(LocalDate.of(2026, 2, 28), RecurrenceCalculator.occurrence(r, 1));
        assertEquals(LocalDate.of(2026, 3, 31), RecurrenceCalculator.occurrence(r, 2));
    }

    @Test void leapDayYearly() {
        Rule r = rule(Frequency.YEARLY, 2024, 2, 29, false);
        assertEquals(LocalDate.of(2025, 2, 28), RecurrenceCalculator.occurrence(r, 1));
        assertEquals(LocalDate.of(2028, 2, 29), RecurrenceCalculator.occurrence(r, 4));
    }

    @Test void weeklyQuarterlyHalfYearly() {
        assertEquals(LocalDate.of(2026, 11, 6), RecurrenceCalculator.occurrence(rule(Frequency.WEEKLY, 2026, 10, 16, false), 3));
        assertEquals(LocalDate.of(2027, 2, 28), RecurrenceCalculator.occurrence(rule(Frequency.QUARTERLY, 2026, 11, 30, false), 1));
        assertEquals(LocalDate.of(2027, 2, 28), RecurrenceCalculator.occurrence(rule(Frequency.HALF_YEARLY, 2026, 8, 31, false), 1));
    }

    @Test void customIntervals() {
        assertEquals(LocalDate.of(2026, 4, 1), RecurrenceCalculator.occurrence(
                new Rule(Frequency.CUSTOM, 45, CustomUnit.DAYS, LocalDate.of(2026, 1, 1), false), 2));
        assertEquals(LocalDate.of(2027, 2, 28), RecurrenceCalculator.occurrence(
                new Rule(Frequency.CUSTOM, 2, CustomUnit.MONTHS, LocalDate.of(2026, 12, 31), false), 1));
    }

    @Test void betweenIsInclusiveAndOrdered() {
        var list = RecurrenceCalculator.between(rule(Frequency.MONTHLY, 2026, 10, 18, false),
                LocalDate.of(2026, 10, 18), LocalDate.of(2027, 1, 18), 50);
        assertEquals(4, list.size());
        assertEquals(LocalDate.of(2027, 1, 18), list.get(3));
    }

    @Test void invalidSchedulesRejected() {
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.validate(
                new Rule(Frequency.CUSTOM, null, null, LocalDate.of(2026, 1, 1), false)));
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.validate(
                new Rule(Frequency.CUSTOM, 0, CustomUnit.DAYS, LocalDate.of(2026, 1, 1), false)));
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.validate(
                new Rule(Frequency.MONTHLY, 1, CustomUnit.DAYS, LocalDate.of(2026, 1, 1), false)));
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.validate(
                rule(Frequency.WEEKLY, 2026, 1, 1, true)));
        assertThrows(IllegalArgumentException.class, () -> RecurrenceCalculator.validate(
                new Rule(Frequency.MONTHLY, null, null, null, false)));
    }
}
