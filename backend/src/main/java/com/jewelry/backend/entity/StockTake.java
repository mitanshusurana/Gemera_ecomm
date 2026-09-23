package com.jewelry.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * A physical count at one location, numbered SC-YYYY-00001. Opening the take
 * snapshots every product with stock at the location as a line with its
 * expected quantity; scanning fills countedQuantity. Closing applies each
 * counted line's variance to the live quantity and writes an AuditLog row per
 * adjustment. Lines never counted are left alone.
 */
@Entity
@Table(name = "stock_takes")
@Getter
@Setter
public class StockTake extends BaseEntity {

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_CLOSED = "CLOSED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Column(unique = true, nullable = false)
    private String takeNumber;

    /** Null means the warehouse (Product.stock). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id")
    private Store store;

    @Column(nullable = false)
    private String status = STATUS_OPEN;

    private String startedBy;
    private String closedBy;

    @Column(columnDefinition = "TEXT")
    private String note;

    private LocalDateTime closedAt;

    @OneToMany(mappedBy = "stockTake", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC")
    private List<StockTakeLine> lines = new ArrayList<>();
}
