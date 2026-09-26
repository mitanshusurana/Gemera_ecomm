package com.jewelry.backend.service.notification;

import java.util.List;

/**
 * Sends one SMS. Implementations never throw: a misconfigured or unreachable
 * provider is a FAILED or SKIPPED result.
 */
public interface SmsProvider {

    /** "msg91", "http", "disabled", ... for the admin's channel card. */
    String name();

    boolean isConfigured();

    /**
     * @param phoneE164 recipient in E.164
     * @param text      the rendered message
     * @param params    the event's parameter values in order, for DLT templates with several variables (VAR2..); may be empty
     */
    ProviderResult send(String phoneE164, String text, List<String> params);
}
