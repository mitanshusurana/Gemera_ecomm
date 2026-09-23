package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Old gold or silver a customer hands in for store credit.
 *
 * Life cycle: REQUESTED (quote snapshot from the storefront) -> RECEIVED (item
 * at the counter or by insured post) -> ASSAYED (touchstone/XRF result and
 * the final value) -> CREDITED (a gift card with source EXCHANGE carries the
 * value, and the ERP records the RCM purchase). REJECTED and CANCELLED are
 * terminal. Rule 114B: PAN is mandatory once the value reaches Rs 2,00,000.
 */
@Entity
@Table(name = "exchange_requests")
@Getter
@Setter
public class ExchangeRequest extends BaseEntity {

    public static final String STATUS_REQUESTED = "REQUESTED";
    public static final String STATUS_RECEIVED = "RECEIVED";
    public static final String STATUS_ASSAYED = "ASSAYED";
    public static final String STATUS_CREDITED = "CREDITED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    public static final String METAL_GOLD = "GOLD";
    public static final String METAL_SILVER = "SILVER";

    @Column(unique = true, nullable = false, length = 20)
    private String requestNumber; // EX-YYYY-00001

    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 120)
    private String customerName;

    private String email;
    private String phone;

    @Column(nullable = false, length = 10)
    private String metal; // GOLD | SILVER

    /** As the customer declared it: 22K, 18K, 916, 750, 999, 925 ... */
    private String declaredPurity;

    /** Fine-metal fraction for the declared purity (22K -> 0.916). */
    @Column(precision = 6, scale = 4)
    private BigDecimal declaredPurityFraction;

    @Column(precision = 12, scale = 3)
    private BigDecimal declaredWeightGrams;

    // ---- quote snapshot (rate for the fine metal, per gram, INR) ----
    @Column(precision = 14, scale = 2)
    private BigDecimal quotedRatePerGram;

    @Column(precision = 6, scale = 2)
    private BigDecimal quotedDeductionPct;

    @Column(precision = 14, scale = 2)
    private BigDecimal quotedValue;

    private boolean quoteIndicative;

    @Column(nullable = false, length = 20)
    private String status = STATUS_REQUESTED;

    // ---- assay result ----
    @Column(precision = 6, scale = 4)
    private BigDecimal assayedPurityFraction;

    @Column(precision = 12, scale = 3)
    private BigDecimal assayedNetWeightGrams;

    @Column(precision = 14, scale = 2)
    private BigDecimal assayedRatePerGram;

    @Column(precision = 6, scale = 2)
    private BigDecimal deductionPct;

    @Column(precision = 14, scale = 2)
    private BigDecimal finalValue;

    @Column(columnDefinition = "TEXT")
    private String rejectionReason;

    // ---- KYC ----
    @Column(length = 10)
    private String pan;

    private String idProofType;
    private String idProofNumber;

    /** Seller GST state code for the ERP purchase (place of supply). */
    @Column(length = 2)
    private String stateCode;

    /** Gift card code (source EXCHANGE) that carries the credit. */
    @Column(length = 32)
    private String creditGiftCardCode;

    /** purchase_invoice_no the ERP returned for the RCM purchase. */
    private String erpPurchaseRef;

    @Column(columnDefinition = "TEXT")
    private String itemDescription;

    @Column(columnDefinition = "TEXT")
    private String notes;

    private LocalDateTime receivedAt;
    private LocalDateTime assayedAt;
    private LocalDateTime creditedAt;
    private LocalDateTime closedAt;

    public boolean isOpen() {
        return !STATUS_CREDITED.equals(status) && !STATUS_REJECTED.equals(status) && !STATUS_CANCELLED.equals(status);
    }
}
