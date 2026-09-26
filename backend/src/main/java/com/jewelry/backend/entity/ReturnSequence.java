package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Last RMA number issued per calendar year (RMA-YYYY-00001), handed out under
 * a pessimistic write lock like ExchangeSequence.
 */
@Entity
@Table(name = "return_sequences")
@Getter
@Setter
public class ReturnSequence {

    @Id
    private String year;

    private long lastNumber;
}
