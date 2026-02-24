package com.jewelry.backend.dto;

import lombok.Data;

@Data
public class TransactionFailureRequest {
    private String error_code;
    private String error_description;
    private String razorpay_order_id;
    private String razorpay_payment_id;
}
