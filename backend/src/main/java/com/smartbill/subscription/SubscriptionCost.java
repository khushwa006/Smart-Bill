package com.smartbill.subscription;

import com.smartbill.common.Enums.CustomUnit;
import com.smartbill.common.Enums.Frequency;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/** Normalises a price to an estimated monthly cost (52 weeks / 365 days per year, 12 months). */
public final class SubscriptionCost {
    private SubscriptionCost() {}

    public static BigDecimal monthly(Subscription s) {
        return monthly(s.amount, s.frequency, s.customIntervalValue, s.customIntervalUnit);
    }

    /** Estimated monthly equivalent of a recurring amount (used for both bills and subscriptions). */
    public static BigDecimal monthly(BigDecimal a, Frequency frequency, Integer customValue, CustomUnit customUnit) {
        BigDecimal twelve = BigDecimal.valueOf(12);
        MathContext mc = new MathContext(12, RoundingMode.HALF_UP);
        BigDecimal m = switch (frequency) {
            case WEEKLY -> a.multiply(BigDecimal.valueOf(52), mc).divide(twelve, mc);
            case MONTHLY -> a;
            case QUARTERLY -> a.divide(BigDecimal.valueOf(3), mc);
            case HALF_YEARLY -> a.divide(BigDecimal.valueOf(6), mc);
            case YEARLY -> a.divide(twelve, mc);
            case CUSTOM -> switch (customUnit) {
                case DAYS -> a.multiply(BigDecimal.valueOf(365), mc).divide(BigDecimal.valueOf(customValue), mc).divide(twelve, mc);
                case WEEKS -> a.multiply(BigDecimal.valueOf(52), mc).divide(BigDecimal.valueOf(customValue), mc).divide(twelve, mc);
                case MONTHS -> a.divide(BigDecimal.valueOf(customValue), mc);
            };
        };
        return m.setScale(2, RoundingMode.HALF_UP);
    }
}
