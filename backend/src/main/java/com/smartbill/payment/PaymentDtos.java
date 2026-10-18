package com.smartbill.payment;

import com.smartbill.common.Enums.PaymentMethod;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public final class PaymentDtos {
    private PaymentDtos() {}

    /** Exactly one of billingCycleId / subscriptionId. idempotencyKey: a UUID generated per form submission. */
    public record PaymentRequest(
            Long billingCycleId,
            Long subscriptionId,
            @NotNull @DecimalMin(value = "0.01") @Digits(integer = 10, fraction = 2) BigDecimal amount,
            @NotNull LocalDate paidOn,
            @NotNull PaymentMethod method,
            @Size(max = 100) String transactionRef,
            @Size(max = 1000) String note,
            @Size(max = 64) String idempotencyKey) {}

    public record ReverseRequest(@NotBlank @Size(max = 500) String reason) {}

    public record PaymentResponse(Long id, Long billingCycleId, Long subscriptionId, BigDecimal amount,
                                  LocalDate paidOn, PaymentMethod method, String transactionRef, String note,
                                  boolean reversed, Instant reversedAt, String reversalReason, Instant createdAt) {
        public static PaymentResponse from(Payment p) {
            return new PaymentResponse(p.id, p.billingCycleId, p.subscriptionId, p.amount, p.paidOn, p.method,
                    p.transactionRef, p.note, p.reversedAt != null, p.reversedAt, p.reversalReason, p.createdAt);
        }
    }
}
