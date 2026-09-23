package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Last repair job number issued per calendar year (RJ-YYYY-00001). Handed
 * out under a pessimistic write lock, the same way InvoiceSequence works,
 * so two requests made at the same moment get distinct numbers.
 */
@Entity
@Table(name = "repair_sequences")
@Getter
@Setter
public class RepairSequence {

    @Id
    @Column(name = "job_year")
    private String year;

    private long lastNumber;
}
