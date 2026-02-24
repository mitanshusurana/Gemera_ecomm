package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class InitializePaymentRequest {
    private UUID orderId;
    private BigDecimal amount;
    private String currency;
    private String paymentMethod;
}
