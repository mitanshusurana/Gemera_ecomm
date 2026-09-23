package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Last exchange request number issued per calendar year (EX-YYYY-00001).
 * Handed out under a pessimistic write lock, same scheme as InvoiceSequence.
 */
@Entity
@Table(name = "exchange_sequences")
@Getter
@Setter
public class ExchangeSequence {

    @Id
    private String year;

    private long lastNumber;
}
