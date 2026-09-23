package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * One row of a tax invoice. Stored rather than derived from OrderItem so the
 * printed document never changes when a product is renamed or its HSN code
 * or tax rate is corrected later.
 */
@Entity
@Table(name = "invoice_lines")
@Getter
@Setter
public class InvoiceLine extends BaseEntity {

    @ManyToOne
    @JoinColumn(name = "invoice_id")
    private Invoice invoice;

    private int lineNo;

    @Column(columnDefinition = "TEXT")
    private String description;
    private String sku;
    // ERP item-master code at the time of invoicing; lets the sale relieve ERP stock.
    private String erpMaterialCode;
    private String hsnCode;
    private int quantity;
    private BigDecimal unitPrice;
    private BigDecimal discount;
    private BigDecimal taxableValue;
    // Percentage (3.00 = 3%), the convention used on the printed invoice and
    // in the ERP payload; CartService's settings are fractions (0.03).
    private BigDecimal gstRate;
    private BigDecimal cgst;
    private BigDecimal sgst;
    private BigDecimal igst;
    private BigDecimal lineTotal;
}
