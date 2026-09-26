package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Return merchandise authorisation (RMA) for a delivered order.
 *
 * Status: REQUESTED, APPROVED, REJECTED, RECEIVED, REFUNDED, EXCHANGED,
 * CANCELLED. Resolution: REFUND (gateway refund), STORE_CREDIT (gift card),
 * EXCHANGE (replacement order paid with the credit).
 */
@Entity
@Table(name = "return_requests")
@Data
@EqualsAndHashCode(callSuper = true)
public class ReturnRequest extends BaseEntity {

    public static final String STATUS_REQUESTED = "REQUESTED";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_RECEIVED = "RECEIVED";
    public static final String STATUS_REFUNDED = "REFUNDED";
    public static final String STATUS_EXCHANGED = "EXCHANGED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    public static final List<String> STATUSES = List.of(
            STATUS_REQUESTED, STATUS_APPROVED, STATUS_RECEIVED, STATUS_REFUNDED, STATUS_EXCHANGED,
            STATUS_REJECTED, STATUS_CANCELLED);

    /** Statuses whose lines still count against the order's returnable quantity. */
    public static final List<String> OPEN_OR_DONE = List.of(
            STATUS_REQUESTED, STATUS_APPROVED, STATUS_RECEIVED, STATUS_REFUNDED, STATUS_EXCHANGED);

    public static final String RESOLUTION_REFUND = "REFUND";
    public static final String RESOLUTION_EXCHANGE = "EXCHANGE";
    public static final String RESOLUTION_STORE_CREDIT = "STORE_CREDIT";

    public enum Reason { DAMAGED, WRONG_ITEM, NOT_AS_DESCRIBED, SIZE, CHANGED_MIND, OTHER }

    @Column(unique = true, length = 32)
    private String rmaNumber;

    @ManyToOne
    @JoinColumn(name = "order_id")
    private Order order;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;

    @Column(length = 24)
    private String status = STATUS_REQUESTED;

    @Enumerated(EnumType.STRING)
    @Column(length = 24)
    private Reason reason;

    @Column(columnDefinition = "TEXT")
    private String reasonNote;

    @Column(length = 24)
    private String resolution;

    // Value of the returned lines (price less discount share, plus tax share)
    // minus the restocking fee; what the customer gets back.
    private BigDecimal refundAmount;
    private BigDecimal restockingFee;

    // What the gateway actually returned at resolution (0 for store credit / exchange).
    private BigDecimal refundedViaGateway;
    private String razorpayRefundId;

    // EXCHANGE: the replacement order; STORE_CREDIT / EXCHANGE: the gift card carrying the credit.
    private UUID exchangeOrderId;
    private String storeCreditGiftCardCode;

    // EXCHANGE: [{productId, quantity}] chosen by the customer, as JSON.
    @Column(columnDefinition = "TEXT")
    private String exchangeItemsJson;

    @Column(columnDefinition = "TEXT")
    private String adminNote;

    private LocalDateTime approvedAt;
    private LocalDateTime receivedAt;
    private LocalDateTime resolvedAt;
    private LocalDateTime closedAt;

    @OneToMany(mappedBy = "returnRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @ToString.Exclude
    private List<ReturnLine> lines = new ArrayList<>();
}
