package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "audit_logs")
@Data
@EqualsAndHashCode(callSuper = true)
public class AuditLog extends BaseEntity {
    private String eventType;
    private String userEmail;
    private String details;
    private String ipAddress;
}
