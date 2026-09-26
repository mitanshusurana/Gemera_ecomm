package com.jewelry.backend.controller;

import com.jewelry.backend.dto.TreasureChestAccountDTO;
import com.jewelry.backend.dto.TreasureEnrollRequest;
import com.jewelry.backend.dto.TreasureInstallmentConfirmRequest;
import com.jewelry.backend.dto.TreasureInstallmentDTO;
import com.jewelry.backend.dto.TreasureInstallmentOrderResponse;
import com.jewelry.backend.dto.TreasurePaymentNoteRequest;
import com.jewelry.backend.dto.TreasurePlanConfigDTO;
import com.jewelry.backend.dto.TreasureRedeemableDTO;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.service.MetalRateService;
import com.jewelry.backend.service.TreasurePlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Treasure Chest plan APIs. Customer endpoints resolve the account from the
 * authenticated principal (its name is the user's email); the admin ones are
 * keyed by account id. Security: everything under /api/v1/treasure except
 * /config requires a JWT; admin methods additionally check the role.
 */
@RestController
@RequestMapping("/api/v1/treasure")
@Tag(name = "Treasure Plan", description = "Treasure Chest Plan APIs")
public class TreasurePlanController {

    @Autowired
    TreasurePlanService treasurePlanService;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    AccessService access;

    /** Entity mapping plus today's gram value and redemption details. */
    private TreasureChestAccountDTO dto(TreasureChestAccount account) {
        return treasurePlanService.enrich(entityMapper.toTreasureChestAccountDTO(account), account, null);
    }

    @GetMapping("/config")
    @Operation(summary = "Get plan configuration")
    public ResponseEntity<TreasurePlanConfigDTO> getConfig() {
        return ResponseEntity.ok(treasurePlanService.getConfig());
    }

    // ------------------------------------------------------------------
    // Customer
    // ------------------------------------------------------------------

    @GetMapping("/account")
    @Transactional(readOnly = true)
    @Operation(summary = "Get the caller's plan")
    public ResponseEntity<TreasureChestAccountDTO> getAccount(Principal principal) {
        return ResponseEntity.ok(dto(treasurePlanService.getAccount(principal.getName())));
    }

    @GetMapping("/accounts/{id}/redeemable")
    @Transactional(readOnly = true)
    @Operation(summary = "Gold rate protection: max(balance incl. bonus, grams x today's 24K rate); own account, or any with treasure.write")
    public ResponseEntity<TreasureRedeemableDTO> redeemable(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(treasurePlanService.redeemableFor(id, principal.getName(), access.has("treasure.write")));
    }

    @PostMapping("/enroll")
    @Operation(summary = "Enroll in a new plan")
    public ResponseEntity<TreasureChestAccountDTO> enroll(@RequestBody TreasureEnrollRequest request, Principal principal) {
        return ResponseEntity.ok(dto(treasurePlanService.enroll(principal.getName(), request)));
    }

    @GetMapping("/account/installments")
    @Transactional(readOnly = true)
    @Operation(summary = "The caller's installment history, newest first")
    public ResponseEntity<List<TreasureInstallmentDTO>> listInstallments(Principal principal) {
        List<TreasureInstallmentDTO> items = new ArrayList<>();
        treasurePlanService.listInstallments(principal.getName())
                .forEach(installment -> items.add(treasurePlanService.toInstallmentDTO(installment)));
        return ResponseEntity.ok(items);
    }

    @PostMapping("/account/installments/order")
    @Operation(summary = "Start this month's installment: a PENDING installment plus a Razorpay order (returns the existing pending one when there is one)")
    public ResponseEntity<TreasureInstallmentOrderResponse> createInstallmentOrder(Principal principal) {
        return ResponseEntity.ok(treasurePlanService.createInstallmentOrder(principal.getName()));
    }

    @PostMapping("/account/installments/{id}/confirm")
    @Transactional
    @Operation(summary = "Confirm the Razorpay payment for an installment and apply it to the plan (idempotent)")
    public ResponseEntity<TreasureChestAccountDTO> confirmInstallment(
            @PathVariable UUID id,
            @Valid @RequestBody TreasureInstallmentConfirmRequest request,
            Principal principal) {
        return ResponseEntity.ok(dto(treasurePlanService.confirmInstallment(principal.getName(), id, request)));
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    @GetMapping("/accounts")
    @Transactional(readOnly = true)
    @Operation(summary = "Get all plans (Admin)")
    @PreAuthorize("@access.has('treasure.write')")
    public ResponseEntity<Iterable<TreasureChestAccountDTO>> getAllAccounts() {
        List<TreasureChestAccountDTO> dtoList = new ArrayList<>();
        MetalRateService.FineRate rate = treasurePlanService.todayRate();
        treasurePlanService.getAllAccounts().forEach(account ->
                dtoList.add(treasurePlanService.enrich(entityMapper.toTreasureChestAccountDTO(account), account, rate)));
        return ResponseEntity.ok(dtoList);
    }

    @PostMapping("/accounts/{id}/payment")
    @Transactional
    @Operation(summary = "Record a cash installment (Admin); optional body { note }")
    @PreAuthorize("@access.has('treasure.write')")
    public ResponseEntity<TreasureChestAccountDTO> recordPayment(
            @PathVariable UUID id,
            @RequestBody(required = false) TreasurePaymentNoteRequest body) {
        String note = body == null ? null : body.getNote();
        return ResponseEntity.ok(dto(treasurePlanService.recordPayment(id, note)));
    }

    @PostMapping("/accounts/{id}/skip")
    @Operation(summary = "Skip Month (Admin)")
    @PreAuthorize("@access.has('treasure.write')")
    public ResponseEntity<TreasureChestAccountDTO> skipMonth(@PathVariable UUID id) {
        return ResponseEntity.ok(dto(treasurePlanService.skipMonth(id)));
    }

    @PostMapping("/accounts/{id}/close")
    @Operation(summary = "Close Plan (Admin)")
    @PreAuthorize("@access.has('treasure.write')")
    public ResponseEntity<TreasureChestAccountDTO> closePlan(@PathVariable UUID id) {
        return ResponseEntity.ok(dto(treasurePlanService.closePlan(id)));
    }
}
