package com.smartbill.subscription;

import com.smartbill.common.ApiException;
import com.smartbill.subscription.SubscriptionDtos.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {
    private final SubscriptionService service;
    public SubscriptionController(SubscriptionService service) { this.service = service; }

    @GetMapping
    public List<SubscriptionResponse> list(@AuthenticationPrincipal Long userId,
            @RequestParam(required = false) String state, @RequestParam(required = false) String category,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate renewsBefore) {
        return service.search(userId, state, category, provider, renewsBefore).stream().map(SubscriptionResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SubscriptionResponse create(@AuthenticationPrincipal Long userId, @Valid @RequestBody SubscriptionRequest req) {
        return SubscriptionResponse.from(service.create(userId, req));
    }

    @GetMapping("/{id}")
    public SubscriptionResponse get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return SubscriptionResponse.from(service.get(userId, id));
    }

    @PutMapping("/{id}")
    public SubscriptionResponse update(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                       @Valid @RequestBody SubscriptionRequest req) {
        return SubscriptionResponse.from(service.update(userId, id, req));
    }

    @GetMapping("/{id}/events")
    public List<java.util.Map<String, Object>> events(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return service.events(userId, id);
    }

    @PatchMapping("/{id}/state")
    public SubscriptionResponse state(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                                      @Valid @RequestBody StateChange req) {
        return SubscriptionResponse.from(service.changeState(userId, id, req));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                       @RequestParam(defaultValue = "false") boolean confirm) {
        if (!confirm) throw ApiException.badRequest("Deletion must be confirmed (confirm=true)");
        service.delete(userId, id);
    }
}
