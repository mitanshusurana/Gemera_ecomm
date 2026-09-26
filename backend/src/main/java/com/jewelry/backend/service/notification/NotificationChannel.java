package com.jewelry.backend.service.notification;

/** Delivery channels. E-mail is the existing EmailService; the other two are provider-backed. */
public enum NotificationChannel {
    EMAIL,
    WHATSAPP,
    SMS;

    /** Case-insensitive parse; null for unknown or blank input. */
    public static NotificationChannel parse(String value) {
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
