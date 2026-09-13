package com.jewelry.backend.controller;

import com.jewelry.backend.dto.ProductDTO;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.InventoryAlertService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/admin/inventory")
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Inventory", description = "Stock alerts for the admin dashboard")
public class AdminInventoryController {

    @Autowired
    InventoryAlertService inventoryAlertService;

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
}
