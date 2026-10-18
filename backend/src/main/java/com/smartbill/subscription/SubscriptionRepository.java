package com.smartbill.subscription;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
    Optional<Subscription> findByIdAndUserId(Long id, Long userId);
    List<Subscription> findByUserId(Long userId);
}
