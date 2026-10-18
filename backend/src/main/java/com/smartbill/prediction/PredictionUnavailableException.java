package com.smartbill.prediction;

import com.smartbill.common.ApiException;
import org.springframework.http.HttpStatus;

/** Thrown when the Python service cannot be used. Only prediction endpoints fail; everything else keeps working. */
public class PredictionUnavailableException extends ApiException {
    public PredictionUnavailableException() {
        super(HttpStatus.SERVICE_UNAVAILABLE,
                "The prediction service is currently unavailable. Your bills and payments are unaffected; please try again later.");
    }
}
