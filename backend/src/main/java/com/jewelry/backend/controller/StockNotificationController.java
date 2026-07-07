package com.jewelry.backend.controller;

import com.jewelry.backend.entity.StockNotification;
import com.jewelry.backend.repository.StockNotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@CrossOrigin(origins = "*", maxAge = 3600)
public class StockNotificationController {

    @Autowired
    private StockNotificationRepository notificationRepository;

    @PostMapping("/stock")
    public ResponseEntity<?> subscribeToStock(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String productIdStr = payload.get("productId");

        if (email == null || productIdStr == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email and productId are required"));
        }

        UUID productId;
        try {
            productId = UUID.fromString(productIdStr);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid productId format"));
        }

        if (notificationRepository.existsByEmailAndProductIdAndNotifiedFalse(email, productId)) {
            return ResponseEntity.ok(Map.of("message", "Already subscribed"));
        }

        StockNotification notification = new StockNotification();
        notification.setEmail(email);
        notification.setProductId(productId);
        notificationRepository.save(notification);

        return ResponseEntity.ok(Map.of("message", "Successfully subscribed to stock notifications"));
    }
}
