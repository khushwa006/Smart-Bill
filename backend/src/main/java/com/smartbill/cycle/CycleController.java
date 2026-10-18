package com.smartbill.cycle;

import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cycles")
public class CycleController {
    private final CycleService service;
    public CycleController(CycleService service) { this.service = service; }

    @GetMapping
    public List<CycleView> list(@AuthenticationPrincipal Long userId,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                @RequestParam(required = false) String status) {
        return service.list(userId, from, to, status);
    }

    @GetMapping("/{id}")
    public CycleView get(@AuthenticationPrincipal Long userId, @PathVariable Long id) {
        return service.get(userId, id);
    }

    @PutMapping("/{id}")
    public CycleView update(@AuthenticationPrincipal Long userId, @PathVariable Long id,
                            @RequestBody CycleService.CycleUpdate req) {
        return service.update(userId, id, req);
    }
}
