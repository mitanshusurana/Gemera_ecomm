package com.jewelry.backend.controller;

import com.jewelry.backend.dto.GiftCardBalanceResponse;
import com.jewelry.backend.dto.GiftCardConfirmRequest;
import com.jewelry.backend.dto.GiftCardDTO;
import com.jewelry.backend.dto.GiftCardPurchaseRequest;
import com.jewelry.backend.dto.GiftCardPurchaseResponse;
import com.jewelry.backend.service.GiftCardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/gift-cards")
@Tag(name = "Gift Cards", description = "Purchase, activate and check Caratloop gift cards")
public class GiftCardController {

    @Autowired
    GiftCardService giftCardService;

    @PostMapping("/purchase")
    @Operation(summary = "Start a gift card purchase: creates a PENDING_PAYMENT card and a Razorpay order")
    public ResponseEntity<GiftCardPurchaseResponse> purchase(@Valid @RequestBody GiftCardPurchaseRequest request) {
        return ResponseEntity.status(201).body(giftCardService.purchase(request));
    }

    @PostMapping("/{giftCardId}/confirm")
    @Operation(summary = "Confirm the Razorpay payment and activate the gift card (idempotent)")
    public ResponseEntity<GiftCardDTO> confirm(
            @PathVariable UUID giftCardId,
            @Valid @RequestBody GiftCardConfirmRequest request) {
        return ResponseEntity.ok(giftCardService.toDTO(giftCardService.confirm(giftCardId, request)));
    }

    @GetMapping("/{code}/balance")
    @Operation(summary = "Check a gift card's balance by code (code is returned masked)")
    public ResponseEntity<GiftCardBalanceResponse> balance(@PathVariable String code) {
        return ResponseEntity.ok(giftCardService.getBalance(code));
    }
}
