package com.jewelry.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "wishlists")
@Data
@EqualsAndHashCode(callSuper = true)
public class Wishlist extends BaseEntity {
    @OneToOne
    private User user;

    @ManyToMany
    @JoinTable(
        name = "wishlist_items",
        joinColumns = @JoinColumn(name = "wishlist_id"),
        inverseJoinColumns = @JoinColumn(name = "product_id")
    )
    private List<Product> products = new ArrayList<>();
}
