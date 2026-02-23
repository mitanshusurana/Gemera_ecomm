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
    private LocalDate nextDueDate;
}
