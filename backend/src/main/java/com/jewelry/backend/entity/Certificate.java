package com.jewelry.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "certificates")
@Data
@EqualsAndHashCode(callSuper = true)
public class Certificate extends BaseEntity {
    @Column(unique = true)
    private String reportNumber;
    private String lab;
    private String dateIssued;
    private String productName;
    private Double carat;
    private String color;
    private String clarity;
    private String cut;
    private String shape;
    private String imageUrl;
}
