package com.jewelry.backend.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Formats rupee amounts with Indian digit grouping ("12,34,567.89"). The
 * rupee sign is deliberately not used: the invoice PDF is rendered with
 * OpenPDF's built-in Helvetica, which has no glyph for it, so every caller
 * prefixes "Rs." instead.
 */
public final class IndianMoney {

    private IndianMoney() {
    }

    /** "1,23,456.78"; null and zero both render as "0.00". */
    public static String format(BigDecimal amount) {
        BigDecimal value = amount == null ? BigDecimal.ZERO : amount.setScale(2, RoundingMode.HALF_UP);
        boolean negative = value.signum() < 0;
        String plain = value.abs().toPlainString();
        int dot = plain.indexOf('.');
        String whole = dot < 0 ? plain : plain.substring(0, dot);
        String fraction = dot < 0 ? "00" : plain.substring(dot + 1);

        StringBuilder grouped = new StringBuilder();
        int len = whole.length();
        if (len <= 3) {
            grouped.append(whole);
        } else {
            // Last three digits, then pairs.
            String head = whole.substring(0, len - 3);
            String tail = whole.substring(len - 3);
            StringBuilder headGrouped = new StringBuilder();
            int count = 0;
            for (int i = head.length() - 1; i >= 0; i--) {
                headGrouped.append(head.charAt(i));
                count++;
                if (count % 2 == 0 && i > 0) {
                    headGrouped.append(',');
                }
            }
            grouped.append(headGrouped.reverse()).append(',').append(tail);
        }
        return (negative ? "-" : "") + grouped + "." + fraction;
    }

    /** "Rs. 1,23,456.78" */
    public static String rs(BigDecimal amount) {
        return "Rs. " + format(amount);
    }
}
