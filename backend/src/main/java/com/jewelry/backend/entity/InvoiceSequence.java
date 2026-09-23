package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Last invoice number issued per financial year. GST requires a consecutive
 * series without gaps or duplicates, so numbers are handed out under a
 * pessimistic write lock (InvoiceSequenceRepository.lockByFinancialYear)
 * inside the transaction that creates the invoice; a rollback returns the
 * number to the pool because the row update rolls back with it.
 */
@Entity
@Table(name = "invoice_sequences")
@Getter
@Setter
public class InvoiceSequence {

    @Id
    private String financialYear;

    private long lastNumber;
}
