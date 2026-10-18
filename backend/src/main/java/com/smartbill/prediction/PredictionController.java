package com.smartbill.prediction;

import com.smartbill.prediction.PredictionDtos.PredictionView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/predictions")
public class PredictionController {
    private final PredictionService service;
    public PredictionController(PredictionService service) { this.service = service; }

    public record RunRequest(@NotNull Long billId) {}
    public record AnomalyCheckRequest(@NotNull Long cycleId) {}

    @GetMapping
    public List<PredictionView> list(@AuthenticationPrincipal Long userId, @RequestParam(required = false) Long billId) {
        return service.list(userId, billId);
    }

    @GetMapping("/anomalies")
    public List<java.util.Map<String, Object>> anomalies(@AuthenticationPrincipal Long userId) { return service.anomalies(userId); }

    @PostMapping("/run")
    public PredictionView run(@AuthenticationPrincipal Long userId, @Valid @RequestBody RunRequest req) {
        return service.run(userId, req.billId());
    }

    @PostMapping("/anomaly-check")
    public PredictionService.AnomalyView anomaly(@AuthenticationPrincipal Long userId,
                                                 @Valid @RequestBody AnomalyCheckRequest req) {
        return service.checkAnomaly(userId, req.cycleId());
    }
}
