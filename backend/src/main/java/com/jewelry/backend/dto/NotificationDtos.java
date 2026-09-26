package com.jewelry.backend.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Request and response shapes for the notification endpoints. */
public final class NotificationDtos {

    private NotificationDtos() {
    }

    /** GET/PUT /users/me/notification-preferences. Phone is the stored profile phone (E.164 when it parses). */
    public record Preferences(Boolean notifyEmail, Boolean notifyWhatsapp, Boolean notifySms, String phone) {
    }

    /** One row of the admin log. */
    public record LogEntry(
            UUID id,
            String event,
            String channel,
            String recipient,
            String template,
            String status,
            String providerMessageId,
            String error,
            String reference,
            LocalDateTime createdAt) {
    }

    /** POST /admin/notifications/test. Either {@code phone} (WhatsApp, SMS) or {@code email}; {@code event} optional. */
    public record TestRequest(String channel, String phone, String email, String event) {
    }

    /** Outcome of a test send. */
    public record TestResponse(String channel, String status, String providerMessageId, String error) {
    }

    /** One event's templates, for the settings screen: defaults plus current overrides. */
    public record EventTemplate(
            String event,
            String emailTemplate,
            String waTemplateDefault,
            String waTemplate,
            List<String> waParams,
            String smsTextDefault,
            String smsText) {
    }
}
