package com.jewelry.backend.service.notification;

/** Outcome of one provider call. Providers never throw; they return one of these. */
public record ProviderResult(String status, String messageId, String error) {

    public static ProviderResult sent(String messageId) {
        return new ProviderResult("SENT", messageId, null);
    }

    public static ProviderResult failed(String error) {
        return new ProviderResult("FAILED", null, error);
    }

    public static ProviderResult skipped(String reason) {
        return new ProviderResult("SKIPPED", null, reason);
    }

    public boolean isSent() {
        return "SENT".equals(status);
    }

    public boolean isSkipped() {
        return "SKIPPED".equals(status);
    }
}
