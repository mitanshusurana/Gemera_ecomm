package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Response of POST /api/v1/treasure/account/installments/order: what Razorpay checkout needs. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TreasureInstallmentOrderResponse {
    private UUID installmentId;
    private String razorpayOrderId;
    private Integer amount; // paise, as Razorpay expects
    private String currency;
}
