package com.jewelry.backend.controller;

import com.jewelry.backend.dto.StoreDTO;
import com.jewelry.backend.service.StoreService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/stores")
@PreAuthorize("@access.has('stores.write')")
@Tag(name = "Admin Stores", description = "Store locator management (Admin)")
public class AdminStoreController {

    @Autowired
    StoreService storeService;

    @GetMapping
    @Operation(summary = "List all stores")
    public ResponseEntity<List<StoreDTO>> listStores() {
        return ResponseEntity.ok(storeService.listStores());
    }

    @PostMapping
    @Operation(summary = "Create a store")
    public ResponseEntity<StoreDTO> createStore(@RequestBody @Valid StoreDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storeService.createStore(dto));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a store")
    public ResponseEntity<StoreDTO> updateStore(@PathVariable UUID id, @RequestBody @Valid StoreDTO dto) {
        return ResponseEntity.ok(storeService.updateStore(id, dto));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a store")
    public ResponseEntity<Void> deleteStore(@PathVariable UUID id) {
        storeService.deleteStore(id);
        return ResponseEntity.noContent().build();
    }
}
