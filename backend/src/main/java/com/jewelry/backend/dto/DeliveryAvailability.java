package com.jewelry.backend.dto;

import lombok.Data;
import lombok.AllArgsConstructor;

@Data
@AllArgsConstructor
public class DeliveryAvailability {
    private boolean available;
    private String estimatedDate;
    private String message;
}
