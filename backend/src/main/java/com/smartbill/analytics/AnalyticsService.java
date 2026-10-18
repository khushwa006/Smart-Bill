package com.smartbill.analytics;

import com.smartbill.auth.AuthService;
import com.smartbill.bill.Bill;
import com.smartbill.bill.BillRepository;
import com.smartbill.common.ApiException;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.common.Enums.SubscriptionState;
import com.smartbill.schedule.ScheduleService;
import com.smartbill.subscription.Subscription;
import com.smartbill.subscription.SubscriptionCost;
import com.smartbill.subscription.SubscriptionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Metric definitions (each is computed from stored records, never hard-coded):
 *  - overdue:            outstanding amount of cycles whose status is OVERDUE (paid portions already subtracted)
 *  - dueNext7/30:        outstanding of unpaid cycles due in the window, split into CONFIRMED (actual amount known)
 *                        and EXPECTED (only the expected amount is known). Predictions are NOT added in.
 *  - renewalsNext30:     active subscription renewals in the window at the current price (SCHEDULED).
 *  - paidLast30Days:     sum of non-reversed payments (bills + subscriptions) dated in the last 30 days.
 *  - recurring monthly:  each ACTIVE bill and ACTIVE subscription counted once, normalised to a monthly ESTIMATE.
 *  - predictedNext30:    latest stored prediction per bill for periods starting in the next 30 days (PREDICTED).
 */
@Service
public class AnalyticsService {
    private final JdbcTemplate jdbc;
    private final AuthService auth;
    private final BillRepository bills;
    private final SubscriptionRepository subs;
    private final ScheduleService schedule;

