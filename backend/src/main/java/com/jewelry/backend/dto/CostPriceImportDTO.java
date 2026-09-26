package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * One row of the CSV-style SKU to landed-cost import
 * (PUT /api/v1/admin/inventory/cost-prices). A null cost clears the product's
 * cost price.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CostPriceImportDTO {
    private String sku;
    private BigDecimal costPrice;
}
