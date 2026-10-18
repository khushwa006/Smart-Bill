package com.smartbill.notification;

import com.smartbill.notification.NotificationService.*;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping("/notifications")
    public List<NotificationView> list(@AuthenticationPrincipal Long userId, @RequestParam(defaultValue = "false") boolean unreadOnly) {
        return service.list(userId, unreadOnly);
    }

    @GetMapping("/notifications/unread-count")
    public Map<String, Integer> unread(@AuthenticationPrincipal Long userId) { return Map.of("count", service.unreadCount(userId)); }

    @PatchMapping("/notifications/{id}/read")
    public ResponseEntity<Void> read(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        service.markRead(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notifications/read-all")
    public Map<String, Integer> readAll(@AuthenticationPrincipal Long userId) { return Map.of("updated", service.markAllRead(userId)); }

    /** "Check now": runs the same idempotent job for the signed-in user only. */
    @PostMapping("/notifications/generate")
    public GenerationResult generate(@AuthenticationPrincipal Long userId) { return service.generateForUser(userId); }

    @GetMapping("/preferences")
    public Preferences prefs(@AuthenticationPrincipal Long userId) { return service.preferences(userId); }

    @PutMapping("/preferences")
    public Preferences update(@AuthenticationPrincipal Long userId, @RequestBody Preferences req) {
        return service.updatePreferences(userId, req);
    }
}
