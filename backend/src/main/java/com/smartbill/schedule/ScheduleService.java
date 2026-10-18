package com.smartbill.schedule;

import com.smartbill.common.RecurrenceCalculator.Rule;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Spring wrapper: all recurrence calculations in the app go through here (native first, Java fallback). */
@Service
public class ScheduleService {
    private final NativeScheduleEngine engine;

    public ScheduleService(@Value("${app.native-engine.path:/opt/smartbill/schedule-engine}") String path,
                           @Value("${app.native-engine.timeout-ms:2000}") long timeoutMs) {
        this.engine = new NativeScheduleEngine(Path.of(path), Duration.ofMillis(timeoutMs));
    }

    public NativeScheduleEngine.Result schedule(Rule rule, int startIndex, LocalDate from, LocalDate to, int max) {
        return engine.schedule(rule, startIndex, from, to, max);
    }

    public LocalDate firstOnOrAfter(Rule rule, LocalDate date) { return engine.firstOnOrAfter(rule, date); }
}
