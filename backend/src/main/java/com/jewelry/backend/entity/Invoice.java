package com.jewelry.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * GST tax invoice issued for a store order (CGST Rule 46).
 *
 * Every party detail is a snapshot: the seller's registration and the
 * buyer's address are copied at issue time because an invoice must not
 * change when global_settings or the customer's address book do. Numbers
 * come from InvoiceSequence per financial year and use the store's own
 * series prefix (default "WEB"), distinct from the ERP's "CL/" series so
 * the two systems never collide.
 *
 * Lombok @Getter/@Setter rather than @Data: Order uses @Data and a
 * bidirectional toString/hashCode would recurse.
 */
@Entity
@Table(name = "invoices")
@Getter
@Setter
public class Invoice extends BaseEntity {

    @OneToOne
    @JoinColumn(name = "order_id", unique = true)
    private Order order;

    @Column(unique = true, nullable = false)
    private String invoiceNumber;

    private LocalDate invoiceDate;

    // Indian financial year, April to March, e.g. "2026-27".
    private String financialYear;

    // ----- Seller snapshot -----
    private String sellerLegalName;
    private String sellerGstin;
    private String sellerPan;
    @Column(columnDefinition = "TEXT")
    private String sellerAddress;
    private String sellerStateCode;

    // ----- Buyer snapshot -----
    private String buyerName;
    @Column(columnDefinition = "TEXT")
    private String buyerAddress;
    private String buyerGstin;
    private String buyerPan;
    private String buyerStateCode;
    private String placeOfSupply;

    // IGST applies when the place of supply differs from the seller's state.
    private boolean interState;

    // ----- Totals (products only in taxableValue; shipping is separate) -----
    private BigDecimal taxableValue;
    private BigDecimal cgst;
    private BigDecimal sgst;
    private BigDecimal igst;
    private BigDecimal shipping;
    // Difference between what the customer was charged and the recomputed
    // sum, so grandTotal always equals the real payment.
    private BigDecimal roundOff;
    private BigDecimal grandTotal;

    @Column(columnDefinition = "TEXT")
    private String paymentSummary;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo ASC")
    private List<InvoiceLine> lines = new ArrayList<>();
}
