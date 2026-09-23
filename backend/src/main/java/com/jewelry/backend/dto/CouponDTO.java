package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/** Admin view of a coupon; also the create/update body for AdminCouponController. */
@Data
public class CouponDTO {
    private UUID id;
    private String code;
    private String description;
    private String discountType; // PERCENTAGE or FLAT
    private BigDecimal discountValue;
    private LocalDateTime expiryDate;
    private Integer usageLimit;
    private Integer timesUsed;
    private Boolean active;
    private BigDecimal minOrderValue;
}
