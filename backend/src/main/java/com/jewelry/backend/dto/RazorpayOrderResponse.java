package com.jewelry.backend.dto;

import lombok.Data;
import lombok.AllArgsConstructor;

@Data
@AllArgsConstructor
public class RazorpayOrderResponse {
    private String id;
    private Integer amount;
    private String currency;
    private String status;
}
