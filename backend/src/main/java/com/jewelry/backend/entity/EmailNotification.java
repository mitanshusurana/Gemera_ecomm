package com.jewelry.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "email_notifications")
@Data
@EqualsAndHashCode(callSuper = true)
public class EmailNotification extends BaseEntity {
    private String type; // ORDER_CONFIRMATION, SHIPPING, DELIVERY, PROMOTIONAL
    private String email;
    private String subject;
    private String templateName;

    @ElementCollection
    private Map<String, String> data;

    /**
     * Ready-made HTML body. When set, EmailService sends it as-is instead of
     * rendering a stored template. Not persisted: the notification row keeps
     * type/subject/data as the audit record.
     */
    @Transient
    private String htmlContent;

    private LocalDateTime sentAt;
    private String status; // PENDING, SENT, FAILED
}
