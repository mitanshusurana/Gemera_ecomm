package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_product_views")
@Data
@EqualsAndHashCode(callSuper = true)
public class UserProductView extends BaseEntity {
    
    @ManyToOne
    private User user;

    @ManyToOne
    private Product product;

    private LocalDateTime viewedAt;
}
