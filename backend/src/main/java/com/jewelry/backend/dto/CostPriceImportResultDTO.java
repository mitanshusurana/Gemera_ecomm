package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Outcome of a bulk cost-price import: counts plus one line per submitted row
 * with its status (UPDATED, CLEARED, UNCHANGED, NOT_FOUND, INVALID).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CostPriceImportResultDTO {
    private int updated;
    private int cleared;
    private int unchanged;
    private int notFound;
    private int invalid;
    private List<Row> rows = new ArrayList<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Row {
        private String sku;
        private BigDecimal costPrice;
        private String status;
        private String productName;
    }
}
