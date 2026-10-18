package com.smartbill.prediction;

import com.smartbill.auth.AuthService;
import com.smartbill.bill.Bill;
import com.smartbill.bill.BillService;
import com.smartbill.common.ApiException;
import com.smartbill.prediction.PredictionDtos.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PredictionService {
    private static final Logger log = LoggerFactory.getLogger(PredictionService.class);
    private static final Set<String> QUALITY = Set.of("INSUFFICIENT", "LOW", "MEDIUM", "HIGH");
    private static final Pattern METHOD = Pattern.compile("^[A-Z0-9_]{1,40}$");

    private final JdbcTemplate jdbc;
    private final BillService bills;
    private final AuthService auth;
    private final PredictionClient client;

    public PredictionService(JdbcTemplate jdbc, BillService bills, AuthService auth, PredictionClient client) {
        this.jdbc = jdbc;
        this.bills = bills;
        this.auth = auth;
        this.client = client;
    }

    /** Only CONFIRMED amounts (actual_amount set, not waived) feed the models; expected amounts never do. */
    private List<HistoryPoint> confirmedHistory(Long userId, Long billId, LocalDate before, Long excludeCycleId) {
        return jdbc.query(
                "SELECT due_date, actual_amount FROM billing_cycles WHERE user_id = ? AND bill_id = ? "
              + "AND actual_amount IS NOT NULL AND NOT is_waived AND (?::date IS NULL OR due_date < ?::date) "
              + "AND (?::bigint IS NULL OR id <> ?::bigint) ORDER BY due_date",
                (rs, i) -> new HistoryPoint(rs.getObject("due_date", LocalDate.class), rs.getBigDecimal("actual_amount")),
                userId, billId, before, before, excludeCycleId, excludeCycleId);
    }

    public PredictionView run(Long userId, Long billId) {
        Bill bill = bills.get(userId, billId);   // ownership check
        LocalDate today = LocalDate.now(ZoneId.of(auth.get(userId).timezone));
        List<LocalDate[]> period = jdbc.query(
                "SELECT period_start, period_end FROM billing_cycles WHERE user_id = ? AND bill_id = ? "
              + "AND actual_amount IS NULL AND due_date >= ? ORDER BY due_date LIMIT 1",
                (rs, i) -> new LocalDate[]{rs.getObject("period_start", LocalDate.class), rs.getObject("period_end", LocalDate.class)},
                userId, billId, today);
        if (period.isEmpty()) throw ApiException.conflict("There is no upcoming billing cycle to forecast for this bill");
        LocalDate start = period.get(0)[0], end = period.get(0)[1];

        List<HistoryPoint> history = confirmedHistory(userId, billId, null, null);
        PredictResponse r = client.predict(new PredictRequest(billId, "INR", history, start, end, bill.expectedAmount));
        validate(r, billId, history.size(), start, end);

        boolean storable = r.forecastAmount() != null && ("OK".equals(r.status()) || "PRELIMINARY".equals(r.status()));
        Long id = null;
        if (storable) {
            Interval iv = r.interval();
            id = jdbc.queryForObject(
                    "INSERT INTO predictions(user_id,bill_id,forecast_amount,forecast_period_start,forecast_period_end,currency,"
                  + "method,observations_used,data_quality,interval_lower,interval_upper,explanation,generated_at) "
                  + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id", Long.class,
                    userId, billId, r.forecastAmount(), start, end, "INR", r.method(), r.observationsUsed(), r.dataQuality(),
                    iv == null ? null : iv.lower(), iv == null ? null : iv.upper(), r.explanation(),
                    java.sql.Timestamp.from(r.generatedAt()));
        }
        return new PredictionView(id, billId, "PREDICTED", r.status(), r.forecastAmount(), start, end, r.method(),
                r.observationsUsed(), r.dataQuality(), r.interval() == null ? null : r.interval().lower(),
                r.interval() == null ? null : r.interval().upper(), r.explanation(), r.generatedAt(), storable);
    }

    /** Never trust a downstream service blindly: check the response before it touches the database. */
    private void validate(PredictResponse r, long billId, int sent, LocalDate start, LocalDate end) {
        boolean ok = r.billId() == billId && "INR".equals(r.currency())
                && r.observationsUsed() == sent && r.dataQuality() != null && QUALITY.contains(r.dataQuality())
                && r.method() != null && METHOD.matcher(r.method()).matches()
                && start.equals(r.forecastPeriodStart()) && end.equals(r.forecastPeriodEnd())
                && r.explanation() != null && !r.explanation().isBlank() && r.generatedAt() != null
                && (r.forecastAmount() == null || (r.forecastAmount().signum() >= 0 && r.forecastAmount().scale() <= 2));
        if (ok && r.interval() != null) {
            ok = r.forecastAmount() != null && r.interval().lower().signum() >= 0
                    && r.interval().lower().compareTo(r.interval().upper()) <= 0
                    && r.interval().lower().compareTo(r.forecastAmount()) <= 0
                    && r.interval().upper().compareTo(r.forecastAmount()) >= 0;
        }
        if (!ok) {
            log.error("Prediction service returned an inconsistent response for bill {}", billId);
            throw new PredictionUnavailableException();
        }
    }

    public List<PredictionView> list(Long userId, Long billId) {
        return jdbc.query(
                "SELECT * FROM predictions WHERE user_id = ? AND (?::bigint IS NULL OR bill_id = ?::bigint) "
              + "ORDER BY generated_at DESC LIMIT 100",
                (rs, i) -> new PredictionView(rs.getLong("id"), rs.getLong("bill_id"), "PREDICTED", "OK",
                        rs.getBigDecimal("forecast_amount"), rs.getObject("forecast_period_start", LocalDate.class),
                        rs.getObject("forecast_period_end", LocalDate.class), rs.getString("method"),
                        rs.getInt("observations_used"), rs.getString("data_quality"), rs.getBigDecimal("interval_lower"),
                        rs.getBigDecimal("interval_upper"), rs.getString("explanation"),
                        rs.getTimestamp("generated_at").toInstant(), true),
                userId, billId, billId);
    }

    public record AnomalyView(Long cycleId, String status, boolean anomaly, String direction, BigDecimal observedAmount,
                              BigDecimal baselineAmount, Double deviationPct, int sampleSize, String explanation) {}

    /** Compares a confirmed cycle amount against that bill's earlier confirmed amounts. */
    public AnomalyView checkAnomaly(Long userId, Long cycleId) {
        List<Object[]> row = jdbc.query(
                "SELECT c.bill_id, c.due_date, c.actual_amount, b.name FROM billing_cycles c JOIN bills b ON b.id = c.bill_id "
              + "WHERE c.id = ? AND c.user_id = ?",
                (rs, i) -> new Object[]{rs.getLong("bill_id"), rs.getObject("due_date", LocalDate.class),
                        rs.getBigDecimal("actual_amount"), rs.getString("name")}, cycleId, userId);
        if (row.isEmpty()) throw ApiException.notFound("Billing cycle");
        long billId = (Long) row.get(0)[0];
        LocalDate due = (LocalDate) row.get(0)[1];
        BigDecimal actual = (BigDecimal) row.get(0)[2];
        String name = (String) row.get(0)[3];
        if (actual == null) throw ApiException.unprocessable("Record the actual bill amount first; only confirmed amounts are checked");

        double threshold = jdbc.query("SELECT anomaly_threshold_pct FROM user_preferences WHERE user_id = ?",
                (rs, i) -> rs.getDouble(1), userId).stream().findFirst().orElse(20.0);
        List<HistoryPoint> history = confirmedHistory(userId, billId, due, cycleId);
        AnomalyResponse r = client.detectAnomaly(new AnomalyRequest(billId, name, new Observation(due, actual), history, threshold));
        if (r.billId() != billId || r.sampleSize() > history.size()) throw new PredictionUnavailableException();

        if (r.isAnomaly() && r.baselineAmount() != null && r.baselineAmount().signum() > 0 && r.deviationPct() != null
                && ("HIGH".equals(r.direction()) || "LOW".equals(r.direction()))) {
            jdbc.update("INSERT INTO anomaly_flags(user_id,billing_cycle_id,direction,observed_amount,baseline_amount,"
                      + "deviation_pct,threshold_pct,sample_size,explanation) VALUES (?,?,?,?,?,?,?,?,?) "
                      + "ON CONFLICT (billing_cycle_id) DO NOTHING",
                    userId, cycleId, r.direction(), actual, r.baselineAmount(), r.deviationPct(), threshold,
                    Math.max(1, r.sampleSize()), r.explanation());
        }
        return new AnomalyView(cycleId, r.status(), r.isAnomaly(), r.direction(), actual, r.baselineAmount(),
                r.deviationPct(), r.sampleSize(), r.explanation());
    }

    public List<java.util.Map<String, Object>> anomalies(Long userId) {
        return jdbc.queryForList("SELECT a.id, a.billing_cycle_id AS \"cycleId\", b.id AS \"billId\", b.name AS \"billName\", c.due_date AS \"dueDate\", "
                + "a.direction, a.observed_amount AS \"observedAmount\", a.baseline_amount AS \"baselineAmount\", a.deviation_pct AS \"deviationPct\", "
                + "a.explanation, a.detected_at AS \"detectedAt\" FROM anomaly_flags a JOIN billing_cycles c ON c.id = a.billing_cycle_id AND c.user_id = a.user_id "
                + "JOIN bills b ON b.id = c.bill_id WHERE a.user_id = ? ORDER BY a.detected_at DESC LIMIT 50", userId);
    }
}
