package com.jewelry.backend.dto;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class OrderTracking {
    private String orderId;
    private String status;
    private LocalDate estimatedDelivery;
    private String trackingNumber;
    private List<String> history;
}
