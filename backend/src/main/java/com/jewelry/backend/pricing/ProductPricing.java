package com.jewelry.backend.pricing;

import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Glue between a {@link Product}'s pricing fields and {@link PricingEngine}.
 * Resolves the metal, purity and net weight (pricing fields first, then the
 * product's MetalDetail) and looks the rate up on a board. No Spring, no I/O.
 */
public final class ProductPricing {

    private ProductPricing() {
    }

    public static boolean isMetalRate(Product product) {
        return product != null && PricingEngine.isMetalRate(product.getPricingMode());
    }

    /** GOLD/SILVER/PLATINUM from pricingMetal, else metalDetails.metalType; null when neither resolves. */
    public static String resolveMetal(Product product) {
        String metal = MetalPurities.normalizeMetal(product.getPricingMetal());
        if (metal == null && product.getMetalDetails() != null) {
            metal = MetalPurities.normalizeMetal(product.getMetalDetails().getMetalType());
        }
        return metal;
    }

    /** Table purity label from pricingPurity, else metalDetails.metalPurity; null when neither resolves. */
    public static String resolvePurity(Product product, String metal) {
        String purity = MetalPurities.normalizePurity(metal, product.getPricingPurity());
        if (purity == null && product.getMetalDetails() != null) {
            purity = MetalPurities.normalizePurity(metal, product.getMetalDetails().getMetalPurity());
        }
        return purity;
    }

    /** pricingNetWeightGrams, else metalDetails.netWeight; null when neither is set. */
    public static BigDecimal resolveNetWeight(Product product) {
        if (product.getPricingNetWeightGrams() != null) {
            return product.getPricingNetWeightGrams();
        }
        MetalDetail metal = product.getMetalDetails();
        return metal == null ? null : metal.getNetWeight();
    }

    /** Pricing inputs with the rate taken from {@code board}; throws when a field is missing or off the board. */
    public static PricingEngine.Inputs inputs(Product product, MetalRateBoardDTO board) {
        String metal = resolveMetal(product);
        if (metal == null) {
            throw new IllegalArgumentException("pricingMetal is required for METAL_RATE pricing (GOLD, SILVER or PLATINUM).");
        }
        String purity = resolvePurity(product, metal);
        if (purity == null) {
            throw new IllegalArgumentException("pricingPurity is required for METAL_RATE pricing (" + metal + ": "
                    + String.join(", ", MetalPurities.forMetal(metal).stream().map(MetalPurities.Purity::label).toList()) + ").");
        }
        BigDecimal rate = board == null ? null : board.ratePerGram(metal, purity).orElse(null);
        if (rate == null) {
            throw new IllegalArgumentException("No rate on today's board for " + metal + " " + purity + ".");
        }
        return inputs(product, metal, purity, rate);
    }

    /** Pricing inputs with an explicit rate (the stored metalRateUsed, or a preview figure). */
    public static PricingEngine.Inputs inputs(Product product, String metal, String purity, BigDecimal rate) {
        return new PricingEngine.Inputs(
                metal,
                purity,
                rate,
                resolveNetWeight(product),
                product.getWastagePct(),
                product.getMakingChargeType(),
                product.getMakingChargeValue(),
                product.getStoneValue(),
                product.getOtherCharges());
    }

    /**
     * Prices a METAL_RATE product from the board and writes the result onto it
     * (normalised metal, purity and making type; price; metalRateUsed; pricedAt).
     * A FIXED product is left alone apart from normalising its mode.
     */
    public static PriceBreakdown apply(Product product, MetalRateBoardDTO board, LocalDateTime now) {
        String mode = PricingEngine.normalizeMode(product.getPricingMode());
        product.setPricingMode(mode);
        if (!PricingEngine.MODE_METAL_RATE.equals(mode)) {
            return null;
        }
        PricingEngine.Inputs in = inputs(product, board);
        PriceBreakdown breakdown = PricingEngine.price(in, now);
        product.setPricingMetal(breakdown.metal());
        product.setPricingPurity(breakdown.purity());
        product.setMakingChargeType(breakdown.makingChargeType());
        product.setPrice(breakdown.price());
        product.setMetalRateUsed(breakdown.ratePerGram());
        product.setPricedAt(now);
        return breakdown;
    }

    /**
     * The breakdown behind a stored METAL_RATE product, rebuilt from its own
     * fields and {@code metalRateUsed}; null for FIXED products or when the
     * product has never been priced (or its fields no longer add up).
     */
    public static PriceBreakdown stored(Product product) {
        if (!isMetalRate(product) || product.getMetalRateUsed() == null) {
            return null;
        }
        try {
            String metal = resolveMetal(product);
            String purity = resolvePurity(product, metal);
            return PricingEngine.price(inputs(product, metal, purity, product.getMetalRateUsed()), product.getPricedAt());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
