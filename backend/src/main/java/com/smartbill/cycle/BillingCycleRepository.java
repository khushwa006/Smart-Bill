package com.smartbill.cycle;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BillingCycleRepository extends JpaRepository<BillingCycle, Long> {
    Optional<BillingCycle> findByIdAndUserId(Long id, Long userId);

    /** Row lock so two concurrent payments cannot both pass the "amount <= outstanding" check. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from BillingCycle c where c.id = :id and c.userId = :userId")
    Optional<BillingCycle> lockByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
}
