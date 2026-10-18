package com.smartbill.analytics;

import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {
    private final AnalyticsService service;
    public AnalyticsController(AnalyticsService service) { this.service = service; }

    @GetMapping("/summary")
    public Map<String, Object> summary(@AuthenticationPrincipal Long userId) { return service.summary(userId); }

    @GetMapping("/trends")
    public Map<String, Object> trends(@AuthenticationPrincipal Long userId, @RequestParam(defaultValue = "12") int months,
                                      @RequestParam(required = false) Long billId) {
        return service.trends(userId, months, billId);
    }

    @GetMapping("/subscriptions")
    public Map<String, Object> subscriptions(@AuthenticationPrincipal Long userId, @RequestParam(required = false) List<Long> cancel) {
        return service.subscriptions(userId, cancel);
    }
}
