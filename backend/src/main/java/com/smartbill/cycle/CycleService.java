package com.smartbill.cycle;

import com.smartbill.bill.Bill;
import com.smartbill.common.ApiException;
import com.smartbill.common.RecurrenceCalculator.Rule;
import com.smartbill.schedule.ScheduleService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CycleService {
    static final int HORIZON_DAYS = 120;   // how far ahead cycles are materialised
    static final int MAX_CYCLES = 600;

    private final JdbcTemplate jdbc;
    private final BillingCycleRepository cycles;
    private final CycleQueryRepository queries;
    private final ScheduleService schedule;

    public CycleService(JdbcTemplate jdbc, BillingCycleRepository cycles, CycleQueryRepository queries,
                        ScheduleService schedule) {
        this.schedule = schedule;
        this.jdbc = jdbc;
        this.cycles = cycles;
        this.queries = queries;
    }

    public static Rule ruleOf(Bill b) {
        return new Rule(b.frequency, b.customIntervalValue, b.customIntervalUnit, b.anchorDate, b.monthEndAnchored);
    }

    /**
     * Idempotent: INSERT ... ON CONFLICT DO NOTHING on (bill_id, period_start), so running it twice
     * (or from two instances at once) never creates duplicates. Returns number of NEW cycles.
     */
    @Transactional
    public int generate(Bill bill, ZoneId userZone) {
        if (!bill.active) return 0;
        LocalDate today = LocalDate.now(userZone);
        LocalDate limit = today.plusDays(HORIZON_DAYS);
        if (bill.endDate != null && bill.endDate.isBefore(limit)) limit = bill.endDate;
        Rule rule = ruleOf(bill);
        int created = 0;
        // index -1 gives the period start of the first cycle; every following date is a due date
        List<LocalDate> dates = schedule.schedule(rule, -1, null, limit, MAX_CYCLES + 1).dates();
        for (int i = 1; i < dates.size(); i++) {
            LocalDate start = dates.get(i - 1);
            LocalDate due = dates.get(i);
            created += jdbc.update(
                    "INSERT INTO billing_cycles(bill_id,user_id,period_start,period_end,due_date,expected_amount) "
                  + "VALUES (?,?,?,?,?,?) ON CONFLICT (bill_id, period_start) DO NOTHING",
                    bill.id, bill.userId, start, due.minusDays(1), due, bill.expectedAmount);
        }
        return created;
    }

    /** Before regenerating after a bill edit: drop future cycles that have no amount set and no payments. */
    @Transactional
    public void discardFutureUntouched(Long billId, Long userId, ZoneId userZone) {
        jdbc.update("DELETE FROM billing_cycles c WHERE c.bill_id = ? AND c.user_id = ? AND c.due_date >= ? "
                  + "AND c.actual_amount IS NULL AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.billing_cycle_id = c.id)",
                billId, userId, LocalDate.now(userZone));
    }

    public List<CycleView> history(Long userId, Long billId) { return queries.forBill(userId, billId); }

    public List<CycleView> list(Long userId, LocalDate from, LocalDate to, String status) {
        return queries.list(userId, from, to, status);
    }

    public CycleView get(Long userId, Long cycleId) {
        return queries.find(userId, cycleId).orElseThrow(() -> ApiException.notFound("Billing cycle"));
    }

    public record CycleUpdate(BigDecimal actualAmount, LocalDate issueDate, String notes, Boolean waived) {}

    /** Record the real bill amount (variable bills), issue date, notes, or waive the cycle. */
    @Transactional
    public CycleView update(Long userId, Long cycleId, CycleUpdate req) {
        BillingCycle c = cycles.lockByIdAndUserId(cycleId, userId).orElseThrow(() -> ApiException.notFound("Billing cycle"));
        if (req.actualAmount() != null) {
            if (req.actualAmount().signum() < 0) throw ApiException.badRequest("Amount cannot be negative");
            BigDecimal paid = jdbc.queryForObject(
                    "SELECT COALESCE(SUM(amount),0) FROM payments WHERE billing_cycle_id = ? AND reversed_at IS NULL",
                    BigDecimal.class, cycleId);
            if (req.actualAmount().compareTo(paid) < 0)
                throw ApiException.unprocessable("Actual amount is below what has already been paid; reverse a payment first");
            c.actualAmount = req.actualAmount();
        }
        if (req.issueDate() != null) c.issueDate = req.issueDate();
        if (req.notes() != null) c.notes = req.notes();
        if (req.waived() != null) c.waived = req.waived();
        cycles.save(c);
        return get(userId, cycleId);
    }
}
