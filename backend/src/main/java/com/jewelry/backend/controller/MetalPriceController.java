package com.jewelry.backend.controller;

import com.jewelry.backend.service.MetalPriceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/metal-prices")
public class MetalPriceController {

    @Autowired
    private MetalPriceService metalPriceService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getLivePrices() {
        return ResponseEntity.ok(metalPriceService.getLivePrices());
    }
}
