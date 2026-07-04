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
}
