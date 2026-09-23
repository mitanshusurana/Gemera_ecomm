package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * One product on a StockTake. expectedQuantity is the snapshot at open (0 for
 * a product scanned that was not in the snapshot); countedQuantity is null
 * until the first scan or manual count; variance = counted - expected.
 */
@Entity
@Table(name = "stock_take_lines", indexes = @Index(name = "ix_stock_take_line_take", columnList = "stock_take_id"))
@Getter
@Setter
public class StockTakeLine extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "stock_take_id", nullable = false)
    private StockTake stockTake;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    private Integer expectedQuantity = 0;

    private Integer countedQuantity;

    /** countedQuantity - expectedQuantity, null while uncounted. */
    private Integer variance;

    @Column(columnDefinition = "TEXT")
    private String note;

    private LocalDateTime lastCountedAt;
}
