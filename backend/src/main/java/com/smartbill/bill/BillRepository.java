package com.smartbill.bill;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillRepository extends JpaRepository<Bill, Long> {
    // Every lookup is scoped by user_id: ownership is enforced in the query, not after loading.
    Optional<Bill> findByIdAndUserId(Long id, Long userId);
    List<Bill> findByUserId(Long userId);
}
