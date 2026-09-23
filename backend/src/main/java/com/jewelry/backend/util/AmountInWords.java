package com.jewelry.backend.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Spells an INR amount in words using Indian grouping (thousand, lakh,
 * crore), the form expected on a tax invoice:
 * "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Paise
 * Seventy Eight Only".
 */
public final class AmountInWords {

    private static final String[] ONES = {
            "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
            "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
            "Eighteen", "Nineteen"};

    private static final String[] TENS = {
            "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"};

    private AmountInWords() {
    }

    public static String inr(BigDecimal amount) {
        if (amount == null) {
            return "Rupees Zero Only";
        }
        BigDecimal value = amount.setScale(2, RoundingMode.HALF_UP);
        boolean negative = value.signum() < 0;
        value = value.abs();
        long rupees = value.longValue();
        int paise = value.remainder(BigDecimal.ONE).movePointRight(2).intValue();

        StringBuilder sb = new StringBuilder();
        if (negative) {
            sb.append("Minus ");
        }
        sb.append("Rupees ").append(rupees == 0 ? "Zero" : integer(rupees));
        if (paise > 0) {
            sb.append(" and Paise ").append(integer(paise));
        }
        sb.append(" Only");
        return sb.toString();
    }

    /** Positive integer in Indian grouping; crore recurses so arbitrarily large values work. */
    static String integer(long n) {
        if (n == 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        long crore = n / 10_000_000L;
        long rest = n % 10_000_000L;
        if (crore > 0) {
            sb.append(integer(crore)).append(" Crore ");
        }
        long lakh = rest / 100_000L;
        rest %= 100_000L;
        if (lakh > 0) {
            sb.append(belowThousand((int) lakh)).append(" Lakh ");
        }
        long thousand = rest / 1_000L;
        rest %= 1_000L;
        if (thousand > 0) {
            sb.append(belowThousand((int) thousand)).append(" Thousand ");
        }
        if (rest > 0) {
            sb.append(belowThousand((int) rest));
        }
        return sb.toString().trim().replaceAll("\\s+", " ");
    }

    private static String belowThousand(int n) {
        StringBuilder sb = new StringBuilder();
        int hundreds = n / 100;
        int rest = n % 100;
        if (hundreds > 0) {
            sb.append(ONES[hundreds]).append(" Hundred");
            if (rest > 0) {
                sb.append(" ");
            }
        }
        if (rest > 0) {
            if (rest < 20) {
                sb.append(ONES[rest]);
            } else {
                sb.append(TENS[rest / 10]);
                if (rest % 10 > 0) {
                    sb.append(" ").append(ONES[rest % 10]);
                }
            }
        }
        return sb.toString();
    }
}
