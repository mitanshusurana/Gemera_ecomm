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
    private BigDecimal goldGrams; // 24K grams this installment bought (null before the gram scheme)
    private BigDecimal ratePerGram;
    private boolean rateIndicative;
    private String note;
    private LocalDateTime createdAt;
}
