package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;

@Data
public class OrderDTO {
    private UUID id;
    private String orderNumber;
    private List<OrderItemDTO> items;
    private BigDecimal total;
    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal shipping;
    private BigDecimal discount;
    private String appliedCoupon;
    private String appliedGiftCard;
    private BigDecimal giftCardAmount;

    private String status;
    private LocalDate estimatedDelivery;
    private String trackingNumber;
    private String internalNotes;
    private AddressDTO shippingAddress;
    private AddressDTO billingAddress;
    private String paymentMethod;
    private String shippingMethod;
    private String razorpayOrderId;

    // Admin order flow (OPERATIONS-CONTRACT.md section 3)
    private String customerEmail;
    private String customerName;
    private List<String> nextStatuses; // from OrderService.ALLOWED_TRANSITIONS
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
