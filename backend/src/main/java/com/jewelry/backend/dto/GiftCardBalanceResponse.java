package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GiftCardBalanceResponse {
    private String code; // masked: CL-****-****-1234
    private BigDecimal balance;
    private String currency;
    private String status;
    private LocalDateTime expiresAt;
}
