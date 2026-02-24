package com.jewelry.backend.dto;

import lombok.Data;

@Data
public class VerifyPaymentRequest {
    private String paymentId;
    private String paymentToken; // e.g. Razorpay signature or payment ID
    private String orderId; // Razorpay order ID usually needed for signature verification
}
