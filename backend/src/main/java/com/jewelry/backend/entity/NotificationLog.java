package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * One delivery attempt on one channel (e-mail, WhatsApp, SMS) for one
 * customer-facing event. The recipient is stored masked ("+91******3210",
 * "m***@example.com"): this table is for the admin's "did the customer get
 * the message" question, not a contact list. Written by NotificationService.
 */
@Entity
@Table(name = "notification_logs", indexes = {
        @Index(name = "idx_notification_logs_created", columnList = "createdAt"),
        @Index(name = "idx_notification_logs_reference", columnList = "reference")
})
@Data
@EqualsAndHashCode(callSuper = true)
public class NotificationLog extends BaseEntity {

    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_SKIPPED = "SKIPPED";

    /** NotificationEvent name, e.g. ORDER_SHIPPED. */
    private String event;

    /** EMAIL | WHATSAPP | SMS. */
    private String channel;

    /** Masked address or phone. */
    private String recipient;

    /** E-mail template name, WhatsApp template name, or "text" for SMS. */
    private String template;

    /** SENT | FAILED | SKIPPED. */
    private String status;

    /** Id returned by the provider (Meta wamid, MSG91 request id). */
    private String providerMessageId;

    /** Provider or validation error, truncated; never contains tokens. */
    @Column(length = 1000)
    private String error;

    /** Business key the message belongs to: order number, job number, request number, account id. */
    private String reference;
}
