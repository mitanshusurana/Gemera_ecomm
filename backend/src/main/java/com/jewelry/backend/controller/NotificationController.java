package com.jewelry.backend.controller;

import com.jewelry.backend.entity.StockNotification;
import com.jewelry.backend.repository.StockNotificationRepository;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    @Autowired
    private StockNotificationRepository stockNotificationRepository;

    @PostMapping("/stock")
    @Operation(summary = "Subscribe to back-in-stock notification")
    public ResponseEntity<Void> subscribeStockNotification(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String productIdStr = payload.get("productId");

        if (email == null || productIdStr == null) {
            return ResponseEntity.badRequest().build();
        }

        UUID productId = UUID.fromString(productIdStr);

        if (!stockNotificationRepository.existsByEmailAndProductIdAndNotifiedFalse(email, productId)) {
            StockNotification notification = new StockNotification();
            notification.setEmail(email);
            notification.setProductId(productId);
            notification.setNotified(false);
            stockNotificationRepository.save(notification);
        }

        return ResponseEntity.ok().build();
    }
}
