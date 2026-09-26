package com.jewelry.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class LoyaltyTransactionDTO {
    private UUID id;
    private String type; // EARN | REDEEM | EXPIRE | ADJUST | REFERRAL
    private int points; // signed
    private int balanceAfter;
    private UUID orderId;
    private String reference;
    private LocalDateTime expiresAt;
    private String note;
    private LocalDateTime createdAt;
}
