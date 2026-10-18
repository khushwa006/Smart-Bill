package com.smartbill.calendar;

import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {
    private final CalendarService service;
    public CalendarController(CalendarService service) { this.service = service; }

    @GetMapping
    public List<CalendarService.CalendarItem> items(@AuthenticationPrincipal Long userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String category, @RequestParam(required = false) String status,
            @RequestParam(required = false) String type) {
        return service.items(userId, from, to, category, status, type);
    }
}
