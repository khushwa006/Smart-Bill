package com.smartbill.subscription;

import com.smartbill.auth.AuthService;
import com.smartbill.common.ApiException;
import com.smartbill.common.Enums.SubscriptionState;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.common.RecurrenceCalculator.Rule;
import com.smartbill.schedule.ScheduleService;
import com.smartbill.subscription.SubscriptionDtos.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SubscriptionService {
    private final SubscriptionRepository repo;
    private final AuthService auth;
    private final JdbcTemplate jdbc;
    private final ScheduleService schedule;

    public SubscriptionService(SubscriptionRepository repo, AuthService auth, JdbcTemplate jdbc, ScheduleService schedule) {
        this.schedule = schedule;
        this.repo = repo;
        this.auth = auth;
        this.jdbc = jdbc;
    }

    private LocalDate today(Long userId) { return LocalDate.now(ZoneId.of(auth.get(userId).timezone)); }

    private Rule rule(Subscription s) {
        return new Rule(s.frequency, s.customIntervalValue, s.customIntervalUnit, s.startDate, false);
    }

    private void apply(Subscription s, SubscriptionRequest r, LocalDate today) {
        s.serviceName = r.serviceName().trim();
        s.category = r.category();
        s.provider = r.provider();
        s.amount = r.amount();
        s.frequency = r.frequency();
        s.customIntervalValue = r.customIntervalValue();
        s.customIntervalUnit = r.customIntervalUnit();
        s.startDate = r.startDate();
        s.endDate = r.endDate();
        s.trialEndDate = r.trialEndDate();
        s.reminderDays = r.reminderDays() == null ? null : r.reminderDays().toArray(new Integer[0]);
        s.notes = r.notes();
        if (s.endDate != null && s.endDate.isBefore(s.startDate))
            throw ApiException.badRequest("End date cannot be before the start date");
        try {
            RecurrenceCalculator.validate(rule(s));
            s.nextRenewalDate = r.nextRenewalDate() != null ? r.nextRenewalDate()
                    : schedule.firstOnOrAfter(rule(s), today);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(e.getMessage());
        }
    }

    private void event(Subscription s, String type, BigDecimal oldAmt, BigDecimal newAmt, String note) {
        jdbc.update("INSERT INTO subscription_events(subscription_id,user_id,event_type,old_amount,new_amount,note) "
                  + "VALUES (?,?,?,?,?,?)", s.id, s.userId, type, oldAmt, newAmt, note);
    }

    @Transactional
    public Subscription create(Long userId, SubscriptionRequest r) {
        Subscription s = new Subscription();
        s.userId = userId;
        apply(s, r, today(userId));
        s = repo.save(s);
        event(s, "CREATED", null, s.amount, null);
        return s;
    }

    @Transactional
    public Subscription update(Long userId, Long id, SubscriptionRequest r) {
        Subscription s = get(userId, id);
        BigDecimal old = s.amount;
        apply(s, r, today(userId));
        s = repo.save(s);
        event(s, old.compareTo(s.amount) != 0 ? "PRICE_CHANGED" : "EDITED", old, s.amount, null);
        return s;
    }

    public Subscription get(Long userId, Long id) {
        return repo.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Subscription"));
    }

    /**
     * Updates SmartBill's OWN records only. No request is made to the provider, so the real
     * service must still be cancelled with the provider.
     */
    @Transactional
    public Subscription changeState(Long userId, Long id, StateChange req) {
        Subscription s = get(userId, id);
        SubscriptionState target = req.state();
        if (s.state == target) return s;
        if (s.state == SubscriptionState.CANCELLED || s.state == SubscriptionState.EXPIRED)
            throw ApiException.unprocessable("A cancelled or expired subscription cannot be changed; create a new one");
        String type;
        switch (target) {
            case PAUSED -> type = "PAUSED";
            case CANCELLED -> { type = "CANCELLED"; s.cancelledAt = Instant.now(); }
            case EXPIRED -> type = "EXPIRED";
            case ACTIVE -> {
                type = "RESUMED";
                LocalDate t = today(userId);
                if (s.nextRenewalDate == null || s.nextRenewalDate.isBefore(t))
                    s.nextRenewalDate = schedule.firstOnOrAfter(rule(s), t);
            }
            default -> throw ApiException.badRequest("Unsupported state");
        }
        s.state = target;
        s = repo.save(s);
        event(s, type, null, null, req.note());
        return s;
    }

    public List<java.util.Map<String, Object>> events(Long userId, Long id) {
        get(userId, id);   // ownership check
        return jdbc.queryForList("SELECT event_type AS type, old_amount AS \"oldAmount\", new_amount AS \"newAmount\", note, occurred_at AS \"occurredAt\" "
                + "FROM subscription_events WHERE subscription_id = ? AND user_id = ? ORDER BY occurred_at DESC, id DESC", id, userId);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        repo.delete(get(userId, id));
        repo.flush();   // 409 via FK RESTRICT if payments exist: cancel instead
    }

    public List<Subscription> search(Long userId, String state, String category, String provider, LocalDate renewsBefore) {
        return repo.findByUserId(userId).stream()
                .filter(s -> state == null || s.state.name().equalsIgnoreCase(state))
                .filter(s -> category == null || s.category.name().equalsIgnoreCase(category))
                .filter(s -> provider == null || (s.provider != null && s.provider.toLowerCase(Locale.ROOT).contains(provider.toLowerCase(Locale.ROOT))))
                .filter(s -> renewsBefore == null || (s.nextRenewalDate != null && !s.nextRenewalDate.isAfter(renewsBefore)))
                .sorted((a, b) -> {
                    if (a.nextRenewalDate == null) return b.nextRenewalDate == null ? 0 : 1;
                    if (b.nextRenewalDate == null) return -1;
                    return a.nextRenewalDate.compareTo(b.nextRenewalDate);
                }).toList();
    }
}
