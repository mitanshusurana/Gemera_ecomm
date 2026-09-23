package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Outbox row for pushing a store document to the ERP.
 *
 * The store must never block a payment on the ERP being reachable, so the
 * order flow only writes a row here (with the JSON snapshot it will send)
 * and ErpSyncService.flush() delivers it later. One row per (order, event
 * type): a sale is posted once, and a credit note once. Old-gold purchases
 * are keyed on the exchange request instead of an order, so the uniqueness
 * covers (order, exchange request, event type); in PostgreSQL the NULL side
 * never collides.
 */
@Entity
@Table(name = "erp_sync_events",
        uniqueConstraints = @UniqueConstraint(columnNames = {"order_id", "exchange_request_id", "event_type"}))
@Getter
@Setter
public class ErpSyncEvent extends BaseEntity {

    public static final String TYPE_SALE = "SALE";
    public static final String TYPE_CREDIT_NOTE = "CREDIT_NOTE";
    public static final String TYPE_OLD_GOLD_PURCHASE = "OLD_GOLD_PURCHASE";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_FAILED = "FAILED";

    @ManyToOne
    @JoinColumn(name = "order_id")
    private Order order;

    // Set instead of order for OLD_GOLD_PURCHASE events.
    @ManyToOne
    @JoinColumn(name = "exchange_request_id")
    private ExchangeRequest exchangeRequest;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String status = STATUS_PENDING;

    private int attempts;

    @Column(columnDefinition = "TEXT")
    private String lastError;

    // Identifier the ERP returned (invoice_id or voucher_no).
    private String erpReference;

    @Column(columnDefinition = "TEXT")
    private String payload;

    private LocalDateTime sentAt;
}
