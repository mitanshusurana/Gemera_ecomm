package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "stores")
@Data
@EqualsAndHashCode(callSuper = true)
public class Store extends BaseEntity {
    private String name;
    private String address;
    private String phone;
    private String hours;
    private double lat;
    private double lng;
}
