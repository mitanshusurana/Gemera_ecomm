package com.jewelry.backend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/** POST /api/v1/admin/exchange/{id}/assay body. */
@Data
public class ExchangeAssayRequest {

    @NotNull(message = "assayedPurityFraction is required")
    @DecimalMin(value = "0.01", message = "assayedPurityFraction must be above 0")
    @DecimalMax(value = "1.0", message = "assayedPurityFraction may not exceed 1")
    private BigDecimal assayedPurityFraction;

    @NotNull(message = "assayedNetWeightGrams is required")
    @DecimalMin(value = "0.001", message = "assayedNetWeightGrams must be above 0")
    private BigDecimal assayedNetWeightGrams;

    /** INR per gram of fine metal. Defaults to the live rate when omitted. */
    @DecimalMin(value = "0.01", message = "assayedRatePerGram must be above 0")
    private BigDecimal assayedRatePerGram;

    /** Percentage 0..100. Defaults to the oldGoldDeductionPct setting when omitted. */
    @DecimalMin(value = "0", message = "deductionPct may not be negative")
    @DecimalMax(value = "100", message = "deductionPct may not exceed 100")
    private BigDecimal deductionPct;

    /** PAN captured at the counter when the final value crosses Rs 2,00,000 and none was given online. */
    @Size(max = 10)
    private String pan;

    @Size(max = 2000)
    private String note;
}
