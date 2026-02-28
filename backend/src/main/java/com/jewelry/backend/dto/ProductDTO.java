package com.jewelry.backend.dto;

import lombok.Data;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.List;
import java.util.Map;

@Data
public class ProductDTO {
    private UUID id;

    @NotBlank(message = "Name is required")
    private String name;
    private String description;

    @DecimalMin(value = "0.0", inclusive = false, message = "Price must be positive")
    private BigDecimal price;
    private String category;

    @Min(value = 0, message = "Stock cannot be negative")
    private Integer stock;
    private String videoUrl;
    private List<String> images;
    private Map<String, String> specifications;
    private List<CustomizationOptionDTO> customizationOptions;
    private List<String> occasions;
    private List<String> styles;

    @Data
    public static class CustomizationOptionDTO {
        private String type;
        private String name;
        private BigDecimal priceModifier;
    }
}
