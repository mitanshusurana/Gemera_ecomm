package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "reviews")
@Data
@EqualsAndHashCode(callSuper = true)
public class Review extends BaseEntity {
    private Integer rating;
    private String comment;

    @ManyToOne
    private User user;

    @ManyToOne
    private Product product;
}
