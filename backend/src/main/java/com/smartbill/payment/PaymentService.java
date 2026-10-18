package com.smartbill.payment;

import com.smartbill.common.ApiException;
import com.smartbill.cycle.BillingCycle;
import com.smartbill.cycle.BillingCycleRepository;
import com.smartbill.payment.PaymentDtos.PaymentRequest;
import com.smartbill.subscription.SubscriptionRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentService {
    private final PaymentRepository payments;
    private final BillingCycleRepository cycles;
    private final SubscriptionRepository subscriptions;

    public PaymentService(PaymentRepository payments, BillingCycleRepository cycles, SubscriptionRepository subscriptions) {
        this.payments = payments;
        this.cycles = cycles;
        this.subscriptions = subscriptions;
    }

    /**
     * Records a payment atomically. Duplicate submissions with the same idempotencyKey return the
     * original payment. The cycle row is locked so concurrent payments cannot overpay.
     */
    @Transactional
    public Payment record(Long userId, PaymentRequest r) {
        if ((r.billingCycleId() == null) == (r.subscriptionId() == null))
            throw ApiException.badRequest("Provide exactly one of billingCycleId or subscriptionId");

        if (r.idempotencyKey() != null) {
            var existing = payments.findByUserIdAndIdempotencyKey(userId, r.idempotencyKey());
            if (existing.isPresent()) return existing.get();
        }

        if (r.billingCycleId() != null) {
            BillingCycle c = cycles.lockByIdAndUserId(r.billingCycleId(), userId)
                    .orElseThrow(() -> ApiException.notFound("Billing cycle"));
            if (c.waived) throw ApiException.conflict("This cycle was waived and cannot receive payments");
            BigDecimal payable = c.actualAmount != null ? c.actualAmount : c.expectedAmount;
            BigDecimal outstanding = payable.subtract(payments.validTotalForCycle(c.id));
            if (r.amount().compareTo(outstanding) > 0)
                throw ApiException.unprocessable("Amount exceeds the outstanding balance of " + outstanding.toPlainString());
        } else if (subscriptions.findByIdAndUserId(r.subscriptionId(), userId).isEmpty()) {
            throw ApiException.notFound("Subscription");
        }

        Payment p = new Payment();
        p.userId = userId;
        p.billingCycleId = r.billingCycleId();
        p.subscriptionId = r.subscriptionId();
        p.amount = r.amount();
        p.paidOn = r.paidOn();
        p.method = r.method();
        p.transactionRef = r.transactionRef();
        p.note = r.note();
        p.idempotencyKey = r.idempotencyKey();
        return payments.saveAndFlush(p);   // a racing duplicate key surfaces as 409; the client retry returns the original
    }

    /** Corrections never delete or edit: the payment is marked reversed with a reason, keeping the audit trail. */
    @Transactional
    public Payment reverse(Long userId, Long id, String reason) {
        Payment p = payments.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Payment"));
        if (p.reversedAt != null) throw ApiException.conflict("Payment is already reversed");
        if (p.billingCycleId != null) cycles.lockByIdAndUserId(p.billingCycleId, userId);   // serialise with new payments
        p.reversedAt = Instant.now();
        p.reversalReason = reason;
        return payments.save(p);
    }

    public List<Payment> list(Long userId) { return payments.findByUserIdOrderByPaidOnDescIdDesc(userId); }

    public List<Payment> forBill(Long userId, Long billId) { return payments.forBill(userId, billId); }
}
