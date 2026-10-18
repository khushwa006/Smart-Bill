package com.smartbill.cycle;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "billing_cycles")
public class BillingCycle {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "bill_id") public Long billId;
    @Column(name = "user_id") public Long userId;
    @Column(name = "period_start") public LocalDate periodStart;
    @Column(name = "period_end") public LocalDate periodEnd;
    @Column(name = "issue_date") public LocalDate issueDate;
    @Column(name = "due_date") public LocalDate dueDate;
    @Column(name = "expected_amount") public BigDecimal expectedAmount;
    @Column(name = "actual_amount") public BigDecimal actualAmount;
    @Column(name = "is_waived") public boolean waived;
    public String notes;
}
