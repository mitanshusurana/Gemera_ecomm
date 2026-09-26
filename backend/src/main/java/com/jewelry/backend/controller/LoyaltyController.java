package com.jewelry.backend.controller;

import com.jewelry.backend.dto.LoyaltyAdjustRequest;
import com.jewelry.backend.dto.LoyaltySummaryDTO;
import com.jewelry.backend.dto.LoyaltyTransactionDTO;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.service.LoyaltyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.UUID;

/**
 * Loyalty points: the customer's own view and the admin ledger per customer.
 * Customer endpoints need a JWT (SecurityConfig's default); the admin ones
 * live under /api/v1/admin and check customers.read / customers.write.
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Loyalty", description = "Loyalty points and referrals")
@Transactional
public class LoyaltyController {

    @Autowired
    LoyaltyService loyaltyService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AccessService access;

    @GetMapping("/loyalty/me")
    @Operation(summary = "The caller's balance, tier, expiring points, referral code and history page")
    public ResponseEntity<LoyaltySummaryDTO> me(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Principal principal) {
        User user = userRepository.findByEmail(principal.getName())
                .orElseThrow(() -> new EntityNotFoundException("User not found"));
        return ResponseEntity.ok(loyaltyService.summary(user, page, size));
    }

    @GetMapping("/admin/customers/{id}/loyalty")
    @PreAuthorize("@access.has('customers.read')")
    @Operation(summary = "A customer's loyalty summary and ledger (Admin)")
    public ResponseEntity<LoyaltySummaryDTO> customerLoyalty(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Customer not found"));
        return ResponseEntity.ok(loyaltyService.summary(user, page, size));
    }

    @PostMapping("/admin/customers/{id}/loyalty/adjust")
    @PreAuthorize("@access.has('customers.write')")
    @Operation(summary = "Add or remove points with a note (Admin); body { points, note }")
    public ResponseEntity<LoyaltyTransactionDTO> adjust(
            @PathVariable UUID id,
            @Valid @RequestBody LoyaltyAdjustRequest request) {
        return ResponseEntity.ok(loyaltyService.toDTO(
                loyaltyService.adjust(id, request.getPoints(), request.getNote(), access.currentEmailOr("admin"))));
    }
}
