package com.jewelry.backend.controller;

import com.jewelry.backend.dto.PricePreviewRequest;
import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.pricing.PriceBreakdown;
import com.jewelry.backend.pricing.PricingEngine;
import com.jewelry.backend.pricing.ProductPricing;
import com.jewelry.backend.service.MetalRateBoardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.ZoneId;

/** Metal-rate pricing preview for the admin product form. */
@RestController
@RequestMapping("/api/v1/admin/products")
@PreAuthorize("@access.has('products.write')")
@Tag(name = "Admin Products", description = "Pricing helpers for the product form")
public class AdminProductPricingController {

    @Autowired
    MetalRateBoardService boardService;

    @PostMapping("/price-preview")
    @Transactional(readOnly = true)
    @Operation(summary = "Price the given pricing fields against today's board without saving; 400 names the missing field")
    public ResponseEntity<PriceBreakdown> preview(@RequestBody PricePreviewRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Pricing fields are required.");
        }
        Product probe = new Product();
        probe.setPricingMode(PricingEngine.MODE_METAL_RATE);
        probe.setPricingMetal(request.getPricingMetal());
        probe.setPricingPurity(request.getPricingPurity());
        probe.setPricingNetWeightGrams(request.getPricingNetWeightGrams());
        probe.setMakingChargeType(request.getMakingChargeType());
        probe.setMakingChargeValue(request.getMakingChargeValue());
        probe.setWastagePct(request.getWastagePct());
        probe.setStoneValue(request.getStoneValue());
        probe.setOtherCharges(request.getOtherCharges());
        if (request.getMetalDetails() != null) {
            MetalDetail metal = new MetalDetail();
            metal.setMetalType(request.getMetalDetails().getMetalType());
            metal.setMetalPurity(request.getMetalDetails().getMetalPurity());
            metal.setNetWeight(request.getMetalDetails().getNetWeight());
            probe.setMetalDetails(metal);
        }
        PriceBreakdown breakdown = ProductPricing.apply(probe, boardService.today(),
                LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
        return ResponseEntity.ok(breakdown);
    }
}
