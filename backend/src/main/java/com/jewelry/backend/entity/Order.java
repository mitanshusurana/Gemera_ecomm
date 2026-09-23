package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
@Data
@EqualsAndHashCode(callSuper = true)
public class Order extends BaseEntity {
    @ManyToOne
    private User user;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    @JsonManagedReference
    private List<OrderItem> items = new ArrayList<>();

    @Column(unique = true)
    private String orderNumber;

    private BigDecimal total;
    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal shipping;
    private BigDecimal discount;
    private String appliedCoupon;

    // Gift card redeemed against this order (code) and the amount debited from it.
    private String appliedGiftCard;
    private BigDecimal giftCardAmount;

    private String status; // PENDING_PAYMENT, PAID, SHIPPED, etc.
    private LocalDate estimatedDelivery;
    private String trackingNumber;
    private String internalNotes;

    // Address fields stored as JSON string or simplified
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    private String paymentMethod;
    private String shippingMethod;

    // Payment details reference
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private String razorpaySignature;

    @Column(unique = true)
    private String idempotencyKey;

    // Buyer tax identifiers for the GST invoice. PAN is mandatory at or above
    // Rs. 2,00,000 (Income-tax Rule 114B); GSTIN lets a business buyer claim
    // input credit. Both stored uppercased and format-checked by OrderService.
    private String buyerGstin;
    private String buyerPan;

    // Refund bookkeeping: the gateway refund id and the amount actually
    // returned, so a REFUNDED transition is never sent to Razorpay twice.
    private String razorpayRefundId;
    private BigDecimal refundedAmount;

    // Stock is returned once per order (RETURNED, REFUNDED or CANCELLED can
    // each restock; only the first one should). Null on rows that pre-date
    // the column means "not yet".
    @Column(columnDefinition = "boolean default false")
    private Boolean restocked;
}
