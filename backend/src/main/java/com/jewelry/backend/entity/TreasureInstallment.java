package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One installment of a Treasure Chest plan (FINISH-CONTRACT.md section 2).
 * Created PENDING with a Razorpay order by the customer flow, or CASH by the
 * admin, and moved to PAID by {@code TreasurePlanService.applyPayment}.
 */
@Entity
@Table(name = "treasure_installments")
@Data
@EqualsAndHashCode(callSuper = true)
public class TreasureInstallment extends BaseEntity {
    public static final String METHOD_RAZORPAY = "RAZORPAY";
    public static final String METHOD_CASH = "CASH";
    public static final String METHOD_ADMIN = "ADMIN";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_PAID = "PAID";
    public static final String STATUS_FAILED = "FAILED";

    @ManyToOne(optional = false)
    @JoinColumn(name = "account_id")
    @ToString.Exclude
    private TreasureChestAccount account;

    private int installmentNumber; // 1-based; re-sequenced to installmentsPaid + 1 when paid
    private BigDecimal amount;
    private String method; // RAZORPAY | CASH | ADMIN
    private String status; // PENDING | PAID | FAILED

    private String razorpayOrderId;
    private String razorpayPaymentId;

    private LocalDateTime paidAt;

    @Column(columnDefinition = "TEXT")
    private String note;
}
