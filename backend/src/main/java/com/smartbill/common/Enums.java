package com.smartbill.common;

/** Shared enums. Names must match the CHECK constraints in the Flyway migrations exactly. */
public final class Enums {
    private Enums() {}

    public enum Frequency { WEEKLY, MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY, CUSTOM }
    public enum CustomUnit { DAYS, WEEKS, MONTHS }
    public enum BillCategory { ELECTRICITY, WATER, INTERNET, MOBILE_POSTPAID, MOBILE_RECHARGE, RENT, GAS,
        INSURANCE, EDUCATION_FEES, MAINTENANCE, OTHER }
    public enum SubscriptionCategory { OTT_STREAMING, MUSIC, CLOUD_STORAGE, SOFTWARE, GYM_MEMBERSHIP, LEARNING,
        MEMBERSHIP, OTHER }
    public enum SubscriptionState { ACTIVE, PAUSED, CANCELLED, EXPIRED }
    public enum PaymentMethod { UPI, CASH, CARD, BANK_TRANSFER, OTHER }
}
