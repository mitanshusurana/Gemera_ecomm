package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * GET /api/v1/treasure/accounts/{id}/redeemable: the gold rate protection.
 * redeemableValue = max(balance incl. bonus, goldGramsAccrued x today's 24K rate).
 */
@Data
public class TreasureRedeemableDTO {
    private UUID accountId;
    private String status;
    private boolean redeemable; // MATURED with something left
    private BigDecimal balance;
    private BigDecimal goldGramsAccrued;
    private BigDecimal ratePerGram; // today's 24K INR per gram
    private boolean rateIndicative;
    private BigDecimal goldValue; // grams x rate
    private BigDecimal redeemableValue;
    private String basis; // BALANCE | GOLD
}
