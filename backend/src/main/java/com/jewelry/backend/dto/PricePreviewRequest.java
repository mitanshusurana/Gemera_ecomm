package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * Body of {@code POST /api/v1/admin/products/price-preview}: the pricing
 * fields of a product as the admin form holds them. {@code metalDetails}
 * supplies the fallbacks the product entity would use (metal type, purity
 * and net weight) when the pricing fields are blank.
 */
@Data
public class PricePreviewRequest {
    private String pricingMetal;
    private String pricingPurity;
    private BigDecimal pricingNetWeightGrams;
    private String makingChargeType;
    private BigDecimal makingChargeValue;
    private BigDecimal wastagePct;
    private BigDecimal stoneValue;
    private BigDecimal otherCharges;
    private MetalDetailDTO metalDetails;
}
