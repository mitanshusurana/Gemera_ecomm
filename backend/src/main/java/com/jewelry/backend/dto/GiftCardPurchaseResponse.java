package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GiftCardPurchaseResponse {
    private UUID giftCardId;
    private String razorpayOrderId;
    private Integer amount; // paise, as Razorpay expects
    private String currency;
}
