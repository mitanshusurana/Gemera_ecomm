package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class GiftCardDTO {
    private UUID id;
    private String code;
    private BigDecimal initialAmount;
    private BigDecimal balance;
    private String currency;
    private String recipientName;
    private String recipientEmail;
    private String message;
    private String theme;
    private String status;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
}
