package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "coupons")
@Data
@EqualsAndHashCode(callSuper = true)
public class Coupon extends BaseEntity {
    private String code;
    private String discountType; // "PERCENTAGE" or "FLAT"
    private BigDecimal discountValue;
    private LocalDateTime expiryDate;
    private Integer usageLimit;
    private Integer timesUsed = 0;
    private Boolean active = true;

    // Admin-facing note ("Launch week, 10% off"); never shown to customers.
    private String description;

    // Cart subtotal the coupon needs before it applies. Null means no floor.
    // CartService drops a coupon whose floor the cart no longer meets, the
    // same way it drops an expired one.
    private BigDecimal minOrderValue;
}
