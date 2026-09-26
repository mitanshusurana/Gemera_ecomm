package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/** One order line (or part of it) inside a return request. */
@Entity
@Table(name = "return_lines")
@Data
@EqualsAndHashCode(callSuper = true)
public class ReturnLine extends BaseEntity {

    @ManyToOne
    @JoinColumn(name = "return_request_id")
    @JsonBackReference
    private ReturnRequest returnRequest;

    @ManyToOne
    @JoinColumn(name = "order_item_id")
    private OrderItem orderItem;

    private int quantity;

    // Unit price of the order line at the time of the request (snapshot).
    private BigDecimal unitPrice;

    // Set by staff at receipt: GOOD, DAMAGED, WORN, MISSING_PARTS ...
    private String condition;

    // Whether the piece actually came back; only received lines are restocked.
    private Boolean received;
}
