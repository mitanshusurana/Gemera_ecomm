package com.jewelry.backend.controller;

import com.jewelry.backend.dto.ReturnDtos.CreateReturnRequest;
import com.jewelry.backend.dto.ReturnDtos.EligibilityDTO;
import com.jewelry.backend.dto.ReturnDtos.ReceiveRequest;
import com.jewelry.backend.dto.ReturnDtos.ReturnRequestDTO;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.service.OrderService;
import com.jewelry.backend.service.ReturnService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Returns and exchanges. Customer endpoints act on the caller's own orders;
 * the admin endpoints under /admin/returns need orders.write (resolve also
 * needs orders.refund, enforced in the service).
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Returns", description = "Returns and exchanges (RMA)")
public class ReturnController {

    @Autowired
    ReturnService returnService;

    @Autowired
    OrderService orderService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AccessService access;

    // ---- customer -------------------------------------------------------

    @GetMapping("/orders/{orderId}/returns/eligibility")
    @Transactional(readOnly = true)
    @Operation(summary = "What can still be returned on one of my orders")
    public ResponseEntity<EligibilityDTO> eligibility(@PathVariable UUID orderId, Principal principal) {
        Order order = orderService.getOrder(orderId);
        if (!ownsOrStaff(order, principal)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(returnService.eligibility(order));
    }

    @PostMapping("/orders/{orderId}/returns")
    @Transactional
    @Operation(summary = "Raise a return or exchange request on one of my orders")
    public ResponseEntity<ReturnRequestDTO> create(@PathVariable UUID orderId,
                                                   @RequestBody CreateReturnRequest body,
                                                   Principal principal) {
        return ResponseEntity.status(201).body(returnService.toDTO(returnService.create(principal.getName(), orderId, body)));
    }

    @GetMapping("/returns/mine")
    @Transactional(readOnly = true)
    @Operation(summary = "My return requests, newest first")
    public ResponseEntity<List<ReturnRequestDTO>> mine(Principal principal) {
        return ResponseEntity.ok(returnService.mine(principal.getName()).stream().map(returnService::toDTO).toList());
    }

    @PostMapping("/returns/{rma}/cancel")
    @Transactional
    @Operation(summary = "Withdraw my return request while it is REQUESTED or APPROVED")
    public ResponseEntity<ReturnRequestDTO> cancel(@PathVariable String rma, Principal principal) {
        return ResponseEntity.ok(returnService.toDTO(returnService.cancelByCustomer(principal.getName(), rma)));
    }

    // ---- staff ----------------------------------------------------------

    @GetMapping("/admin/returns")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional(readOnly = true)
    @Operation(summary = "List return requests with status filter and search")
    public ResponseEntity<Page<ReturnRequestDTO>> list(@RequestParam(required = false) String status,
                                                       @RequestParam(required = false) String q,
                                                       @RequestParam(defaultValue = "0") int page,
                                                       @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(returnService.list(status, q, page, size).map(returnService::toDTO));
    }

    @GetMapping("/admin/returns/stats")
    @PreAuthorize("@access.has('orders.write')")
    public ResponseEntity<Map<String, Long>> stats() {
        return ResponseEntity.ok(returnService.stats());
    }

    @GetMapping("/admin/returns/{id}")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional(readOnly = true)
    public ResponseEntity<ReturnRequestDTO> get(@PathVariable UUID id) {
        return ResponseEntity.ok(returnService.toDTO(returnService.get(id)));
    }

    /** Body: {@code { restockingFee?, note? }}. */
    @PutMapping("/admin/returns/{id}/approve")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional
    public ResponseEntity<ReturnRequestDTO> approve(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        BigDecimal fee = null;
        Object raw = body == null ? null : body.get("restockingFee");
        if (raw != null && !raw.toString().isBlank()) {
            try {
                fee = new BigDecimal(raw.toString().trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("restockingFee must be a number");
            }
        }
        String note = body == null || body.get("note") == null ? null : body.get("note").toString();
        return ResponseEntity.ok(returnService.toDTO(returnService.approve(id, fee, note)));
    }

    /** Body: {@code { note }}. */
    @PutMapping("/admin/returns/{id}/reject")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional
    public ResponseEntity<ReturnRequestDTO> reject(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(returnService.toDTO(returnService.reject(id, body == null ? null : body.get("note"))));
    }

    /** Body: {@code { lines: [{ lineId, received, condition }], note? }}. */
    @PutMapping("/admin/returns/{id}/receive")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional
    public ResponseEntity<ReturnRequestDTO> receive(@PathVariable UUID id, @RequestBody ReceiveRequest body) {
        return ResponseEntity.ok(returnService.toDTO(returnService.receive(id, body)));
    }

    /** Body: {@code { note? }}. Needs orders.refund as well. */
    @PutMapping("/admin/returns/{id}/resolve")
    @PreAuthorize("@access.has('orders.write')")
    @Transactional
    public ResponseEntity<ReturnRequestDTO> resolve(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        return ResponseEntity.ok(returnService.toDTO(returnService.resolve(id, body == null ? null : body.get("note"))));
    }

    private boolean ownsOrStaff(Order order, Principal principal) {
        if (access.has("orders.read")) {
            return true;
        }
        if (principal == null || order.getUser() == null) {
            return false;
        }
        User user = userRepository.findByEmail(principal.getName()).orElse(null);
        return user != null && user.getId().equals(order.getUser().getId());
    }
}