    public AnalyticsService(JdbcTemplate jdbc, AuthService auth, BillRepository bills, SubscriptionRepository subs,
                            ScheduleService schedule) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.bills = bills;
        this.subs = subs;
        this.schedule = schedule;
    }

    private LocalDate today(Long userId) { return LocalDate.now(ZoneId.of(auth.get(userId).timezone)); }

    private static BigDecimal zero(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    public record Split(BigDecimal confirmed, BigDecimal expected, int count) {}

    private Split window(Long userId, LocalDate today, int days) {
        BigDecimal[] sums = {BigDecimal.ZERO, BigDecimal.ZERO};
        int[] count = {0};
        jdbc.query("SELECT is_confirmed, SUM(outstanding_amount) AS s, COUNT(*) AS n FROM billing_cycle_status "
                 + "WHERE user_id = ? AND status IN ('DUE_TODAY','DUE_SOON','UPCOMING') AND due_date BETWEEN ? AND ? GROUP BY is_confirmed",
                rs -> { sums[rs.getBoolean("is_confirmed") ? 0 : 1] = zero(rs.getBigDecimal("s")); count[0] += rs.getInt("n"); },
                userId, today, today.plusDays(days));
        return new Split(sums[0], sums[1], count[0]);
    }

    public record Renewals(BigDecimal amount, int count) {}

    private Renewals renewals(Long userId, LocalDate today, int days) {
        BigDecimal total = BigDecimal.ZERO;
        int n = 0;
        for (Subscription s : subs.findByUserId(userId)) {
            if (s.state != SubscriptionState.ACTIVE) continue;
            LocalDate hi = s.endDate != null && s.endDate.isBefore(today.plusDays(days)) ? s.endDate : today.plusDays(days);
            if (hi.isBefore(today)) continue;
            var rule = new RecurrenceCalculator.Rule(s.frequency, s.customIntervalValue, s.customIntervalUnit, s.startDate, false);
            int k = schedule.schedule(rule, 0, today, hi, 400).dates().size();
            n += k;
            total = total.add(s.amount.multiply(BigDecimal.valueOf(k)));
        }
        return new Renewals(total, n);
    }

    public Map<String, Object> summary(Long userId) {
        LocalDate today = today(userId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("asOf", today);
        jdbc.query("SELECT COALESCE(SUM(outstanding_amount),0) AS s, COUNT(*) AS n FROM billing_cycle_status WHERE user_id = ? AND status = 'OVERDUE'",
                rs -> { m.put("overdue", Map.of("amount", rs.getBigDecimal("s"), "count", rs.getInt("n"))); }, userId);
        m.put("dueNext7Days", window(userId, today, 7));
        m.put("dueNext30Days", window(userId, today, 30));
        m.put("renewalsNext30Days", renewals(userId, today, 30));
        m.put("paidLast30Days", jdbc.queryForObject(
                "SELECT COALESCE(SUM(amount),0) FROM payments WHERE user_id = ? AND reversed_at IS NULL AND paid_on > ?",
                BigDecimal.class, userId, today.minusDays(30)));
        BigDecimal billsMonthly = bills.findByUserId(userId).stream().filter(b -> b.active)
                .map(b -> SubscriptionCost.monthly(b.expectedAmount, b.frequency, b.customIntervalValue, b.customIntervalUnit))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal subsMonthly = subs.findByUserId(userId).stream().filter(s -> s.state == SubscriptionState.ACTIVE)
                .map(SubscriptionCost::monthly).reduce(BigDecimal.ZERO, BigDecimal::add);
        m.put("recurringMonthlyEstimate", Map.of("bills", billsMonthly, "subscriptions", subsMonthly, "total", billsMonthly.add(subsMonthly),
                "kind", "ESTIMATE"));
        m.put("recurringAnnualEstimate", Map.of("total", billsMonthly.add(subsMonthly).multiply(BigDecimal.valueOf(12)), "kind", "ESTIMATE"));
        m.put("predictedNext30Days", jdbc.queryForObject(
                "SELECT COALESCE(SUM(forecast_amount),0) FROM (SELECT DISTINCT ON (bill_id) forecast_amount FROM predictions "
              + "WHERE user_id = ? AND forecast_period_start BETWEEN ? AND ? ORDER BY bill_id, generated_at DESC) t",
                BigDecimal.class, userId, today, today.plusDays(30)));
        m.put("anomaliesLast90Days", jdbc.queryForObject(
                "SELECT COUNT(*) FROM anomaly_flags WHERE user_id = ? AND detected_at > now() - interval '90 days'", Integer.class, userId));
        return m;
    }

    public Map<String, Object> trends(Long userId, int months, Long billId) {
        if (months < 1 || months > 24) throw ApiException.badRequest("months must be 1..24");
        if (billId != null) bills.findByIdAndUserId(billId, userId).orElseThrow(() -> ApiException.notFound("Bill"));
        YearMonth end = YearMonth.from(today(userId));
        YearMonth start = end.minusMonths(months - 1L);
        LocalDate lo = start.atDay(1), hi = end.atEndOfMonth();
        Map<String, BigDecimal> paid = new HashMap<>(), billed = new HashMap<>();
        jdbc.query("SELECT to_char(date_trunc('month', p.paid_on), 'YYYY-MM') AS m, SUM(p.amount) AS s FROM payments p "
                 + "LEFT JOIN billing_cycles c ON c.id = p.billing_cycle_id "
                 + "WHERE p.user_id = ? AND p.reversed_at IS NULL AND p.paid_on BETWEEN ? AND ? AND (?::bigint IS NULL OR c.bill_id = ?::bigint) GROUP BY 1",
                rs -> { paid.put(rs.getString("m"), rs.getBigDecimal("s")); }, userId, lo, hi, billId, billId);
        jdbc.query("SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS m, SUM(actual_amount) AS s FROM billing_cycles "
                 + "WHERE user_id = ? AND actual_amount IS NOT NULL AND NOT is_waived AND due_date BETWEEN ? AND ? "
                 + "AND (?::bigint IS NULL OR bill_id = ?::bigint) GROUP BY 1",
                rs -> { billed.put(rs.getString("m"), rs.getBigDecimal("s")); }, userId, lo, hi, billId, billId);
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal prev = null;
        for (YearMonth ym = start; !ym.isAfter(end); ym = ym.plusMonths(1)) {
            String key = ym.toString();
            BigDecimal b = billed.get(key);
            Double change = (b != null && prev != null && prev.signum() > 0)
                    ? b.subtract(prev).multiply(BigDecimal.valueOf(100)).divide(prev, 1, RoundingMode.HALF_UP).doubleValue() : null;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", key);
            row.put("paid", paid.getOrDefault(key, BigDecimal.ZERO));
            row.put("billedActual", b);              // null = no confirmed bill that month
            row.put("billedChangePct", change);      // month-over-month, only between consecutive confirmed months
            rows.add(row);
            prev = b;
        }
        return Map.of("months", rows, "note", "paid = payments made; billedActual = confirmed bill amounts by due month. Predictions are not included.");
    }

    public Map<String, Object> subscriptions(Long userId, List<Long> cancel) {
        List<Subscription> active = subs.findByUserId(userId).stream().filter(s -> s.state == SubscriptionState.ACTIVE).toList();
        Map<String, List<Subscription>> byCat = active.stream().collect(Collectors.groupingBy(s -> s.category.name(), TreeMap::new, Collectors.toList()));
        List<Map<String, Object>> cats = new ArrayList<>(), overlaps = new ArrayList<>();
        byCat.forEach((cat, list) -> {
            BigDecimal monthly = list.stream().map(SubscriptionCost::monthly).reduce(BigDecimal.ZERO, BigDecimal::add);
            cats.add(Map.of("category", cat, "count", list.size(), "monthlyEstimate", monthly,
                    "annualEstimate", monthly.multiply(BigDecimal.valueOf(12))));
            if (list.size() >= 2 && !cat.equals("OTHER") && !cat.equals("MEMBERSHIP"))
                overlaps.add(Map.of("category", cat, "services", list.stream().map(s -> s.serviceName).toList(), "monthlyEstimate", monthly));
        });
        List<Map<String, Object>> picked = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        if (cancel != null) {
            for (Subscription s : active) {
                if (!cancel.contains(s.id)) continue;       // only the caller's own active subscriptions can match
                BigDecimal mo = SubscriptionCost.monthly(s);
                total = total.add(mo);
                picked.add(Map.of("id", s.id, "name", s.serviceName, "monthlyEstimate", mo, "annualEstimate", mo.multiply(BigDecimal.valueOf(12))));
            }
        }
        return Map.of("byCategory", cats, "possibleOverlaps", overlaps,
                "estimatedSavings", Map.of("selected", picked, "monthly", total, "annual", total.multiply(BigDecimal.valueOf(12)),
                        "note", "Estimate from current prices. Cancelling here only updates SmartBill; cancel with the provider to actually stop charges."));
    }
}
