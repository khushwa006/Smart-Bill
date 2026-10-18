package com.smartbill.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
    private Money() {}

    /** INR with Indian digit grouping, e.g. ₹1,45,000.50 (same format as the Python service). */
    public static String inr(BigDecimal value) {
        BigDecimal v = value.setScale(2, RoundingMode.HALF_UP);
        String sign = v.signum() < 0 ? "-" : "";
        String[] parts = v.abs().toPlainString().split("\\.");
        String whole = parts[0];
        if (whole.length() > 3) {
            String head = whole.substring(0, whole.length() - 3);
            String tail = whole.substring(whole.length() - 3);
            StringBuilder sb = new StringBuilder();
            while (head.length() > 2) {
                sb.insert(0, "," + head.substring(head.length() - 2));
                head = head.substring(0, head.length() - 2);
            }
            whole = head + sb + "," + tail;
        }
        return sign + "₹" + whole + "." + parts[1];
    }
}
