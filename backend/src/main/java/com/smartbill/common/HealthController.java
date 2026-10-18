package com.smartbill.common;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate jdbc;
    public HealthController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Liveness: does not touch the database, so Render health checks survive a Neon cold start. */
    @GetMapping("/health")
    public Map<String, String> health() { return Map.of("status", "UP"); }

    /** Readiness: verifies the database connection. */
    @GetMapping("/health/db")
    public ResponseEntity<Map<String, String>> db() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "UP", "database", "UP"));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("status", "DEGRADED", "database", "DOWN"));
        }
    }
}
