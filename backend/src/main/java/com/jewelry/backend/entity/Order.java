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

    private BigDecimal total;
    private String status; // PENDING_PAYMENT, PAID, SHIPPED, etc.
    private LocalDate estimatedDelivery;
    private String trackingNumber;

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
}
