package com.smartbill.payment;

import com.smartbill.common.Enums.PaymentMethod;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "payments")
public class Payment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "user_id") public Long userId;
    @Column(name = "billing_cycle_id") public Long billingCycleId;
    @Column(name = "subscription_id") public Long subscriptionId;
    public BigDecimal amount;
    @Column(name = "paid_on") public LocalDate paidOn;
    @Enumerated(EnumType.STRING) public PaymentMethod method;
    @Column(name = "transaction_ref") public String transactionRef;
    public String note;
    @Column(name = "idempotency_key") public String idempotencyKey;
    @Column(name = "reversed_at") public Instant reversedAt;
    @Column(name = "reversal_reason") public String reversalReason;
    @Column(name = "created_at", insertable = false, updatable = false) public Instant createdAt;
}
