package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class TreasureChestAccountDTO {
    private UUID id;
    private String planName;
    private BigDecimal installmentAmount;
    private int installmentsPaid;
    private int totalInstallments;
    private BigDecimal balance;
    private String status;
    private LocalDate startDate;
    private LocalDate nextDueDate; // null once the plan has MATURED
    private BigDecimal bonusAmount; // installmentAmount x bonus months, added on maturity
    private BigDecimal maturityAmount; // installmentAmount x totalInstallments + bonusAmount

    // Gram accrual and gold rate protection (TreasurePlanService.enrich).
    private BigDecimal goldGramsAccrued; // 24K grams bought by the paid installments
    private BigDecimal ratePerGram; // today's 24K rate, INR per gram
    private boolean rateIndicative; // true when a fallback rate was used
    private BigDecimal goldValue; // goldGramsAccrued x ratePerGram
    private BigDecimal redeemableValue; // max(balance, goldValue) once MATURED; null before
    private String redeemableBasis; // BALANCE | GOLD

    // Redemption against a web order.
    private BigDecimal redeemedAmount;
    private UUID redeemedOrderId;
    private String redeemedOrderNumber;

    // Admin list only.
    private UUID userId;
    private String customerName;
    private String customerEmail;
}
