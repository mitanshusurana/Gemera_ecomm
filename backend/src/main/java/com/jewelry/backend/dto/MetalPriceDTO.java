package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class MetalPriceDTO {
    private String metal;
    private BigDecimal priceUsd;
    private BigDecimal changePercentage;
    private String lastUpdated;
}
