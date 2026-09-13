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
}
