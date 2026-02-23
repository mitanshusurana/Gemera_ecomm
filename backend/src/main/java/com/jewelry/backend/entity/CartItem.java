package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "cart_items")
@Data
@EqualsAndHashCode(callSuper = true)
public class CartItem extends BaseEntity {
    @ManyToOne
    @JoinColumn(name = "cart_id")
    @JsonBackReference
    private Cart cart;

    @ManyToOne
    @JoinColumn(name = "product_id")
    private Product product;

    private int quantity;

    @Embeddable
    @Data
    public static class CartItemOptions {
        private String metal;
        private String diamond;
        private String stoneId;
        private String stoneName;
        private String customization;
    }

    private CartItemOptions options;
}
