package com.jewelry.backend.entity;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "products")
@Data
@EqualsAndHashCode(callSuper = true)
public class Product extends BaseEntity {
    private String name;
    private String description;
    private BigDecimal price;
    private String category;
    private Integer stock;

    @ElementCollection
    private List<String> images;

    @ElementCollection
    private Map<String, String> specifications;

    @ElementCollection
    private List<CustomizationOption> customizationOptions;

    @ElementCollection
    private List<String> occasions;

    @ElementCollection
    private List<String> styles;

    @Embeddable
    @Data
    public static class CustomizationOption {
        private String type; // e.g. "METAL", "SIZE"
        private String name; // e.g. "Gold", "6"
        private BigDecimal priceModifier;
    }
}
