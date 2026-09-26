package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;

@Entity
@Table(name = "order_items")
@Data
@EqualsAndHashCode(callSuper = true)
public class OrderItem extends BaseEntity {
    @ManyToOne
    @JoinColumn(name = "order_id")
    @JsonBackReference
    private Order order;

    // Null for custom lines (an accepted RFQ quote for a made-to-order piece);
    // every reader must null-check and fall back to {@code description}.
    @ManyToOne
    private Product product;

    // Line text for custom lines; also a snapshot of the product name.
    private String description;

    private int quantity;
    private BigDecimal price; // Price at time of purchase
    // Product.costPrice snapshotted by OrderService.createOrder so margin
    // reports survive later cost changes; null when the cost was unknown.
    private BigDecimal unitCost;

    // Copy options from CartItem
    @Embedded
    private CartItem.CartItemOptions options;
}
