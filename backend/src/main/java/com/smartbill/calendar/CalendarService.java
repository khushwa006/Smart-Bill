package com.smartbill.calendar;

import com.smartbill.auth.AuthService;
import com.smartbill.common.ApiException;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.cycle.CycleQueryRepository;
import com.smartbill.cycle.CycleView;
import com.smartbill.schedule.ScheduleService;
import com.smartbill.subscription.Subscription;
import com.smartbill.subscription.SubscriptionRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class CalendarService {
    public static final int MAX_RANGE_DAYS = 400;

    /**
     * amountKind tells the UI how solid the number is:
     * CONFIRMED (real bill amount known) | EXPECTED (user's expected amount) | PREDICTED (forecast from Python)
     * | SCHEDULED (subscription renewal at its current price).
     */
    public record CalendarItem(String type, Long id, Long refId, String title, String category, LocalDate date,
                               BigDecimal amount, String amountKind, String status, BigDecimal outstanding) {}

    private final JdbcTemplate jdbc;
    private final CycleQueryRepository cycles;
    private final SubscriptionRepository subs;
    private final ScheduleService schedule;
    private final AuthService auth;

    public CalendarService(JdbcTemplate jdbc, CycleQueryRepository cycles, SubscriptionRepository subs,
                           ScheduleService schedule, AuthService auth) {
        this.jdbc = jdbc;
        this.cycles = cycles;
        this.subs = subs;
        this.schedule = schedule;
        this.auth = auth;
    }

    public List<CalendarItem> items(Long userId, LocalDate from, LocalDate to, String category, String status, String type) {
        if (from == null || to == null || to.isBefore(from)) throw ApiException.badRequest("Provide a valid from/to date range");
        if (ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) throw ApiException.badRequest("Date range is too large (max " + MAX_RANGE_DAYS + " days)");
        LocalDate today = LocalDate.now(ZoneId.of(auth.get(userId).timezone));
        List<CalendarItem> out = new ArrayList<>();

        if (type == null || "BILL".equalsIgnoreCase(type)) {
            Set<Long> variable = new HashSet<>(jdbc.queryForList("SELECT id FROM bills WHERE user_id = ? AND is_variable", Long.class, userId));
            Map<String, BigDecimal> predicted = new HashMap<>();
            jdbc.query("SELECT DISTINCT ON (bill_id, forecast_period_start) bill_id, forecast_period_start, forecast_amount "
                     + "FROM predictions WHERE user_id = ? AND forecast_period_start BETWEEN ? AND ? "
                     + "ORDER BY bill_id, forecast_period_start, generated_at DESC",
                    rs -> { predicted.put(rs.getLong("bill_id") + "|" + rs.getObject("forecast_period_start", LocalDate.class),
                            rs.getBigDecimal("forecast_amount")); }, userId, from.minusDays(60), to);
            for (CycleView c : cycles.list(userId, from, to, null)) {
                BigDecimal amount = c.amountPayable();
                String kind = c.amountConfirmed() ? "CONFIRMED" : "EXPECTED";
                BigDecimal p = predicted.get(c.billId() + "|" + c.periodStart());
                if (!c.amountConfirmed() && p != null && variable.contains(c.billId())) { amount = p; kind = "PREDICTED"; }
                out.add(new CalendarItem("BILL", c.id(), c.billId(), c.billName(), c.category(), c.dueDate(), amount, kind,
                        c.status(), c.outstandingAmount()));
            }
        }
        if (type == null || "SUBSCRIPTION".equalsIgnoreCase(type)) {
            for (Subscription s : subs.findByUserId(userId)) {
                if (s.state != com.smartbill.common.Enums.SubscriptionState.ACTIVE) continue;
                LocalDate hi = s.endDate != null && s.endDate.isBefore(to) ? s.endDate : to;
                if (hi.isBefore(from)) continue;
                var rule = new RecurrenceCalculator.Rule(s.frequency, s.customIntervalValue, s.customIntervalUnit, s.startDate, false);
                for (LocalDate d : schedule.schedule(rule, 0, from, hi, MAX_RANGE_DAYS).dates()) {
                    String st = d.isBefore(today) ? "PAST" : d.equals(today) ? "DUE_TODAY" : !d.isAfter(today.plusDays(7)) ? "DUE_SOON" : "UPCOMING";
                    out.add(new CalendarItem("SUBSCRIPTION", s.id, s.id, s.serviceName, s.category.name(), d, s.amount,
                            "SCHEDULED", st, null));
                }
            }
        }
        return out.stream()
                .filter(i -> category == null || category.isBlank() || i.category().equalsIgnoreCase(category))
                .filter(i -> status == null || status.isBlank() || i.status().equalsIgnoreCase(status))
                .sorted(Comparator.comparing(CalendarItem::date).thenComparing(CalendarItem::title))
                .limit(2000).toList();
    }
}
