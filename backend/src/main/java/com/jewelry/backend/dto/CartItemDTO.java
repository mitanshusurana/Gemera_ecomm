package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.Map;

@Data
public class CartItemDTO {
    private UUID id;
    private ProductDTO product;
    private Integer quantity;
    private Map<String, Object> options;
    private BigDecimal price;
}
