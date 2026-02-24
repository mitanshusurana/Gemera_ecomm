package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CreateOrderRequest;
import com.jewelry.backend.dto.OrderDTO;
import com.jewelry.backend.dto.OrderTracking;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
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

    @PostMapping
    @Operation(summary = "Create new order")
    public ResponseEntity<OrderDTO> createOrder(@RequestBody CreateOrderRequest request, Principal principal) {
        Order order = orderService.createOrder(principal.getName(), request);
        return ResponseEntity.status(201).body(entityMapper.toOrderDTO(order));
    }

    @GetMapping
    @Operation(summary = "Get user orders")
    public ResponseEntity<Page<OrderDTO>> getOrders(
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "10") int size,
            Principal principal) {
        // Simple check for admin email for now, better to use Roles from Principal/SecurityContext
        if ("admin@gemara.com".equals(principal.getName())) {
             Page<Order> orders = orderService.getAllOrders(PageRequest.of(page, size));
             return ResponseEntity.ok(orders.map(entityMapper::toOrderDTO));
        }
        Page<Order> orders = orderService.getUserOrders(principal.getName(), PageRequest.of(page, size));
        return ResponseEntity.ok(orders.map(entityMapper::toOrderDTO));
    }

    @GetMapping("/{orderId}")
    @Operation(summary = "Get order details")
    public ResponseEntity<OrderDTO> getOrder(@PathVariable UUID orderId) {
        return ResponseEntity.ok(entityMapper.toOrderDTO(orderService.getOrder(orderId)));
    }

    @GetMapping("/track/{id}")
    @Operation(summary = "Track order (Public)")
    public ResponseEntity<OrderTracking> trackOrder(@PathVariable UUID id) {
        return ResponseEntity.ok(orderService.trackOrder(id));
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "Update status (Admin)")
    public ResponseEntity<OrderDTO> updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Order order = orderService.updateStatus(id, body.get("status"), body.get("trackingNumber"));
        return ResponseEntity.ok(entityMapper.toOrderDTO(order));
    }
}
