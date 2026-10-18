package com.smartbill.prediction;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire format shared with the Python service (camelCase JSON; amounts: numbers out, strings in). */
public final class PredictionDtos {
    private PredictionDtos() {}

    public record HistoryPoint(LocalDate date, BigDecimal amount) {}

    public record PredictRequest(long billId, String currency, List<HistoryPoint> history,
                                 LocalDate forecastPeriodStart, LocalDate forecastPeriodEnd, BigDecimal expectedAmount) {}

    public record Interval(BigDecimal lower, BigDecimal upper, double level, String basis) {}
    public record CandidateScore(String method, BigDecimal mae) {}
    public record ValidationInfo(int folds, String selectedMethod, BigDecimal selectedMae, String baselineMethod,
                                 BigDecimal baselineMae, List<CandidateScore> candidates) {}

    public record PredictResponse(long billId, String status, BigDecimal forecastAmount, LocalDate forecastPeriodStart,
                                  LocalDate forecastPeriodEnd, Instant generatedAt, String currency, String method,
                                  int observationsUsed, String dataQuality, Interval interval, ValidationInfo validation,
                                  String explanation) {}

    public record Observation(LocalDate date, BigDecimal amount) {}

    public record AnomalyRequest(long billId, String billName, Observation observed, List<HistoryPoint> history,
                                 double thresholdPct) {}

    public record AnomalyResponse(long billId, String status, boolean isAnomaly, String direction,
                                  BigDecimal observedAmount, BigDecimal baselineAmount, String baselineMethod,
                                  Double deviationPct, BigDecimal typicalVariation, Double robustScore,
                                  double thresholdPct, int sampleSize, Instant generatedAt, String explanation) {}

    /** What the frontend receives. kind is always PREDICTED so a forecast can never be mistaken for a real bill. */
    public record PredictionView(Long id, long billId, String kind, String status, BigDecimal forecastAmount,
                                 LocalDate forecastPeriodStart, LocalDate forecastPeriodEnd, String method,
                                 int observationsUsed, String dataQuality, BigDecimal intervalLower,
                                 BigDecimal intervalUpper, String explanation, Instant generatedAt, boolean stored) {}
}
