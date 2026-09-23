package com.jewelry.backend.controller;

import com.jewelry.backend.dto.AdminIssueGiftCardRequest;
import com.jewelry.backend.dto.GiftCardDTO;
import com.jewelry.backend.service.GiftCardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/gift-cards")
@Tag(name = "Admin Gift Cards", description = "Admin API for listing, issuing and disabling gift cards")
@PreAuthorize("@access.has('giftcards.write')")
public class AdminGiftCardController {

    @Autowired
    GiftCardService giftCardService;

    @GetMapping
    @Operation(summary = "List gift cards, newest first")
    public ResponseEntity<Page<GiftCardDTO>> list(
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size) {
        return ResponseEntity.ok(giftCardService.list(page, size).map(giftCardService::toDTO));
    }

    @PostMapping
    @Operation(summary = "Issue an ACTIVE gift card immediately (offline sale or goodwill)")
    public ResponseEntity<GiftCardDTO> issue(
            @Valid @RequestBody AdminIssueGiftCardRequest request,
            Principal principal) {
        String adminEmail = principal != null ? principal.getName() : null;
        return ResponseEntity.status(201).body(giftCardService.toDTO(giftCardService.issue(request, adminEmail)));
    }

    @PostMapping("/{id}/disable")
    @Operation(summary = "Disable a gift card so it can no longer be redeemed")
    public ResponseEntity<GiftCardDTO> disable(@PathVariable UUID id) {
        return ResponseEntity.ok(giftCardService.toDTO(giftCardService.disable(id)));
    }
}
