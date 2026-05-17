package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "custom_inquiries")
@Data
@EqualsAndHashCode(callSuper = true)
public class CustomInquiry extends BaseEntity {

    private String name;
    private String email;
    private String phone;

    private String concept;
    private String attachmentUrl;

    private String status = "PENDING";
}
