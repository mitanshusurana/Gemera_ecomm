package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.OneToOne;
import jakarta.persistence.JoinColumn;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "treasure_chest_accounts")
@Data
@EqualsAndHashCode(callSuper = true)
public class TreasureChestAccount extends BaseEntity {
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;

    private String status; // ACTIVE | MATURED | REDEEMED | CLOSED
    private String planName;
    private BigDecimal installmentAmount;
    private BigDecimal currentBalance; // Maps to balance in DTO

    private int installmentsPaid;
    private int totalInstallments;
    private LocalDate startDate;
    private LocalDate nextDueDate;

    /**
     * Gold rate protection: every PAID installment also books the grams of
     * 24K gold the money bought at that day's rate. On maturity the customer
     * may redeem the higher of the rupee balance (with bonus) and these grams
     * at the day's rate. Null on accounts that pre-date the column.
     */
    @Column(precision = 12, scale = 4)
    private BigDecimal goldGramsAccrued;

    // Redemption against a web order (OrderService.createOrder). The balance
    // and grams are reduced proportionally; a CANCELLED/REFUNDED order puts
    // them back (see TreasurePlanService.redeem / restore).
    private BigDecimal redeemedAmount; // rupee value applied to orders
    private BigDecimal redeemedBalance; // how much of currentBalance that consumed
    @Column(precision = 12, scale = 4)
    private BigDecimal redeemedGrams; // how many grams that consumed
    private UUID redeemedOrderId; // the latest order it was applied to
}
