package com.smartbill.notification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly. Idempotent, so running on several instances or after a restart never duplicates anything. */
@Component
@ConditionalOnProperty(name = "app.scheduler.enabled", havingValue = "true", matchIfMissing = true)
public class NotificationScheduler {
    private final NotificationService service;
    public NotificationScheduler(NotificationService service) { this.service = service; }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "PT1H")
    public void run() { service.generateForAllUsers(); }
}
