package com.jewelry.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "email_subscriptions")
@Data
@EqualsAndHashCode(callSuper = true)
public class EmailSubscription extends BaseEntity {
    @Column(unique = true)
    private String email;
    private boolean active = true;
}
