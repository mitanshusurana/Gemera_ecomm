package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class TreasurePlanConfigDTO {
    private BigDecimal minAmount;
    private BigDecimal maxAmount;
    private int durationMonths;
    private int bonusMonths;
}
