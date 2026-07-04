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
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

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
    @Operation(summary = "Create new order")
    public ResponseEntity<OrderDTO> createOrder(@RequestBody CreateOrderRequest request, Principal principal) {
        Order order = orderService.createOrder(principal.getName(), request);
        return ResponseEntity.status(201).body(entityMapper.toOrderDTO(order));
    }

    @GetMapping
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

    @GetMapping("/{orderId}")
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
    @Operation(summary = "Track order (Public)")
    public ResponseEntity<OrderTracking> trackOrder(@PathVariable String id) {
        return ResponseEntity.ok(orderService.trackOrder(id));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Update order status — Admin only")
    public ResponseEntity<OrderDTO> updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderStatus(id, body.get("status"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    @PutMapping("/{id}/tracking")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Update order tracking number — Admin only")
    public ResponseEntity<OrderDTO> updateTracking(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderTracking(id, body.get("trackingNumber"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }

    @PutMapping("/{id}/notes")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Update internal notes — Admin only")
    public ResponseEntity<OrderDTO> updateNotes(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateOrderNotes(id, body.get("notes"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }
}

