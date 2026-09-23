package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CouponDTO;
import com.jewelry.backend.service.CouponService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
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
@RequestMapping("/api/v1/admin/coupons")
@Tag(name = "Admin Coupons", description = "Admin API for creating and managing discount coupons")
@PreAuthorize("@access.has('coupons.write')")
public class AdminCouponController {

    @Autowired
    CouponService couponService;

    @GetMapping
    @Operation(summary = "List every coupon, newest first")
    public ResponseEntity<List<CouponDTO>> list() {
        return ResponseEntity.ok(couponService.list());
    }

    @PostMapping
    @Operation(summary = "Create a coupon (code is uppercased; 400 when it already exists)")
    public ResponseEntity<CouponDTO> create(@RequestBody CouponDTO request) {
        return ResponseEntity.status(201).body(couponService.create(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a coupon")
    public ResponseEntity<CouponDTO> update(@PathVariable UUID id, @RequestBody CouponDTO request) {
        return ResponseEntity.ok(couponService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate a coupon (soft delete: the row stays for order history)")
    public ResponseEntity<CouponDTO> deactivate(@PathVariable UUID id) {
        return ResponseEntity.ok(couponService.deactivate(id));
    }
}
