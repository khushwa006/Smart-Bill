package com.smartbill.prediction;

import com.smartbill.prediction.PredictionDtos.*;
import java.net.http.HttpClient;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** HTTP client for the Python service. Every failure becomes PredictionUnavailableException (HTTP 503). */
@Component
public class PredictionClient {
    private static final Logger log = LoggerFactory.getLogger(PredictionClient.class);
    private final RestClient http;

    public PredictionClient(RestClient.Builder builder,
                            @Value("${app.prediction.url}") String baseUrl,
                            @Value("${app.prediction.token:}") String token,
                            @Value("${app.prediction.timeout-ms:8000}") long timeoutMs) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.min(timeoutMs, 3000))).build());
        factory.setReadTimeout(Duration.ofMillis(timeoutMs));
        RestClient.Builder b = builder.baseUrl(baseUrl).requestFactory(factory);
        if (!token.isBlank()) b.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        this.http = b.build();
    }

    public PredictResponse predict(PredictRequest req) {
        return post("/predict", req, PredictResponse.class);
    }

    public AnomalyResponse detectAnomaly(AnomalyRequest req) {
        return post("/detect-anomalies", req, AnomalyResponse.class);
    }

    private <T> T post(String path, Object body, Class<T> type) {
        try {
            T out = http.post().uri(path).body(body).retrieve().body(type);
            if (out == null) throw new PredictionUnavailableException();
            return out;
        } catch (RestClientException e) {
            // timeouts, connection refused, 401 (bad token), 422 (contract bug), 5xx: all handled the same for the user
            log.warn("Prediction service call {} failed: {}", path, e.getMessage());
            throw new PredictionUnavailableException();
        }
    }
}
