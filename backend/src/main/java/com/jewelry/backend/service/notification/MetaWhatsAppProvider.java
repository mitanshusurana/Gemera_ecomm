package com.jewelry.backend.service.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jewelry.backend.util.PhoneNumbers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * WhatsApp Cloud API (Meta Graph). One request per message:
 * {@code POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages} with
 * a bearer token and a template payload whose body parameters are sent in
 * order. Configured by {@code whatsapp.provider=meta}, {@code whatsapp.phone-number-id}
 * and {@code whatsapp.access-token}; anything else means disabled and every
 * send is SKIPPED at FINE. The token is never logged.
 */
@Component
public class MetaWhatsAppProvider implements WhatsAppProvider {

    private static final Logger LOGGER = Logger.getLogger(MetaWhatsAppProvider.class.getName());
    private static final String GRAPH_BASE = "https://graph.facebook.com/v20.0";

    @Value("${whatsapp.provider:disabled}")
    private String provider;

    @Value("${whatsapp.phone-number-id:}")
    private String phoneNumberId;

    @Value("${whatsapp.access-token:}")
    private String accessToken;

    @Value("${whatsapp.default-language:en}")
    private String defaultLanguage;

    @Autowired
    ObjectMapper objectMapper;

    private volatile RestClient restClient;

    @Override
    public String name() {
        return isConfigured() ? "meta" : "disabled";
    }

    @Override
    public boolean isConfigured() {
        return "meta".equalsIgnoreCase(provider == null ? "" : provider.trim())
                && phoneNumberId != null && !phoneNumberId.isBlank()
                && accessToken != null && !accessToken.isBlank();
    }

    /** Default template language when the caller passes none. */
    public String defaultLanguage() {
        return defaultLanguage == null || defaultLanguage.isBlank() ? "en" : defaultLanguage.trim();
    }

    @Override
    public ProviderResult sendTemplate(String phoneE164, String templateName, String language, List<String> bodyParams) {
        if (!isConfigured()) {
            LOGGER.fine("WhatsApp provider disabled; skipping template " + templateName);
            return ProviderResult.skipped("WhatsApp provider is not configured");
        }
        String to = PhoneNumbers.digitsOnly(phoneE164);
        if (to == null || to.isBlank()) {
            return ProviderResult.skipped("No phone number");
        }
        if (templateName == null || templateName.isBlank()) {
            return ProviderResult.skipped("No WhatsApp template for this event");
        }
        try {
            ObjectNode root = objectMapper.createObjectNode();
            root.put("messaging_product", "whatsapp");
            root.put("recipient_type", "individual");
            root.put("to", to);
            root.put("type", "template");
            ObjectNode template = root.putObject("template");
            template.put("name", templateName.trim());
            template.putObject("language").put("code", language == null || language.isBlank() ? defaultLanguage() : language.trim());
            if (bodyParams != null && !bodyParams.isEmpty()) {
                ArrayNode components = template.putArray("components");
                ObjectNode body = components.addObject();
                body.put("type", "body");
                ArrayNode parameters = body.putArray("parameters");
                for (String p : bodyParams) {
                    ObjectNode param = parameters.addObject();
                    param.put("type", "text");
                    // Meta rejects newlines, tabs and more than four consecutive spaces in parameters.
                    param.put("text", clean(p));
                }
            }

            ResponseEntity<String> response = client().post()
                    .uri("/" + phoneNumberId.trim() + "/messages")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(root))
                    .retrieve()
                    .toEntity(String.class);

            String messageId = null;
            if (response.getBody() != null && !response.getBody().isBlank()) {
                JsonNode node = objectMapper.readTree(response.getBody());
                JsonNode messages = node.path("messages");
                if (messages.isArray() && messages.size() > 0) {
                    messageId = messages.get(0).path("id").asText(null);
                }
            }
            LOGGER.info("WhatsApp template " + templateName + " sent to " + PhoneNumbers.mask(phoneE164));
            return ProviderResult.sent(messageId);
        } catch (RestClientResponseException e) {
            String detail = errorMessage(e.getResponseBodyAsString());
            LOGGER.warning("WhatsApp template " + templateName + " to " + PhoneNumbers.mask(phoneE164)
                    + " failed: HTTP " + e.getStatusCode().value() + " " + detail);
            return ProviderResult.failed("HTTP " + e.getStatusCode().value() + ": " + detail);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "WhatsApp template " + templateName + " to " + PhoneNumbers.mask(phoneE164) + " failed", e);
            return ProviderResult.failed(e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()));
        }
    }

    private String errorMessage(String body) {
        if (body == null || body.isBlank()) {
            return "no response body";
        }
        try {
            JsonNode error = objectMapper.readTree(body).path("error");
            if (!error.isMissingNode()) {
                String message = error.path("message").asText("");
                String details = error.path("error_data").path("details").asText("");
                int code = error.path("code").asInt(0);
                return (code > 0 ? "(" + code + ") " : "") + message + (details.isEmpty() ? "" : " - " + details);
            }
        } catch (Exception ignored) {
            // fall through to the raw body
        }
        return body.length() > 300 ? body.substring(0, 300) : body;
    }

    static String clean(String value) {
        if (value == null) {
            return "";
        }
        String s = value.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ');
        while (s.contains("     ")) {
            s = s.replace("     ", "    ");
        }
        s = s.trim();
        return s.isEmpty() ? "-" : (s.length() > 1000 ? s.substring(0, 1000) : s);
    }

    private RestClient client() {
        RestClient current = restClient;
        if (current == null) {
            synchronized (this) {
                if (restClient == null) {
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
                    factory.setConnectTimeout(Duration.ofSeconds(10));
                    factory.setReadTimeout(Duration.ofSeconds(20));
                    restClient = RestClient.builder()
                            .baseUrl(GRAPH_BASE)
                            .requestFactory(factory)
                            .defaultHeader("Authorization", "Bearer " + accessToken.trim())
                            .build();
                }
                current = restClient;
            }
        }
        return current;
    }

    /** For the channel card: which language templates default to; never the token. */
    public String describe() {
        return isConfigured()
                ? "Meta Cloud API, phone number id ending " + tail(phoneNumberId) + ", language " + defaultLanguage()
                : "Set WHATSAPP_PROVIDER=meta, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN";
    }

    private static String tail(String s) {
        if (s == null) return "";
        String t = s.trim();
        return t.length() <= 4 ? t : "..." + t.substring(t.length() - 4).toLowerCase(Locale.ROOT);
    }
}
