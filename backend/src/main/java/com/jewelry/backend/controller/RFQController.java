package com.jewelry.backend.controller;

import com.jewelry.backend.dto.NegotiationRequestDTO;
import com.jewelry.backend.dto.RFQRequestDTO;
import com.jewelry.backend.dto.RFQQuoteDTO;
import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.RFQQuote;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.RFQService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rfq")
@Tag(name = "RFQ", description = "Request for Quote APIs")
public class RFQController {

    @Autowired
    RFQService rfqService;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    UserRepository userRepository;

    private boolean isOwnerOrAdmin(UUID ownerId, Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElseThrow();
        return "ADMIN".equals(user.getRole()) || user.getId().equals(ownerId);
    }

    @GetMapping("/statistics")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get RFQ statistics for admin dashboard")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        long total = rfqService.getTotalCount();
        long pending = rfqService.getCountByStatus("PENDING");
        long accepted = rfqService.getCountByStatus("ACCEPTED");
        long quoted = rfqService.getCountByStatus("QUOTED");
        return ResponseEntity.ok(Map.of(
            "total", total,
            "pending", pending,
            "accepted", accepted,
            "quoted", quoted
        ));
    }

    @PostMapping("/requests")
    @Operation(summary = "Create RFQ")
    public ResponseEntity<RFQRequestDTO> createRequest(@RequestBody RFQRequestDTO request, Principal principal) {
        RFQ rfq = entityMapper.toRFQEntity(request);
        RFQ created = rfqService.createRequest(principal.getName(), rfq);
        return ResponseEntity.status(201).body(entityMapper.toRFQRequestDTO(created));
    }

    @GetMapping("/requests/{id}")
    @Operation(summary = "Get RFQ details")
    public ResponseEntity<RFQRequestDTO> getRequest(@PathVariable UUID id, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(entityMapper.toRFQRequestDTO(rfq));
    }

    @GetMapping("/requests/number/{rfqNumber}")
    @Operation(summary = "Get RFQ by Number")
    public ResponseEntity<RFQRequestDTO> getRequestByNumber(@PathVariable String rfqNumber, Principal principal) {
        RFQ rfq = rfqService.getRequestByNumber(rfqNumber);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(entityMapper.toRFQRequestDTO(rfq));
    }

    @GetMapping("/requests/user/{userId}")
    @Operation(summary = "Get User Requests")
    public ResponseEntity<Page<RFQRequestDTO>> getUserRequests(
            @PathVariable UUID userId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            Principal principal) {
        if (!isOwnerOrAdmin(userId, principal)) {
            return ResponseEntity.status(403).build();
        }
        Page<RFQ> requests = rfqService.getUserRequests(userId, status, PageRequest.of(page, size));
        return ResponseEntity.ok(requests.map(entityMapper::toRFQRequestDTO));
    }

    @PutMapping("/requests/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update RFQ (Admin Only)")
    public ResponseEntity<RFQRequestDTO> updateRequest(@PathVariable UUID id, @RequestBody Map<String, Object> updates) {
        return ResponseEntity.ok(entityMapper.toRFQRequestDTO(rfqService.updateRequest(id, updates)));
    }

    @PostMapping("/requests/{id}/cancel")
    @Operation(summary = "Cancel RFQ")
    public ResponseEntity<Void> cancelRequest(@PathVariable UUID id, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        rfqService.cancelRequest(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/requests/{id}/quote")
    @Operation(summary = "Get Latest Quote")
    public ResponseEntity<RFQQuoteDTO> getLatestQuote(@PathVariable UUID id, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(entityMapper.toRFQQuoteDTO(rfqService.getLatestQuote(id)));
    }

    @PostMapping("/requests/{id}/quote")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Push Formal Quote (Admin Only)")
    public ResponseEntity<RFQQuoteDTO> createQuote(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        java.math.BigDecimal proposedPrice = new java.math.BigDecimal(body.get("proposedPrice").toString());
        String notes = body.containsKey("notes") ? body.get("notes").toString() : null;
        RFQQuote created = rfqService.createQuote(id, proposedPrice, notes);
        return ResponseEntity.status(201).body(entityMapper.toRFQQuoteDTO(created));
    }

    @GetMapping("/requests/{id}/quotes")
    @Operation(summary = "Get All Quotes for RFQ")
    public ResponseEntity<Page<RFQQuoteDTO>> getAllQuotes(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        Page<RFQQuote> quotes = rfqService.getAllQuotes(id, PageRequest.of(page, size));
        return ResponseEntity.ok(quotes.map(entityMapper::toRFQQuoteDTO));
    }

    @GetMapping("/requests/{id}/quote/pdf")
    @Operation(summary = "Download Quote PDF")
    public ResponseEntity<byte[]> downloadQuotePdf(@PathVariable UUID id, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        byte[] pdf = rfqService.generateQuotePdf(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=quote.pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @PostMapping("/requests/{id}/accept")
    @Operation(summary = "Accept Quote")
    public ResponseEntity<Void> acceptQuote(@PathVariable UUID id, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        rfqService.acceptQuote(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/requests/{id}/reject")
    @Operation(summary = "Reject Quote")
    public ResponseEntity<Void> rejectQuote(@PathVariable UUID id, @RequestBody Map<String, String> body, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        rfqService.rejectQuote(id, body.get("reason"));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/requests/{id}/negotiate")
    @Operation(summary = "Request Negotiation")
    public ResponseEntity<Void> negotiate(@PathVariable UUID id, @RequestBody NegotiationRequestDTO request, Principal principal) {
        RFQ rfq = rfqService.getRequest(id);
        if (!isOwnerOrAdmin(rfq.getUser().getId(), principal)) {
            return ResponseEntity.status(403).build();
        }
        rfqService.negotiate(id, request);
        return ResponseEntity.ok().build();
    }
}
