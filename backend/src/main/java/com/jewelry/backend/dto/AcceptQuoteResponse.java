package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Response of POST /rfq/requests/{id}/accept: the order created from the
 * quote and the Razorpay order to pay it with. {@code razorpayOrderId} is
 * null when the order is already paid or the gateway is not configured (the
 * storefront can retry through POST /orders/{id}/payment-order).
 */
@Data
@AllArgsConstructor
public class AcceptQuoteResponse {
    private UUID orderId;
    private String orderNumber;
    private String orderStatus;
    private String razorpayOrderId;
    /** Paise, as Razorpay expects. */
    private Integer amount;
    private String currency;
    private BigDecimal amountInr;
}
