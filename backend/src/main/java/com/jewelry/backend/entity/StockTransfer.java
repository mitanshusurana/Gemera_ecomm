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
 * Movement of pieces between the warehouse (null store) and a store counter,
 * or between two stores. Numbered ST-YYYY-00001.
 *
 * DRAFT -> IN_TRANSIT (dispatch: source quantity deducted under a row lock)
 * -> RECEIVED (destination credited with the received quantities). Cancelling
 * an IN_TRANSIT transfer returns the pieces to the source.
 */
@Entity
@Table(name = "stock_transfers")
@Getter
@Setter
public class StockTransfer extends BaseEntity {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_IN_TRANSIT = "IN_TRANSIT";
    public static final String STATUS_RECEIVED = "RECEIVED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Column(unique = true, nullable = false)
    private String transferNumber;

    /** Null means the warehouse (Product.stock). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_store_id")
    private Store fromStore;

    /** Null means the warehouse (Product.stock). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_store_id")
    private Store toStore;

    @Column(nullable = false)
    private String status = STATUS_DRAFT;

    @Column(columnDefinition = "TEXT")
    private String note;

    private String createdBy;
    private String dispatchedBy;
    private String receivedBy;
    private String cancelledBy;

    private LocalDateTime dispatchedAt;
    private LocalDateTime receivedAt;
    private LocalDateTime cancelledAt;

    @OneToMany(mappedBy = "transfer", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC")
    private List<StockTransferLine> lines = new ArrayList<>();
}
