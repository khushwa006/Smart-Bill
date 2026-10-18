package com.smartbill.notification;

import com.smartbill.auth.AuthService;
import com.smartbill.bill.Bill;
import com.smartbill.bill.BillRepository;
import com.smartbill.common.ApiException;
import com.smartbill.common.Enums.SubscriptionState;
import com.smartbill.common.Money;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.cycle.CycleService;
import com.smartbill.schedule.ScheduleService;
import com.smartbill.subscription.Subscription;
import com.smartbill.subscription.SubscriptionRepository;
import java.math.BigDecimal;
import java.sql.Array;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    public record NotificationView(Long id, String type, String title, String message, boolean read, Instant createdAt,
                                   Long billingCycleId, Long subscriptionId) {}

    public record Preferences(List<Integer> defaultReminderDays, int dueSoonDays, boolean inAppEnabled, boolean notifyOverdue,
                              boolean notifyRenewals, boolean notifyAnomalies, double anomalyThresholdPct, boolean emailEnabled) {}

    public record GenerationResult(int created, int cyclesExtended, int subscriptionsRolled) {}

    private final JdbcTemplate jdbc;
    private final AuthService auth;
    private final BillRepository bills;
    private final SubscriptionRepository subs;
    private final CycleService cycles;
    private final ScheduleService schedule;

    public NotificationService(JdbcTemplate jdbc, AuthService auth, BillRepository bills, SubscriptionRepository subs,
                               CycleService cycles, ScheduleService schedule) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.bills = bills;
        this.subs = subs;
        this.cycles = cycles;
        this.schedule = schedule;
    }

    // ---------------------------------------------------------------- read side
    public List<NotificationView> list(Long userId, boolean unreadOnly) {
        return jdbc.query("SELECT * FROM notifications WHERE user_id = ? AND (? = FALSE OR is_read = FALSE) ORDER BY created_at DESC, id DESC LIMIT 200",
                (rs, i) -> new NotificationView(rs.getLong("id"), rs.getString("type"), rs.getString("title"), rs.getString("message"),
                        rs.getBoolean("is_read"), rs.getTimestamp("created_at").toInstant(),
                        (Long) rs.getObject("billing_cycle_id"), (Long) rs.getObject("subscription_id")), userId, unreadOnly);
    }

    public int unreadCount(Long userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE", Integer.class, userId);
    }

    public void markRead(Long userId, Long id) {
        int n = jdbc.update("UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, now()) WHERE id = ? AND user_id = ?", id, userId);
        if (n == 0) throw ApiException.notFound("Notification");
    }

    public int markAllRead(Long userId) {
        return jdbc.update("UPDATE notifications SET is_read = TRUE, read_at = now() WHERE user_id = ? AND is_read = FALSE", userId);
    }

    // ---------------------------------------------------------------- preferences
    public Preferences preferences(Long userId) {
        return jdbc.queryForObject("SELECT * FROM user_preferences WHERE user_id = ?", (rs, i) -> {
            Array a = rs.getArray("default_reminder_days");
            List<Integer> days = a == null ? List.of() : Arrays.asList((Integer[]) a.getArray());
            return new Preferences(days, rs.getInt("due_soon_days"), rs.getBoolean("in_app_enabled"), rs.getBoolean("notify_overdue"),
                    rs.getBoolean("notify_renewals"), rs.getBoolean("notify_anomalies"), rs.getDouble("anomaly_threshold_pct"),
                    rs.getBoolean("email_enabled"));
        }, userId);
    }

    public Preferences updatePreferences(Long userId, Preferences p) {
        if (p.defaultReminderDays() == null || p.defaultReminderDays().isEmpty() || p.defaultReminderDays().size() > 8
                || p.defaultReminderDays().stream().anyMatch(d -> d == null || d < 0 || d > 60))
            throw ApiException.badRequest("Reminder days: 1-8 values between 0 and 60");
        if (p.dueSoonDays() < 1 || p.dueSoonDays() > 60) throw ApiException.badRequest("Due-soon window must be 1-60 days");
        if (p.anomalyThresholdPct() < 1 || p.anomalyThresholdPct() > 500) throw ApiException.badRequest("Anomaly threshold must be 1-500%");
        Integer[] days = new TreeSet<>(p.defaultReminderDays()).descendingSet().toArray(new Integer[0]);
        jdbc.update(con -> {
            var ps = con.prepareStatement("UPDATE user_preferences SET default_reminder_days = ?, due_soon_days = ?, in_app_enabled = ?, "
                    + "notify_overdue = ?, notify_renewals = ?, notify_anomalies = ?, anomaly_threshold_pct = ? WHERE user_id = ?");
            ps.setArray(1, con.createArrayOf("integer", days));
            ps.setInt(2, p.dueSoonDays());
            ps.setBoolean(3, p.inAppEnabled());
            ps.setBoolean(4, p.notifyOverdue());
            ps.setBoolean(5, p.notifyRenewals());
            ps.setBoolean(6, p.notifyAnomalies());
            ps.setDouble(7, p.anomalyThresholdPct());
            ps.setLong(8, userId);
            return ps;
        });
        return preferences(userId);
    }

    // ---------------------------------------------------------------- generation (idempotent)
    private boolean insert(Long userId, String type, String title, String message, String key, Long cycleId, Long subId) {
        return jdbc.update("INSERT INTO notifications(user_id,type,title,message,event_key,billing_cycle_id,subscription_id) "
                + "VALUES (?,?,?,?,?,?,?) ON CONFLICT (user_id, event_key) DO NOTHING", userId, type, title, message, key, cycleId, subId) == 1;
    }

    /** Smallest configured window that already covers the remaining days (so a missed run still reminds, once). */
    static Integer windowFor(long daysLeft, Collection<Integer> windows) {
        return windows.stream().filter(w -> w >= daysLeft).min(Integer::compare).orElse(null);
    }

    static String when(long daysLeft) { return daysLeft == 0 ? "due today" : daysLeft == 1 ? "due tomorrow" : "due in " + daysLeft + " days"; }

    /**
     * Safe to run any number of times, from any number of instances: every notification has a deterministic
     * event_key and a UNIQUE(user_id, event_key) constraint, and cycle generation uses ON CONFLICT DO NOTHING.
     */
    @Transactional
    public GenerationResult generateForUser(Long userId) {
        ZoneId zone = ZoneId.of(auth.get(userId).timezone);
        LocalDate today = LocalDate.now(zone);
        Preferences prefs = preferences(userId);
        int created = 0, extended = 0, rolled = 0;

        for (Bill b : bills.findByUserId(userId)) if (b.active) extended += cycles.generate(b, zone);

        for (Subscription s : subs.findByUserId(userId)) {          // keep renewal dates current / expire finished ones
            if (s.state != SubscriptionState.ACTIVE) continue;
            if (s.endDate != null && s.endDate.isBefore(today)) {
                s.state = SubscriptionState.EXPIRED;
                subs.save(s);
                jdbc.update("INSERT INTO subscription_events(subscription_id,user_id,event_type,note) VALUES (?,?,'EXPIRED','Reached its end date')", s.id, userId);
                rolled++;
            } else if (s.nextRenewalDate == null || s.nextRenewalDate.isBefore(today)) {
                s.nextRenewalDate = schedule.firstOnOrAfter(new RecurrenceCalculator.Rule(s.frequency, s.customIntervalValue,
                        s.customIntervalUnit, s.startDate, false), today);
                subs.save(s);
                jdbc.update("INSERT INTO subscription_events(subscription_id,user_id,event_type,note) VALUES (?,?,'RENEWED','Next renewal date advanced')", s.id, userId);
                rolled++;
            }
        }
        if (!prefs.inAppEnabled()) return new GenerationResult(0, extended, rolled);

        // bill reminders + overdue
        var rows = jdbc.queryForList("SELECT s.id, s.bill_name, s.due_date, s.outstanding_amount, s.is_confirmed, s.status, b.reminder_days "
                + "FROM billing_cycle_status s JOIN bills b ON b.id = s.bill_id AND b.user_id = s.user_id "
                + "WHERE s.user_id = ? AND s.status IN ('DUE_TODAY','DUE_SOON','UPCOMING','OVERDUE')", userId);
        for (var r : rows) {
            long id = ((Number) r.get("id")).longValue();
            String name = (String) r.get("bill_name");
            LocalDate due = ((java.sql.Date) r.get("due_date")).toLocalDate();
            BigDecimal outstanding = (BigDecimal) r.get("outstanding_amount");
            boolean confirmed = (Boolean) r.get("is_confirmed");
            String amt = Money.inr(outstanding) + (confirmed ? "" : " expected (not yet confirmed)");
            if ("OVERDUE".equals(r.get("status"))) {
                if (prefs.notifyOverdue() && insert(userId, "BILL_OVERDUE", name + " is overdue",
                        amt + " was due on " + due + ".", "OVERDUE:" + id, id, null)) created++;
                continue;
            }
            Collection<Integer> windows = prefs.defaultReminderDays();
            try {
                Array a = (Array) r.get("reminder_days");
                if (a != null) windows = Arrays.asList((Integer[]) a.getArray());
            } catch (java.sql.SQLException e) { log.warn("Could not read bill reminder days", e); }
            long left = ChronoUnit.DAYS.between(today, due);
            Integer w = windowFor(left, windows);
            if (w != null && insert(userId, "BILL_DUE", name + " " + when(left), amt + ", due on " + due + ".",
                    "CYCLE_REMINDER:" + id + ":D-" + w, id, null)) created++;
        }
        // subscription renewal reminders
        if (prefs.notifyRenewals()) {
            for (Subscription s : subs.findByUserId(userId)) {
                if (s.state != SubscriptionState.ACTIVE || s.nextRenewalDate == null) continue;
                long left = ChronoUnit.DAYS.between(today, s.nextRenewalDate);
                if (left < 0) continue;
                Collection<Integer> windows = s.reminderDays != null ? Arrays.asList(s.reminderDays) : prefs.defaultReminderDays();
                Integer w = windowFor(left, windows);
                if (w != null && insert(userId, "SUBSCRIPTION_RENEWAL", s.serviceName + " renews " + when(left).replace("due ", ""),
                        Money.inr(s.amount) + " on " + s.nextRenewalDate + ". Cancel with the provider before then if you no longer want it.",
                        "RENEWAL:" + s.id + ":" + s.nextRenewalDate + ":D-" + w, null, s.id)) created++;
            }
        }
        // anomalies
        if (prefs.notifyAnomalies()) {
            for (var r : jdbc.queryForList("SELECT id, billing_cycle_id, explanation FROM anomaly_flags WHERE user_id = ?", userId)) {
                if (insert(userId, "ANOMALY", "Unusual bill amount", (String) r.get("explanation"), "ANOMALY:" + r.get("id"),
                        ((Number) r.get("billing_cycle_id")).longValue(), null)) created++;
            }
        }
        return new GenerationResult(created, extended, rolled);
    }

    public void generateForAllUsers() {
        for (Long id : jdbc.queryForList("SELECT id FROM users", Long.class)) {
            try {
                GenerationResult r = generateForUser(id);
                if (r.created() > 0) log.info("Generated {} notifications for user {}", r.created(), id);
            } catch (Exception e) {
                log.error("Notification generation failed for user {}", id, e);   // one user's failure must not stop the rest
            }
        }
    }
}
