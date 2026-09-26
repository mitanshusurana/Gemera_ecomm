package com.jewelry.backend.pricing;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * How a METAL_RATE product's price was built: rate x weight (plus wastage),
 * making, stones and other charges. Every money figure is INR with two
 * decimals; {@code price} is rounded to the rupee. Returned by
 * {@link PricingEngine#price} and embedded on the product DTO.
 */
public record PriceBreakdown(
        String metal,
        String purity,
        BigDecimal ratePerGram,
        BigDecimal netWeightGrams,
        BigDecimal wastagePct,
        BigDecimal metalValue,
        String makingChargeType,
        BigDecimal makingChargeValue,
        BigDecimal makingCharges,
        BigDecimal stoneValue,
        BigDecimal otherCharges,
        BigDecimal price,
        LocalDateTime pricedAt) {
}
