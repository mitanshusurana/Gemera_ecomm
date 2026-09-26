package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One movement of a customer's loyalty points. {@code User.loyaltyPoints}
 * is the running balance; this ledger explains it and carries the expiry
 * date of every lot of points earned.
 *
 * Types: EARN (on a paid order), REDEEM (burned at checkout, negative),
 * EXPIRE (nightly job, negative), ADJUST (admin correction or a reversal
 * when an order is cancelled or refunded, either sign), REFERRAL (bonus to
 * referrer and referee on the referee's first paid order).
 */
@Entity
@Table(name = "loyalty_transactions",
        indexes = {
                @Index(name = "idx_loyalty_user_created", columnList = "user_id, createdAt"),
                @Index(name = "idx_loyalty_expiry", columnList = "expiresAt, expiryProcessed")
        })
@Getter
@Setter
public class LoyaltyTransaction extends BaseEntity {

    public static final String TYPE_EARN = "EARN";
    public static final String TYPE_REDEEM = "REDEEM";
    public static final String TYPE_EXPIRE = "EXPIRE";
    public static final String TYPE_ADJUST = "ADJUST";
    public static final String TYPE_REFERRAL = "REFERRAL";

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String type;

    /** Signed: positive adds to the balance, negative removes. */
    @Column(nullable = false)
    private int points;

    /** The user's balance right after this movement. */
    @Column(nullable = false)
    private int balanceAfter;

    /** Order the movement belongs to, when any. */
    private UUID orderId;

    /** Human-readable reference: order number, referee e-mail, admin e-mail. */
    private String reference;

    /** When the points of an EARN / REFERRAL lot lapse; null for the other types. */
    private LocalDateTime expiresAt;

    /** Set once the nightly job has looked at this lot (so a lot is expired only once). */
    @Column(columnDefinition = "boolean default false")
    private boolean expiryProcessed;

    @Column(columnDefinition = "TEXT")
    private String note;
}
