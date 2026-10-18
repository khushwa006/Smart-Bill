package com.smartbill.cycle;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Read model over the billing_cycle_status view. amountConfirmed=false means payable is only an estimate. */
public record CycleView(Long id, Long billId, String billName, String category, String provider,
                        LocalDate periodStart, LocalDate periodEnd, LocalDate issueDate, LocalDate dueDate,
                        BigDecimal expectedAmount, BigDecimal actualAmount, BigDecimal amountPayable,
                        boolean amountConfirmed, BigDecimal paidAmount, BigDecimal outstandingAmount,
                        boolean partiallyPaid, String status, String notes) {}
