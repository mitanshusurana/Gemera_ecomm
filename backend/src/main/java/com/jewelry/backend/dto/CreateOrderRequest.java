package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class CreateOrderRequest {
    private AddressDTO shippingAddress;
    private AddressDTO billingAddress;
    private String paymentMethod;
    private String shippingMethod;
    private List<CartItemDTO> items;
    private BigDecimal total;
    private PaymentDetailsDTO paymentDetails;
    private String idempotencyKey;

    // Optional buyer tax identifiers. PAN becomes mandatory at or above
    // Rs. 2,00,000 (OrderService enforces Rule 114B); GSTIN is for business
    // buyers who need input credit on the invoice.
    private String buyerGstin;
    private String buyerPan;

    @Data
    public static class PaymentDetailsDTO {
        private String razorpay_payment_id;
        private String razorpay_order_id;
        private String razorpay_signature;
    }
}
