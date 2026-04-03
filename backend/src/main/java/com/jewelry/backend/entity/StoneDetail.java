package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;

@Entity
@Table(name = "stone_details")
@Data
@EqualsAndHashCode(callSuper = true)
public class StoneDetail extends BaseEntity {
    private String stoneType; // e.g., Natural Emerald, Diamond, Ruby
    private String shape;
    private Integer pieceCount;
    private BigDecimal totalCaratWeight;
    private String settingType;
}
