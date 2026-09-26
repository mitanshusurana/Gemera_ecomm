package com.jewelry.backend.dto;

import lombok.Data;
import org.springframework.data.domain.Page;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** GET /api/v1/loyalty/me and the admin customer loyalty view. */
@Data
public class LoyaltySummaryDTO {
    private int balance;
    private BigDecimal balanceValue; // balance x pointValue, INR
    private long lifetimeEarned;
    private String tier; // SILVER | GOLD | PLATINUM
    private long tierFloor; // lifetime points where the current tier starts
    private String nextTier; // null on PLATINUM
    private Long nextTierAt; // lifetime points where the next tier starts
    private long pointsToNextTier;
    private int expiringSoon; // unspent points lapsing within 30 days
    private LocalDateTime expiringSoonAt; // the earliest of those dates

    // Scheme parameters, so the storefront can explain the rules.
    private BigDecimal pointValue;
    private int pointsPer100;
    private BigDecimal maxRedeemPct;
    private int expiryMonths;
    private int referralBonus;

    private String referralCode;
    private String referredByName;

    private Page<LoyaltyTransactionDTO> history;
}
