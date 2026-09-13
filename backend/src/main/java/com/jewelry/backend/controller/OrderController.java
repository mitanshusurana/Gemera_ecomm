package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CreateOrderRequest;
import com.jewelry.backend.dto.OrderDTO;
import com.jewelry.backend.dto.OrderTracking;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

/**
 * Order APIs. Methods that map an Order (lazy {@code items}) are
 * {@code @Transactional} because open-in-view is off.
 */
@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders", description = "Order management APIs")
public class OrderController {

    @Autowired
    OrderService orderService;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    UserRepository userRepository;

    @PostMapping
    @Transactional
    @Operation(summary = "Create new order")
    public ResponseEntity<OrderDTO> createOrder(@RequestBody CreateOrderRequest request, Principal principal) {
        Order order = orderService.createOrder(principal.getName(), request);
        return ResponseEntity.status(201).body(entityMapper.toOrderDTO(order));
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Get user orders (Admin sees all)")
    public ResponseEntity<Page<OrderDTO>> getOrders(
            @RequestParam(required = false) String status,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "10") int size,
            Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElse(null);
        if (user != null && "ADMIN".equals(user.getRole())) {
            Page<Order> orders = orderService.getAllOrders(status, PageRequest.of(page, size));
            return ResponseEntity.ok(orders.map(entityMapper::toOrderDTO));
        }
        Page<Order> orders = orderService.getUserOrders(principal.getName(), status, PageRequest.of(page, size));
        return ResponseEntity.ok(orders.map(entityMapper::toOrderDTO));
    }

    // Declared before "/{orderId}" so "stats" is never parsed as a UUID.
    @GetMapping("/stats")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Order counts per status for the admin list chips — Admin only")
    public ResponseEntity<Map<String, Long>> getStats() {
        return ResponseEntity.ok(orderService.getOrderStats());
    }

    @GetMapping("/{orderId}")
    @Transactional(readOnly = true)
    @Operation(summary = "Get order details — user can only see own orders")
    public ResponseEntity<OrderDTO> getOrder(@PathVariable UUID orderId, Principal principal) {
        Order order = orderService.getOrder(orderId);
        User requestingUser = userRepository.findByEmail(principal.getName()).orElseThrow();
        // Only allow if ADMIN or the order belongs to this user
        if (!"ADMIN".equals(requestingUser.getRole()) &&
                !order.getUser().getId().equals(requestingUser.getId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    @GetMapping("/track/{id}")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    @Operation(summary = "Track order")
    public ResponseEntity<OrderTracking> trackOrder(@PathVariable String id, Principal principal) {
        OrderTracking tracking = orderService.trackOrder(id);
        Order order = orderService.getOrderByIdentifier(id);
        User requestingUser = userRepository.findByEmail(principal.getName()).orElseThrow();
        if (!"ADMIN".equals(requestingUser.getRole()) &&
                !order.getUser().getId().equals(requestingUser.getId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(tracking);
    }

    /**
     * Body: {@code { status, trackingNumber?, shippingMethod?, estimatedDelivery?, reason? }}.
     * The optional keys feed the SHIPPED (tracking) and CANCELLED (reason) transitions.
     */
    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Update order status — Admin only")
    public ResponseEntity<OrderDTO> updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderStatus(id, body.get("status"), body);
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    /** Body: {@code { trackingNumber, shippingMethod?, estimatedDelivery? (YYYY-MM-DD) }}. Sets tracking, then transitions to SHIPPED. */
    @PutMapping("/{id}/ship")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Record tracking details and mark the order shipped in one call — Admin only")
    public ResponseEntity<OrderDTO> ship(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.shipOrder(id,
                body.get("trackingNumber"),
                body.get("shippingMethod"),
                body.get("estimatedDelivery"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    @PutMapping("/{id}/tracking")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Update order tracking number — Admin only")
    public ResponseEntity<OrderDTO> updateTracking(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderTracking(id, body.get("trackingNumber"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    @PutMapping("/{id}/notes")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    @Operation(summary = "Update internal notes — Admin only")
    public ResponseEntity<OrderDTO> updateNotes(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderNotes(id, body.get("notes"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }
}
