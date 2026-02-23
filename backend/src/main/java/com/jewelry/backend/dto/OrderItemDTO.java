package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.Map;

@Data
public class OrderItemDTO {
    private UUID id;
    private ProductDTO product;
    private int quantity;
    private BigDecimal price;
    private Map<String, Object> options;
}
