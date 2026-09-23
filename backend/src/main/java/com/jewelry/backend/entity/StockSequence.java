package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Last number issued per document series and calendar year, keyed like
 * "ST-2026" (stock transfers) or "SC-2026" (stock takes). Numbers are handed
 * out under a pessimistic write lock (StockSequenceRepository.lockByKey) in
 * the transaction that creates the document, the same way invoice numbers
 * are, so two users opening a transfer at once get distinct numbers.
 */
@Entity
@Table(name = "stock_sequences")
@Getter
@Setter
public class StockSequence {

    @Id
    private String seriesKey;

    private long lastNumber;
}
