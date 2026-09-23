package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** GET /api/v1/exchange/quote result. All money in INR. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExchangeQuoteResponse {
    private String metal;
    private String purity;
    /** Fine-metal fraction the purity label maps to (22K -> 0.916). */
    private BigDecimal purityFraction;
    private BigDecimal weightGrams;
    /** INR per gram of fine (24K / 999) metal. */
    private BigDecimal ratePerGramFine;
    /** INR per gram at the declared purity (ratePerGramFine x purityFraction). */
    private BigDecimal rate;
    private BigDecimal deductionPct;
    private BigDecimal estimatedValue;
    /** True when the rate is a fallback (mock) figure rather than a live market price. */
    private boolean indicative;
    /** True when a PAN must accompany the request (Rule 114B, value >= Rs 2,00,000). */
    private boolean panRequired;
}
