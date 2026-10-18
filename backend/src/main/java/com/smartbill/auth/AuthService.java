package com.smartbill.auth;

import com.smartbill.common.ApiException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    static final int MAX_FAILURES = 5;
    static final int LOCK_MINUTES = 15;

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JdbcTemplate jdbc;
    private final String defaultTimezone;
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder encoder, JdbcTemplate jdbc,
                       @Value("${app.timezone}") String defaultTimezone) {
        this.users = users;
        this.encoder = encoder;
        this.jdbc = jdbc;
        this.defaultTimezone = defaultTimezone;
        this.dummyHash = encoder.encode("not-a-real-password");   // equalises timing for unknown emails
    }

    @Transactional
    public User register(AuthDtos.RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) throw ApiException.conflict("Email is already registered");
        User u = new User();
        u.email = email;
        u.passwordHash = encoder.encode(req.password());
        u.fullName = req.fullName().trim();
        u.timezone = defaultTimezone;
        u = users.save(u);
        jdbc.update("INSERT INTO user_preferences(user_id) VALUES (?)", u.id);
        return u;
    }

    /**
     * Deliberately NOT @Transactional: failure counters must persist even though we then throw.
     * Same generic message for unknown email and wrong password.
     */
    public User login(AuthDtos.LoginRequest req) {
        User u = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        if (u == null) {
            encoder.matches(req.password(), dummyHash);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (u.lockedUntil != null && u.lockedUntil.isAfter(Instant.now()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.");
        if (!encoder.matches(req.password(), u.passwordHash)) {
            u.failedLoginCount++;
            if (u.failedLoginCount >= MAX_FAILURES) {
                u.lockedUntil = Instant.now().plus(LOCK_MINUTES, ChronoUnit.MINUTES);
                u.failedLoginCount = 0;
            }
            users.save(u);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (u.failedLoginCount != 0 || u.lockedUntil != null) {
            u.failedLoginCount = 0;
            u.lockedUntil = null;
            users.save(u);
        }
        return u;
    }

    public User get(Long id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
    }

    @Transactional
    public User updateProfile(Long id, AuthDtos.ProfileUpdate req) {
        try { ZoneId.of(req.timezone()); } catch (DateTimeException e) { throw ApiException.badRequest("Unknown timezone"); }
        User u = get(id);
        u.fullName = req.fullName().trim();
        u.timezone = req.timezone();
        return users.save(u);
    }

    @Transactional
    public void changePassword(Long id, AuthDtos.PasswordChange req) {
        User u = get(id);
        if (!encoder.matches(req.currentPassword(), u.passwordHash))
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        u.passwordHash = encoder.encode(req.newPassword());
        users.save(u);
    }
}
