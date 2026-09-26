package com.jewelry.backend.service.notification;

/** One channel's outcome for a {@link NotificationService#notify} call, also what the log row records. */
public record NotificationResult(NotificationChannel channel, String status, String providerMessageId, String error) {

    public boolean isSent() {
        return "SENT".equals(status);
    }
}
