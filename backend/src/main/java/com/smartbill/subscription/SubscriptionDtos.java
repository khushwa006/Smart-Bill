package com.smartbill.subscription;

import com.smartbill.common.Enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

public final class SubscriptionDtos {
    private SubscriptionDtos() {}

    public record SubscriptionRequest(
            @NotBlank @Size(max = 120) String serviceName,
            @NotNull SubscriptionCategory category,
            @Size(max = 120) String provider,
            @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal amount,
            @NotNull Frequency frequency,
            @Positive @Max(3650) Integer customIntervalValue,
            CustomUnit customIntervalUnit,
            @NotNull LocalDate startDate,
            LocalDate nextRenewalDate,     // optional: computed from the schedule when omitted
            LocalDate endDate,
            LocalDate trialEndDate,
            List<@Min(0) @Max(60) Integer> reminderDays,
            @Size(max = 2000) String notes) {}

    public record StateChange(@NotNull SubscriptionState state, @Size(max = 500) String note) {}

    /** estimated* fields are projections from the current price, NOT money already spent. */
    public record SubscriptionResponse(Long id, String serviceName, SubscriptionCategory category, String provider,
                                       BigDecimal amount, Frequency frequency, Integer customIntervalValue,
                                       CustomUnit customIntervalUnit, LocalDate startDate, LocalDate nextRenewalDate,
                                       LocalDate endDate, LocalDate trialEndDate, SubscriptionState state,
                                       Instant cancelledAt, List<Integer> reminderDays, String notes,
                                       BigDecimal estimatedMonthlyCost, BigDecimal estimatedAnnualCost) {
        public static SubscriptionResponse from(Subscription s) {
            BigDecimal monthly = SubscriptionCost.monthly(s);
            return new SubscriptionResponse(s.id, s.serviceName, s.category, s.provider, s.amount, s.frequency,
                    s.customIntervalValue, s.customIntervalUnit, s.startDate, s.nextRenewalDate, s.endDate,
                    s.trialEndDate, s.state, s.cancelledAt,
                    s.reminderDays == null ? null : Arrays.asList(s.reminderDays), s.notes,
                    monthly, monthly.multiply(BigDecimal.valueOf(12)).setScale(2, java.math.RoundingMode.HALF_UP));
        }
    }
}
