package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Outcome of a bulk ERP-code mapping: how many products changed and one line
 * per submitted row with its status (UPDATED, CLEARED, UNCHANGED, NOT_FOUND,
 * INVALID).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ErpCodeMappingResultDTO {
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
        private String erpMaterialCode;
        private String status;
        private String productName;
    }
}
