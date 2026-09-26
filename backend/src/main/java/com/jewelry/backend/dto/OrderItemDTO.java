package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.Map;

@Data
public class OrderItemDTO {
    private UUID id;
    /** Null for a custom line (accepted quote for a made-to-order piece); read {@code description} then. */
    private ProductDTO product;
    private String description;
    private int quantity;
    private BigDecimal price;
    private Map<String, Object> options;
}
