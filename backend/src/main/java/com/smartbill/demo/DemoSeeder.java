package com.smartbill.demo;

import com.smartbill.auth.AuthDtos.RegisterRequest;
import com.smartbill.auth.AuthService;
import com.smartbill.auth.User;
import com.smartbill.auth.UserRepository;
import com.smartbill.bill.BillDtos.BillRequest;
import com.smartbill.bill.BillService;
import com.smartbill.common.Enums.*;
import com.smartbill.cycle.CycleService;
import com.smartbill.cycle.CycleView;
import com.smartbill.payment.PaymentDtos.PaymentRequest;
import com.smartbill.payment.PaymentService;
import com.smartbill.subscription.SubscriptionDtos.SubscriptionRequest;
import com.smartbill.subscription.SubscriptionService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Explicit, opt-in demo data (APP_DEMO_ENABLED=true + DEMO_PASSWORD). SYNTHETIC records only, one dedicated demo user,
 * created once. There is no default password: if DEMO_PASSWORD is missing the seeder refuses to run.
 * Forecasts are NOT seeded: click "Forecast" in the app and the real Python service produces them.
 */
@Component
@ConditionalOnProperty(name = "app.demo.enabled", havingValue = "true")
public class DemoSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);
    public static final String EMAIL = "demo@smartbill.example";

    private final UserRepository users;
    private final AuthService auth;
    private final BillService bills;
    private final CycleService cycles;
    private final PaymentService payments;
    private final SubscriptionService subs;
    private final JdbcTemplate jdbc;
    private final String password;

    public DemoSeeder(UserRepository users, AuthService auth, BillService bills, CycleService cycles, PaymentService payments,
                      SubscriptionService subs, JdbcTemplate jdbc, @Value("${app.demo.password:}") String password) {
        this.users = users; this.auth = auth; this.bills = bills; this.cycles = cycles;
        this.payments = payments; this.subs = subs; this.jdbc = jdbc; this.password = password;
    }

    private record Def(String name, BillCategory cat, String provider, String expected, boolean variable, int dueDay,
                       double[] actuals, int unpaidLast) {}

    @Override
    public void run(ApplicationArguments args) {
        if (password == null || password.length() < 8) {
            log.error("Demo seeding skipped: set DEMO_PASSWORD (min 8 characters). No default password is ever used.");
            return;
        }
        if (users.existsByEmailIgnoreCase(EMAIL)) { log.info("Demo user already exists; nothing to seed"); return; }
        User u = auth.register(new RegisterRequest(EMAIL, password, "Demo User"));
        jdbc.update("UPDATE users SET is_demo = TRUE WHERE id = ?", u.id);
        LocalDate today = LocalDate.now(ZoneId.of(u.timezone));

        List<Def> defs = List.of(
            new Def("Electricity", BillCategory.ELECTRICITY, "City Power Co.", "1400.00", true, 12,
                new double[]{1180, 1260, 1390, 1530, 1560, 1420, 1310, 1440}, 0),
            new Def("Water", BillCategory.WATER, "Municipal Water", "450.00", true, 15,
                new double[]{420, 435, 460, 445, 470, 455}, 1),
            new Def("Broadband", BillCategory.INTERNET, "FiberNet", "799.00", false, 18,
                new double[]{799, 799, 799, 799, 799, 799}, 0),
            new Def("Mobile postpaid", BillCategory.MOBILE_POSTPAID, "TeleOne", "499.00", false, 22,
                new double[]{499, 499, 549, 499, 499}, 0),
            new Def("Rent", BillCategory.RENT, "Landlord (demo)", "12000.00", false, 1,
                new double[]{12000, 12000, 12000, 12000, 12000, 12000}, 0));

        for (Def d : defs) {
            LocalDate anchor = today.minusMonths(d.actuals.length).withDayOfMonth(d.dueDay);
            var bill = bills.create(u.id, new BillRequest(d.name, d.cat, d.provider, new BigDecimal(d.expected), d.variable,
                    Frequency.MONTHLY, null, null, anchor, false, null, null, "Synthetic demo bill"));
            List<CycleView> past = cycles.history(u.id, bill.id).stream()
                    .filter(c -> c.dueDate().isBefore(today)).sorted(Comparator.comparing(CycleView::dueDate)).toList();
            int n = Math.min(past.size(), d.actuals.length);
            for (int i = 0; i < n; i++) {
                CycleView c = past.get(i);
                cycles.update(u.id, c.id(), new CycleService.CycleUpdate(BigDecimal.valueOf(d.actuals[i]), null, null, null));
                boolean leaveUnpaid = i >= n - d.unpaidLast;
                if (!leaveUnpaid) payments.record(u.id, new PaymentRequest(c.id(), null, BigDecimal.valueOf(d.actuals[i]),
                        c.dueDate(), PaymentMethod.UPI, "DEMO-" + bill.id + "-" + i, null, "demo-" + bill.id + "-" + i));
            }
        }
        seedSub(u.id, "StreamBox", SubscriptionCategory.OTT_STREAMING, "649.00", Frequency.MONTHLY, today);
        seedSub(u.id, "ShowTime Plus", SubscriptionCategory.OTT_STREAMING, "299.00", Frequency.MONTHLY, today);
        seedSub(u.id, "TuneWave", SubscriptionCategory.MUSIC, "119.00", Frequency.MONTHLY, today);
        seedSub(u.id, "CloudVault 200GB", SubscriptionCategory.CLOUD_STORAGE, "2100.00", Frequency.YEARLY, today);
        seedSub(u.id, "FitZone Gym", SubscriptionCategory.GYM_MEMBERSHIP, "1500.00", Frequency.MONTHLY, today);
        seedSub(u.id, "SkillPath Learning", SubscriptionCategory.LEARNING, "799.00", Frequency.QUARTERLY, today);
        log.info("Demo data created for {}", EMAIL);
    }

    private void seedSub(Long userId, String name, SubscriptionCategory cat, String amount, Frequency f, LocalDate today) {
        subs.create(userId, new SubscriptionRequest(name, cat, "Demo provider", new BigDecimal(amount), f, null, null,
                today.minusMonths(7).plusDays(name.length() % 9), null, null, null, null, "Synthetic demo subscription"));
    }
}
