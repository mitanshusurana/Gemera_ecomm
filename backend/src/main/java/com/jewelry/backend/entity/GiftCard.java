package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "gift_cards")
@Data
@EqualsAndHashCode(callSuper = true)
public class GiftCard extends BaseEntity {
    public static final String STATUS_PENDING_PAYMENT = "PENDING_PAYMENT";
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_DEPLETED = "DEPLETED";
    public static final String STATUS_DISABLED = "DISABLED";

    // CL-XXXX-XXXX-XXXX; null until the card becomes ACTIVE
    @Column(unique = true, length = 32)
    private String code;

    private BigDecimal initialAmount;
    private BigDecimal balance = BigDecimal.ZERO;
    private String currency = "INR";

    private String purchaserEmail;
    private String recipientName;
    private String recipientEmail;

    @Column(length = 500)
    private String message;

    private String theme; // "classic" | "gold" | "ruby"
    private String status; // PENDING_PAYMENT, ACTIVE, DEPLETED, DISABLED

    private LocalDateTime expiresAt; // activation + 12 months

    private String razorpayOrderId;
    private String razorpayPaymentId;

    private String issuedBy; // admin email when issued offline, otherwise null

    @Column(columnDefinition = "TEXT")
    private String note; // admin-only

    /**
     * How the card came to exist: PURCHASE (storefront, paid), ADMIN (issued
     * offline) or EXCHANGE (store credit for old gold). The ERP sale payload
     * reports EXCHANGE redemptions as exchange credit, not as a payment.
     */
    @Column(length = 16)
    private String source = SOURCE_PURCHASE;

    /** The ExchangeRequest this card credits; only set when source is EXCHANGE. */
    private UUID exchangeRequestId;

    public static final String SOURCE_PURCHASE = "PURCHASE";
    public static final String SOURCE_ADMIN = "ADMIN";
    public static final String SOURCE_EXCHANGE = "EXCHANGE";
}
