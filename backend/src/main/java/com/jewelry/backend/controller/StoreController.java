package com.jewelry.backend.controller;

import com.jewelry.backend.dto.StoreResponse;
import com.jewelry.backend.service.StoreService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stores")
@CrossOrigin(origins = "*")
@Tag(name = "Stores", description = "Store locator APIs")
public class StoreController {

    @Autowired
    StoreService storeService;

    @GetMapping
    @Operation(summary = "Get all store locations")
    public ResponseEntity<StoreResponse> getStores() {
        return ResponseEntity.ok(storeService.getAllStores());
    }
}
