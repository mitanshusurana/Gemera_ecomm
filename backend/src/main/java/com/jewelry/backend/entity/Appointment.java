package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Entity
@Table(name = "appointments")
@Data
@EqualsAndHashCode(callSuper = true)
public class Appointment extends BaseEntity {

    private String name;
    private String email;
    private String phone;

    private String appointmentType;
    private String status = "PENDING";

    private LocalDateTime requestedDate;
    private String productId;

    private String notes;
}
