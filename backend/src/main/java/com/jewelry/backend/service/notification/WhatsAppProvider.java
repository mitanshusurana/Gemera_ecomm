package com.jewelry.backend.service.notification;

import java.util.List;

/**
 * Sends one approved WhatsApp template message. Implementations never throw:
 * a misconfigured or unreachable provider is a FAILED or SKIPPED result.
 */
public interface WhatsAppProvider {

    /** "meta", "disabled", ... for the admin's channel card. */
    String name();

    /** True when credentials are present and messages will actually be attempted. */
    boolean isConfigured();

    /**
     * @param phoneE164    recipient in E.164 ("+919876543210")
     * @param templateName approved template name in the business account
     * @param language     BCP-47 template language ("en", "en_US", "hi")
     * @param bodyParams   body {{1}}, {{2}}, ... in order; may be empty
     */
    ProviderResult sendTemplate(String phoneE164, String templateName, String language, List<String> bodyParams);
}
