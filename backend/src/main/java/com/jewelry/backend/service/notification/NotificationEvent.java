package com.jewelry.backend.service.notification;

/**
 * Customer-facing events that produce a message. Each maps, in
 * {@link NotificationTemplateRegistry}, to an e-mail template (the existing
 * seeded names), a WhatsApp template name and an SMS text; any of the three
 * may be absent for an event, in which case that channel is skipped.
 */
public enum NotificationEvent {
    ORDER_CONFIRMED,
    /** E-mail only by default: the customer already had a confirmation and gets a shipping message next. */
    ORDER_PROCESSING,
    ORDER_SHIPPED,
    ORDER_DELIVERED,
    ORDER_CANCELLED,
    ORDER_REFUNDED,
    REPAIR_RECEIVED,
    REPAIR_ESTIMATE,
    REPAIR_READY,
    REPAIR_DELIVERED,
    EXCHANGE_RECEIVED,
    EXCHANGE_CREDITED,
    EXCHANGE_REJECTED,
    /** Booking taken; a member of staff still has to confirm the slot. */
    APPOINTMENT_RECEIVED,
    APPOINTMENT_CONFIRMED,
    APPOINTMENT_REMINDER,
    APPOINTMENT_CANCELLED,
    RETURN_APPROVED,
    RETURN_REJECTED,
    /** Refund issued, store credit issued or replacement order created for a return. */
    RETURN_REFUNDED,
    TREASURE_INSTALLMENT_DUE,
    TREASURE_MATURED,
    BACK_IN_STOCK,
    /** Reserved for a future phone login; no template is wired yet. */
    OTP;

    public static NotificationEvent parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
