package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.OneToOne;
import jakarta.persistence.JoinColumn;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "treasure_chest_accounts")
@Data
@EqualsAndHashCode(callSuper = true)
public class TreasureChestAccount extends BaseEntity {
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;

    private String status; // e.g., "ACTIVE"
    private String planName;
    private BigDecimal installmentAmount;
    private BigDecimal currentBalance; // Maps to balance in DTO

    private int installmentsPaid;
    private int totalInstallments;
    private LocalDate startDate;
    private LocalDate nextDueDate;
}
