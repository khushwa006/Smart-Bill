package com.smartbill.security;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class JwtServiceTest {
    private static final String SECRET = "0123456789abcdef0123456789abcdef";

    @Test void roundTrip() {
        JwtService jwt = new JwtService(SECRET, Duration.ofMinutes(5));
        assertEquals(42L, jwt.parse(jwt.issue(42L)).getAsLong());
    }

    @Test void expiredTokenRejected() {
        JwtService jwt = new JwtService(SECRET, Duration.ofSeconds(-5));
        assertTrue(jwt.parse(jwt.issue(1L)).isEmpty());
    }

    @Test void tamperedOrForeignTokenRejected() {
        JwtService a = new JwtService(SECRET, Duration.ofMinutes(5));
        JwtService b = new JwtService("ffffffffffffffffffffffffffffffff", Duration.ofMinutes(5));
        assertTrue(a.parse(b.issue(1L)).isEmpty());
        assertTrue(a.parse("garbage").isEmpty());
    }

    @Test void shortSecretRefused() {
        assertThrows(IllegalStateException.class, () -> new JwtService("short", Duration.ofMinutes(1)));
    }
}
