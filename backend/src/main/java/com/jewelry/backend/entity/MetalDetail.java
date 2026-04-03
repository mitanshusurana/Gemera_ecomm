package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;

@Entity
@Table(name = "metal_details")
@Data
@EqualsAndHashCode(callSuper = true)
public class MetalDetail extends BaseEntity {
    private String metalType; // e.g., Gold, Silver, Platinum
    private String metalPurity; // e.g., 18K, 14K, 925
    private BigDecimal netWeight;
}
