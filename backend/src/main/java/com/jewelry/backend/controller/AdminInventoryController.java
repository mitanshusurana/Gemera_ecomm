package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CostPriceImportDTO;
import com.jewelry.backend.dto.CostPriceImportResultDTO;
import com.jewelry.backend.dto.ErpCodeMappingDTO;
import com.jewelry.backend.dto.ErpCodeMappingResultDTO;
import com.jewelry.backend.dto.IncompleteProductDTO;
import com.jewelry.backend.dto.ProductDTO;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.InventoryAlertService;
import com.jewelry.backend.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/admin/inventory")
@PreAuthorize("@access.has('stock.read')")
@Tag(name = "Admin Inventory", description = "Stock alerts and ERP mapping for the admin dashboard")
public class AdminInventoryController {

    @Autowired
    InventoryAlertService inventoryAlertService;

    @Autowired
    ProductService productService;

    @Autowired
    EntityMapper entityMapper;

    @GetMapping("/low-stock")
    @Transactional(readOnly = true)
    @Operation(summary = "Products at or below their reorder point (same list as the daily low-stock digest)")
    public ResponseEntity<List<ProductDTO>> lowStock() {
        List<ProductDTO> items = inventoryAlertService.findLowStock().stream()
                .map(entityMapper::toProductDTO)
                .collect(Collectors.toList());
        return ResponseEntity.ok(items);
    }

    @GetMapping("/incomplete")
    @Operation(summary = "Products that fail their item-type rules, with the missing fields as labels (ordered by name, max 2000)")
    public ResponseEntity<Page<IncompleteProductDTO>> incomplete(
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {
        return ResponseEntity.ok(inventoryAlertService.findIncomplete(page, size));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PutMapping("/erp-codes")
    @Operation(summary = "Bulk map SKUs to ERP material codes: body [{sku, erpMaterialCode}]; a blank code clears the mapping")
    public ResponseEntity<ErpCodeMappingResultDTO> mapErpCodes(@RequestBody List<ErpCodeMappingDTO> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("Send at least one {sku, erpMaterialCode} row.");
        }
        if (rows.size() > 5000) {
            throw new IllegalArgumentException("At most 5000 rows per request.");
        }
        return ResponseEntity.ok(productService.bulkSetErpMaterialCodes(rows));
    }

    @PreAuthorize("@access.has('products.write')")
    @PutMapping("/cost-prices")
    @Operation(summary = "Bulk set landed cost per unit: body [{sku, costPrice}]; a null cost clears it")
    public ResponseEntity<CostPriceImportResultDTO> importCostPrices(@RequestBody List<CostPriceImportDTO> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("Send at least one {sku, costPrice} row.");
        }
        if (rows.size() > 5000) {
            throw new IllegalArgumentException("At most 5000 rows per request.");
        }
        return ResponseEntity.ok(productService.bulkSetCostPrices(rows));
    }
}
