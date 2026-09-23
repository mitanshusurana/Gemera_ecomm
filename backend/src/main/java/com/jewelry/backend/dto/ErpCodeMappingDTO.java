package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the CSV-style SKU to ERP material mapping
 * (PUT /api/v1/admin/inventory/erp-codes). An empty or null code clears the
 * mapping for that SKU.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ErpCodeMappingDTO {
    private String sku;
    private String erpMaterialCode;
}
