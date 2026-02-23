package com.jewelry.backend.dto;

import lombok.Data;

@Data
public class CreateRazorpayOrderRequest {
    private Integer amount;
    private String currency;
}
