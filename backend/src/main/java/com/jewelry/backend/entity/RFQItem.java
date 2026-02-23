package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "rfq_items")
@Data
@EqualsAndHashCode(callSuper = true)
public class RFQItem extends BaseEntity {
    @ManyToOne
    @JoinColumn(name = "rfq_id")
    @JsonBackReference
    private RFQ rfq;

    private UUID productId;
    private int quantity;
    private BigDecimal targetPrice;
    private String description;
}
