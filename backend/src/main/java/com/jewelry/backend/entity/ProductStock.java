package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/**
 * Pieces of one product physically at one store counter.
 *
 * Product.stock stays the single sellable (online / warehouse) quantity that
 * orders decrement and cancellations restore; these rows only track what sits
 * in the shops. Stock moves between the two through StockTransfer and is
 * corrected by StockTake.
 */
@Entity
@Table(name = "product_stocks",
        uniqueConstraints = @UniqueConstraint(name = "uk_product_stock_product_store", columnNames = {"product_id", "store_id"}),
        indexes = @Index(name = "ix_product_stock_store", columnList = "store_id"))
@Getter
@Setter
public class ProductStock extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    private Integer quantity = 0;
}
