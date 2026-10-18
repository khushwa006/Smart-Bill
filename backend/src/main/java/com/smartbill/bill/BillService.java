package com.smartbill.bill;

import com.smartbill.auth.AuthService;
import com.smartbill.bill.BillDtos.BillRequest;
import com.smartbill.common.ApiException;
import com.smartbill.common.RecurrenceCalculator;
import com.smartbill.cycle.CycleService;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BillService {
    private final BillRepository bills;
    private final CycleService cycles;
    private final AuthService auth;

    public BillService(BillRepository bills, CycleService cycles, AuthService auth) {
        this.bills = bills;
        this.cycles = cycles;
        this.auth = auth;
    }

    private ZoneId zone(Long userId) { return ZoneId.of(auth.get(userId).timezone); }

    private void apply(Bill b, BillRequest r) {
        b.name = r.name().trim();
        b.category = r.category();
        b.provider = r.provider();
        b.expectedAmount = r.expectedAmount();
        b.variable = r.variable();
        b.frequency = r.frequency();
        b.customIntervalValue = r.customIntervalValue();
        b.customIntervalUnit = r.customIntervalUnit();
        b.anchorDate = r.anchorDate();
        b.monthEndAnchored = r.monthEndAnchored();
        b.endDate = r.endDate();
        b.reminderDays = r.reminderDays() == null ? null : r.reminderDays().toArray(new Integer[0]);
        b.notes = r.notes();
        try {
            RecurrenceCalculator.validate(CycleService.ruleOf(b));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(e.getMessage());
        }
        if (b.endDate != null && b.endDate.isBefore(b.anchorDate))
            throw ApiException.badRequest("End date cannot be before the first due date");
    }

    @Transactional
    public Bill create(Long userId, BillRequest r) {
        Bill b = new Bill();
        b.userId = userId;
        apply(b, r);
        b = bills.save(b);
        cycles.generate(b, zone(userId));
        return b;
    }

    @Transactional
    public Bill update(Long userId, Long id, BillRequest r) {
        Bill b = get(userId, id);
        apply(b, r);
        b = bills.save(b);
        cycles.discardFutureUntouched(b.id, userId, zone(userId));
        cycles.generate(b, zone(userId));
        return b;
    }

    public Bill get(Long userId, Long id) {
        return bills.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Bill"));
    }

    /** Fails with 409 if any cycle has payments (FK RESTRICT) - the user must reverse them or deactivate instead. */
    @Transactional
    public void delete(Long userId, Long id) {
        Bill b = get(userId, id);
        bills.delete(b);
        bills.flush();
    }

    public List<Bill> search(Long userId, String q, String category, Boolean active, String sort, String dir) {
        Comparator<Bill> cmp = switch (sort == null ? "name" : sort) {
            case "expectedAmount" -> Comparator.comparing(b -> b.expectedAmount);
            case "anchorDate" -> Comparator.comparing(b -> b.anchorDate);
            case "category" -> Comparator.comparing(b -> b.category.name());
            default -> Comparator.comparing(b -> b.name.toLowerCase(Locale.ROOT));
        };
        if ("desc".equalsIgnoreCase(dir)) cmp = cmp.reversed();
        String needle = q == null ? null : q.trim().toLowerCase(Locale.ROOT);
        return bills.findByUserId(userId).stream()
                .filter(b -> category == null || b.category.name().equalsIgnoreCase(category))
                .filter(b -> active == null || b.active == active)
                .filter(b -> needle == null || needle.isEmpty() || b.name.toLowerCase(Locale.ROOT).contains(needle)
                        || (b.provider != null && b.provider.toLowerCase(Locale.ROOT).contains(needle)))
                .sorted(cmp).toList();
    }
}
