package com.smartbill.bill;

import com.smartbill.common.Enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

public final class BillDtos {
    private BillDtos() {}

    public record BillRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull BillCategory category,
            @Size(max = 120) String provider,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal expectedAmount,
            boolean variable,
            @NotNull Frequency frequency,
            @Positive @Max(3650) Integer customIntervalValue,
            CustomUnit customIntervalUnit,
            @NotNull LocalDate anchorDate,
            boolean monthEndAnchored,
            LocalDate endDate,
            List<@Min(0) @Max(60) Integer> reminderDays,
            @Size(max = 2000) String notes) {}

    public record BillResponse(Long id, String name, BillCategory category, String provider,
                               BigDecimal expectedAmount, boolean variable, Frequency frequency,
                               Integer customIntervalValue, CustomUnit customIntervalUnit,
                               LocalDate anchorDate, boolean monthEndAnchored, LocalDate endDate,
                               List<Integer> reminderDays, String notes, boolean active,
                               Instant createdAt, Instant updatedAt) {
        public static BillResponse from(Bill b) {
            return new BillResponse(b.id, b.name, b.category, b.provider, b.expectedAmount, b.variable,
                    b.frequency, b.customIntervalValue, b.customIntervalUnit, b.anchorDate, b.monthEndAnchored,
                    b.endDate, b.reminderDays == null ? null : Arrays.asList(b.reminderDays), b.notes, b.active,
                    b.createdAt, b.updatedAt);
        }
    }
}
