package com.jewelry.backend.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

/**
 * Pure arithmetic for a product priced from the metal rate:
 *
 * <pre>
 *   metalValue = ratePerGram x netWeightGrams x (1 + wastagePct / 100)
 *   making     = PER_GRAM: makingChargeValue x netWeightGrams
 *                PERCENT:  makingChargeValue % of metalValue
 *                FIXED:    makingChargeValue
 *   price      = metalValue + making + stoneValue + otherCharges, rounded to the rupee
 * </pre>
 *
 * No I/O, no Spring: the rate comes in as an argument so the same code prices
 * a product from the locked board, previews a form and reprices the catalogue.
 * Every violation is an {@link IllegalArgumentException} (a 400 at the edge).
 */
public final class PricingEngine {

    public static final String MODE_FIXED = "FIXED";
    public static final String MODE_METAL_RATE = "METAL_RATE";

    public static final String MAKING_PER_GRAM = "PER_GRAM";
    public static final String MAKING_PERCENT = "PERCENT";
    public static final String MAKING_FIXED = "FIXED";
    public static final List<String> MAKING_TYPES = List.of(MAKING_PER_GRAM, MAKING_PERCENT, MAKING_FIXED);

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private PricingEngine() {
    }

    /** Inputs to one pricing run; null charges count as zero, null wastage as 0 %. */
    public record Inputs(
            String metal,
            String purity,
            BigDecimal ratePerGram,
            BigDecimal netWeightGrams,
            BigDecimal wastagePct,
            String makingChargeType,
            BigDecimal makingChargeValue,
            BigDecimal stoneValue,
            BigDecimal otherCharges) {
    }

    /** "fixed", " Metal_Rate " and null normalise to FIXED / METAL_RATE; anything else is rejected. */
    public static String normalizeMode(String mode) {
        if (mode == null || mode.trim().isEmpty()) {
            return MODE_FIXED;
        }
        String m = mode.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (MODE_FIXED.equals(m) || MODE_METAL_RATE.equals(m)) {
            return m;
        }
        throw new IllegalArgumentException("pricingMode must be FIXED or METAL_RATE, got '" + mode + "'");
    }

    public static boolean isMetalRate(String mode) {
        return MODE_METAL_RATE.equals(normalizeMode(mode));
    }

    /** PER_GRAM / PERCENT / FIXED, case-insensitive; null or blank means PER_GRAM. */
    public static String normalizeMakingType(String type) {
        if (type == null || type.trim().isEmpty()) {
            return MAKING_PER_GRAM;
        }
        String t = type.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("PER_GRAM".equals(t) || "PERGRAM".equals(t) || "GRAM".equals(t)) {
            return MAKING_PER_GRAM;
        }
        if ("PERCENT".equals(t) || "PERCENTAGE".equals(t) || "PCT".equals(t) || "%".equals(t)) {
            return MAKING_PERCENT;
        }
        if ("FIXED".equals(t) || "FLAT".equals(t)) {
            return MAKING_FIXED;
        }
        throw new IllegalArgumentException("makingChargeType must be PER_GRAM, PERCENT or FIXED, got '" + type + "'");
    }

    /**
     * Prices the inputs. The rate must be positive, the weight positive, the
     * making type valid and no charge negative.
     */
    public static PriceBreakdown price(Inputs in, LocalDateTime pricedAt) {
        if (in == null) {
            throw new IllegalArgumentException("Pricing inputs are required.");
        }
        BigDecimal rate = in.ratePerGram();
        if (rate == null || rate.signum() <= 0) {
            throw new IllegalArgumentException("A metal rate per gram above zero is required.");
        }
        BigDecimal weight = in.netWeightGrams();
        if (weight == null || weight.signum() <= 0) {
            throw new IllegalArgumentException("pricingNetWeightGrams (or the metal net weight) must be above zero.");
        }
        BigDecimal wastage = nonNegative(in.wastagePct(), "wastagePct");
        if (wastage.compareTo(HUNDRED) > 0) {
            throw new IllegalArgumentException("wastagePct cannot exceed 100.");
        }
        String makingType = normalizeMakingType(in.makingChargeType());
        BigDecimal makingValue = nonNegative(in.makingChargeValue(), "makingChargeValue");
        BigDecimal stones = nonNegative(in.stoneValue(), "stoneValue");
        BigDecimal other = nonNegative(in.otherCharges(), "otherCharges");

        BigDecimal wastageFactor = BigDecimal.ONE.add(wastage.divide(HUNDRED, 6, RoundingMode.HALF_UP));
        BigDecimal metalValue = rate.multiply(weight).multiply(wastageFactor).setScale(2, RoundingMode.HALF_UP);

        BigDecimal making = switch (makingType) {
            case MAKING_PER_GRAM -> makingValue.multiply(weight);
            case MAKING_PERCENT -> metalValue.multiply(makingValue).divide(HUNDRED, 6, RoundingMode.HALF_UP);
            default -> makingValue;
        };
        making = making.setScale(2, RoundingMode.HALF_UP);

        BigDecimal price = metalValue.add(making).add(stones).add(other)
                .setScale(0, RoundingMode.HALF_UP)
                .setScale(2, RoundingMode.HALF_UP);

        return new PriceBreakdown(
                in.metal(),
                in.purity(),
                rate.setScale(2, RoundingMode.HALF_UP),
                weight.setScale(3, RoundingMode.HALF_UP),
                wastage.setScale(2, RoundingMode.HALF_UP),
                metalValue,
                makingType,
                makingValue.setScale(2, RoundingMode.HALF_UP),
                making,
                stones.setScale(2, RoundingMode.HALF_UP),
                other.setScale(2, RoundingMode.HALF_UP),
                price,
                pricedAt);
    }

    private static BigDecimal nonNegative(BigDecimal value, String field) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value.signum() < 0) {
            throw new IllegalArgumentException(field + " cannot be negative.");
        }
        return value;
    }
}
