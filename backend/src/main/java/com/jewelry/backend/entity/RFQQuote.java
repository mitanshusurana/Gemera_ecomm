package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "rfq_quotes")
@Data
@EqualsAndHashCode(callSuper = true)
public class RFQQuote extends BaseEntity {
    @ManyToOne
    @JoinColumn(name = "rfq_id")
    @JsonBackReference
    private RFQ rfq;

    private BigDecimal quoteAmount;
    private String currency = "USD";
    private String notes;
    private LocalDate validUntil;
    private boolean accepted;
}
