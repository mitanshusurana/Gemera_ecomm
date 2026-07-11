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

    @Data
    public static class PaymentDetailsDTO {
        private String razorpay_payment_id;
        private String razorpay_order_id;
        private String razorpay_signature;
    }
}
