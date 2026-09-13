package com.jewelry.backend.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Small text helpers shared by the services that build e-mail bodies
 * (order lifecycle, low-stock digest, back-in-stock notices).
 */
public final class EmailText {

    private EmailText() {
    }

    /** HTML-escapes the five significant characters; null becomes "". */
    public static String escape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&': sb.append("&amp;"); break;
                case '<': sb.append("&lt;"); break;
                case '>': sb.append("&gt;"); break;
                case '"': sb.append("&quot;"); break;
                case '\'': sb.append("&#39;"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }

    /** "INR 1,23,456" with Indian digit grouping; null is treated as zero. */
    public static String inr(BigDecimal amount) {
        BigDecimal value = (amount == null ? BigDecimal.ZERO : amount).setScale(0, RoundingMode.HALF_UP);
        boolean negative = value.signum() < 0;
        String plain = value.abs().toPlainString();
        StringBuilder sb = new StringBuilder();
        int len = plain.length();
        if (len <= 3) {
            sb.append(plain);
        } else {
            String last3 = plain.substring(len - 3);
            String rest = plain.substring(0, len - 3);
            StringBuilder grouped = new StringBuilder();
            while (rest.length() > 2) {
                grouped.insert(0, "," + rest.substring(rest.length() - 2));
                rest = rest.substring(0, rest.length() - 2);
            }
            grouped.insert(0, rest);
            sb.append(grouped).append(',').append(last3);
        }
        return (negative ? "-INR " : "INR ") + sb;
    }

    /** Trailing slash removed so paths can be appended with a single "/". */
    public static String trimSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
