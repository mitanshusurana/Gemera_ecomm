package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import java.util.UUID;

@Entity
@Table(name = "stock_notifications")
@Getter
@Setter
public class StockNotification extends BaseEntity {

    private String email;
    private UUID productId;

    private boolean notified = false;
}
