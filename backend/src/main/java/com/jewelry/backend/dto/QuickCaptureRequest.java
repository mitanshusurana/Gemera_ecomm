package com.jewelry.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Body of POST /api/v1/products/quick: what the counter knows when a piece is
 * photographed. Only the category is required; the result is always a draft.
 */
@Data
public class QuickCaptureRequest {

    @NotBlank(message = "Category is required")
    private String category;
    private String subCategory;
    private String name;

    @DecimalMin(value = "0.0", inclusive = false, message = "Price must be positive")
    private BigDecimal price;

    @DecimalMin(value = "0.0", inclusive = false, message = "Unit price must be positive")
    private BigDecimal unitPrice;
    private String saleMode;

    @Min(value = 0, message = "Stock cannot be negative")
    private Integer stock;
    private List<String> images;

    /** Carats for a stone, a lot or rough; grams for everything else. */
    @DecimalMin(value = "0.0", inclusive = false, message = "Weight must be positive")
    private BigDecimal primaryWeight;

    /** Counter notes; stored as the product's internal notes, never public. */
    private String notes;
}
