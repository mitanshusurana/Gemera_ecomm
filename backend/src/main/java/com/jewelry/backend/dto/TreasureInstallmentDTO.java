package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class TreasureInstallmentDTO {
    private UUID id;
    private int installmentNumber;
    private BigDecimal amount;
    private String method; // RAZORPAY | CASH | ADMIN
    private String status; // PENDING | PAID | FAILED
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private LocalDateTime paidAt;
    private String note;
    private LocalDateTime createdAt;
}
