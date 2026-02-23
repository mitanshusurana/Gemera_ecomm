package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;

@Data
public class OrderDTO {
    private UUID id;
    private List<OrderItemDTO> items;
    private BigDecimal total;
    private String status;
    private LocalDate estimatedDelivery;
    private String trackingNumber;
    private AddressDTO shippingAddress;
    private AddressDTO billingAddress;
    private String paymentMethod;
    private String shippingMethod;
    private String razorpayOrderId;
}
