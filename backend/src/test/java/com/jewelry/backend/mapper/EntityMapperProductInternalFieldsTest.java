package com.jewelry.backend.mapper;

import com.jewelry.backend.dto.ProductDTO;
import com.jewelry.backend.entity.Product;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The product mapper feeds anonymous product pages, carts, wishlists and
 * orders. It used to copy supplier, acquisition cost, consignment terms,
 * location, ERP code and reorder data, and the storefront rendered whatever
 * arrived under "Additional Specifications". Those fields must stay null here;
 * ProductController.withStaffFields adds them for staff only.
 */
class EntityMapperProductInternalFieldsTest {

    private Product productWithInternalData() {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName("5.50 ct Emerald Round");
        p.setPrice(new BigDecimal("10000"));
        p.setSku("ST-PR-EME-45ED");
        p.setStock(1);
        p.setInventoryOwnership("Consignment/Memo");
        p.setSupplierName("Acme Gems");
        p.setSupplierCode("SUP-7");
        p.setReturnDueDate("2026-12-31");
        p.setCommissionPercentage(new BigDecimal("12.5"));
        p.setCurrentLocation("Safe 2, tray 4");
        p.setErpMaterialCode("EME-001");
        p.setStockStatus("Real");
        p.setPurchaseDate("2026-09-01");
        p.setAcquisitionCost(new BigDecimal("6200"));
        p.setYieldEstimate(new BigDecimal("0.6"));
        p.setWastageLog("2 ct lost in recut");
        p.setManufacturingStage("Polished");
        p.setReorderPointAlert(2);
        p.setVendorInformation("Pays net 30");
        p.setMinOrderQuantity(1);
        p.setCostPrice(new BigDecimal("6500"));
        p.setExcludeFromFeeds(true);
        return p;
    }

    @Test
    void mapperLeavesBusinessInternalFieldsNull() {
        ProductDTO dto = new EntityMapper().toProductDTO(productWithInternalData());

        // Customer-facing data still flows.
        assertEquals("5.50 ct Emerald Round", dto.getName());
        assertEquals("ST-PR-EME-45ED", dto.getSku());
        assertEquals(1, dto.getStock());

        // Nothing a buyer must not see.
        assertNull(dto.getInventoryOwnership());
        assertNull(dto.getSupplierName());
        assertNull(dto.getSupplierCode());
        assertNull(dto.getReturnDueDate());
        assertNull(dto.getCommissionPercentage());
        assertNull(dto.getCurrentLocation());
        assertNull(dto.getErpMaterialCode());
        assertNull(dto.getStockStatus());
        assertNull(dto.getPurchaseDate());
        assertNull(dto.getAcquisitionCost());
        assertNull(dto.getYieldEstimate());
        assertNull(dto.getWastageLog());
        assertNull(dto.getManufacturingStage());
        assertNull(dto.getReorderPointAlert());
        assertNull(dto.getVendorInformation());
        assertNull(dto.getMinOrderQuantity());
        assertNull(dto.getCostPrice());
        assertNull(dto.getExcludeFromFeeds());
    }
}
