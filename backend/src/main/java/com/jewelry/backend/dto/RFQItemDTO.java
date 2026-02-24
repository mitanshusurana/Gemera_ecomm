package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class RFQItemDTO {
    private UUID productId;
    private int quantity;
    private String description;
    private BigDecimal targetPrice;
}
