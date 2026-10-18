package com.smartbill.payment;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByIdAndUserId(Long id, Long userId);
    Optional<Payment> findByUserIdAndIdempotencyKey(Long userId, String key);
    List<Payment> findByUserIdOrderByPaidOnDescIdDesc(Long userId);

    @Query("select coalesce(sum(p.amount), 0) from Payment p where p.billingCycleId = :cycleId and p.reversedAt is null")
    BigDecimal validTotalForCycle(@Param("cycleId") Long cycleId);

    @Query("select p from Payment p where p.userId = :userId and p.billingCycleId in "
         + "(select c.id from BillingCycle c where c.billId = :billId and c.userId = :userId) "
         + "order by p.paidOn desc, p.id desc")
    List<Payment> forBill(@Param("userId") Long userId, @Param("billId") Long billId);
}
