package com.jewelry.backend.controller;

import com.jewelry.backend.dto.ExchangeAssayRequest;
import com.jewelry.backend.dto.ExchangeReasonRequest;
import com.jewelry.backend.dto.ExchangeRequestDTO;
import com.jewelry.backend.service.ErpSyncService;
import com.jewelry.backend.service.ExchangeService;
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

/** Counter workflow for old gold exchange: receive, assay, credit, reject, cancel, and ERP re-sync. */
@RestController
@RequestMapping("/api/v1/admin/exchange")
@Tag(name = "Admin Old Gold Exchange", description = "Receive, assay, credit or reject exchange requests")
@PreAuthorize("@access.has('exchange.write')")
public class AdminExchangeController {

    @Autowired
    ExchangeService exchangeService;

    @Autowired
    ErpSyncService erpSyncService;

    @GetMapping
    @Operation(summary = "List exchange requests, newest first, optionally filtered by status")
    public ResponseEntity<Page<ExchangeRequestDTO>> list(
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(exchangeService.list(page, size, status).map(r -> exchangeService.toDTO(r, true)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "One exchange request with its event timeline and ERP sync state")
    public ResponseEntity<ExchangeRequestDTO> get(@PathVariable UUID id) {
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.get(id), true));
    }

    @PostMapping("/{id}/receive")
    @Operation(summary = "Mark the item as received at the counter or by post; e-mails the customer")
    public ResponseEntity<ExchangeRequestDTO> receive(@PathVariable UUID id,
                                                      @RequestBody(required = false) ExchangeReasonRequest body,
                                                      Principal principal) {
        String note = body == null ? null : (body.getNote() != null ? body.getNote() : body.getReason());
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.receive(id, note, actor(principal)), true));
    }

    @PostMapping("/{id}/assay")
    @Operation(summary = "Record the assay (purity fraction, net weight, rate, deduction); computes the final value")
    public ResponseEntity<ExchangeRequestDTO> assay(@PathVariable UUID id,
                                                    @Valid @RequestBody ExchangeAssayRequest body,
                                                    Principal principal) {
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.assay(id, body, actor(principal)), true));
    }

    @PostMapping("/{id}/credit")
    @Operation(summary = "Issue the store-credit gift card, e-mail the code and queue the ERP purchase")
    public ResponseEntity<ExchangeRequestDTO> credit(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.credit(id, actor(principal)), true));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject the exchange with a reason; e-mails the customer")
    public ResponseEntity<ExchangeRequestDTO> reject(@PathVariable UUID id,
                                                     @Valid @RequestBody ExchangeReasonRequest body,
                                                     Principal principal) {
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.reject(id, body.getReason(), actor(principal)), true));
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "Cancel an open request (customer withdrew, duplicate)")
    public ResponseEntity<ExchangeRequestDTO> cancel(@PathVariable UUID id,
                                                     @RequestBody(required = false) ExchangeReasonRequest body,
                                                     Principal principal) {
        String note = body == null ? null : (body.getReason() != null ? body.getReason() : body.getNote());
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.cancel(id, note, actor(principal)), true));
    }

    @PreAuthorize("@access.has('erp.sync')")
    @PostMapping("/{id}/erp-sync")
    @Operation(summary = "Send the old-gold purchase to the ERP now (credited requests only)")
    public ResponseEntity<ExchangeRequestDTO> erpSync(@PathVariable UUID id) {
        erpSyncService.syncExchangeNow(id);
        return ResponseEntity.ok(exchangeService.toDTO(exchangeService.get(id), true));
    }

    private static String actor(Principal principal) {
        return principal == null ? "admin" : principal.getName();
    }
}
