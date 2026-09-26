package com.jewelry.backend.service.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * SMS over HTTP in two shapes, chosen by {@code sms.provider}:
 * <ul>
 *   <li>{@code msg91}: the MSG91 Flow API. POST to {@code sms.endpoint}
 *       (default {@code https://control.msg91.com/api/v5/flow/}) with header
 *       {@code authkey: <sms.api-key>} and JSON {@code {template_id, sender,
 *       mobiles, VAR1, VAR2, ...}}. VAR1 is the whole rendered text, so a DLT
 *       template registered as a single {@code {#var#}} works out of the box;
 *       VAR2.. carry the event's ordered parameters for templates with several
 *       variables.</li>
 *   <li>{@code http}: a generic gateway. POST JSON {@code {to, message, senderId}}
 *       to {@code sms.endpoint} with {@code Authorization: Bearer <sms.api-key>}.</li>
 *   <li>anything else: disabled; every send is SKIPPED at FINE.</li>
 * </ul>
 * The API key is never logged.
 */
@Component
public class HttpSmsProvider implements SmsProvider {

    private static final Logger LOGGER = Logger.getLogger(HttpSmsProvider.class.getName());
    private static final String MSG91_DEFAULT_ENDPOINT = "https://control.msg91.com/api/v5/flow/";

    public static final String PROVIDER_MSG91 = "msg91";
    public static final String PROVIDER_HTTP = "http";

    @Value("${sms.provider:disabled}")
    private String provider;

    @Value("${sms.api-key:}")
    private String apiKey;

    @Value("${sms.sender-id:}")
    private String senderId;

    @Value("${sms.endpoint:}")
    private String endpoint;

    @Value("${sms.template-id:}")
    private String templateId;

    @Autowired
    ObjectMapper objectMapper;

    private volatile RestClient restClient;

    private String mode() {
        return provider == null ? "" : provider.trim().toLowerCase(Locale.ROOT);
    }

    @Override
    public String name() {
        return isConfigured() ? mode() : "disabled";
    }

    @Override
    public boolean isConfigured() {
        String mode = mode();
        boolean keyed = apiKey != null && !apiKey.isBlank();
        if (PROVIDER_MSG91.equals(mode)) {
            return keyed && templateId != null && !templateId.isBlank();
        }
        if (PROVIDER_HTTP.equals(mode)) {
            return keyed && endpoint != null && endpoint.trim().startsWith("http");
        }
        return false;
    }

    @Override
    public ProviderResult send(String phoneE164, String text, List<String> params) {
        if (!isConfigured()) {
            LOGGER.fine("SMS provider disabled; skipping message");
            return ProviderResult.skipped("SMS provider is not configured");
        }
        String to = PhoneNumbers.digitsOnly(phoneE164);
        if (to == null || to.isBlank()) {
            return ProviderResult.skipped("No phone number");
        }
        if (text == null || text.isBlank()) {
            return ProviderResult.skipped("No SMS text for this event");
        }
        String message = text.trim();
        try {
            ResponseEntity<String> response;
            if (PROVIDER_MSG91.equals(mode())) {
                ObjectNode body = objectMapper.createObjectNode();
                body.put("template_id", templateId.trim());
                if (senderId != null && !senderId.isBlank()) {
                    body.put("sender", senderId.trim());
                }
                body.put("short_url", "0");
                body.put("mobiles", to);
                body.put("VAR1", message);
                if (params != null) {
                    int n = 2;
                    for (String p : params) {
                        body.put("VAR" + n++, p == null ? "" : p);
                    }
                }
                response = client().post()
                        .uri(msg91Endpoint())
                        .header("authkey", apiKey.trim())
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsString(body))
                        .retrieve()
                        .toEntity(String.class);
            } else {
                ObjectNode body = objectMapper.createObjectNode();
                body.put("to", phoneE164);
                body.put("message", message);
                if (senderId != null && !senderId.isBlank()) {
                    body.put("senderId", senderId.trim());
                }
                response = client().post()
                        .uri(endpoint.trim())
                        .header("Authorization", "Bearer " + apiKey.trim())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsString(body))
                        .retrieve()
                        .toEntity(String.class);
            }
            String responseBody = response.getBody();
            // MSG91 answers 200 even on rejection: {"type":"error","message":"..."}.
            if (PROVIDER_MSG91.equals(mode()) && responseBody != null) {
                try {
                    JsonNode node = objectMapper.readTree(responseBody);
                    if ("error".equalsIgnoreCase(node.path("type").asText(""))) {
                        String msg = node.path("message").asText("rejected");
                        LOGGER.warning("SMS to " + PhoneNumbers.mask(phoneE164) + " rejected by MSG91: " + msg);
                        return ProviderResult.failed("MSG91: " + msg);
                    }
                } catch (Exception ignored) {
                    // non-JSON body: treat the 2xx as success
                }
            }
            LOGGER.info("SMS sent to " + PhoneNumbers.mask(phoneE164) + " via " + mode());
            return ProviderResult.sent(extractId(responseBody));
        } catch (RestClientResponseException e) {
            String detail = e.getResponseBodyAsString();
            if (detail != null && detail.length() > 300) {
                detail = detail.substring(0, 300);
            }
            LOGGER.warning("SMS to " + PhoneNumbers.mask(phoneE164) + " failed: HTTP " + e.getStatusCode().value() + " " + detail);
            return ProviderResult.failed("HTTP " + e.getStatusCode().value() + ": " + detail);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "SMS to " + PhoneNumbers.mask(phoneE164) + " failed", e);
            return ProviderResult.failed(e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()));
        }
    }

    private String msg91Endpoint() {
        return endpoint == null || endpoint.isBlank() ? MSG91_DEFAULT_ENDPOINT : endpoint.trim();
    }

    private String extractId(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            for (String key : new String[] {"message", "id", "messageId", "request_id", "requestId"}) {
                JsonNode v = node.path(key);
                if (v.isTextual() && !v.asText().isBlank() && v.asText().length() <= 100) {
                    return v.asText();
                }
            }
        } catch (Exception ignored) {
            // not JSON
        }
        return null;
    }

    private RestClient client() {
        RestClient current = restClient;
        if (current == null) {
            synchronized (this) {
                if (restClient == null) {
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
                    factory.setConnectTimeout(Duration.ofSeconds(10));
                    factory.setReadTimeout(Duration.ofSeconds(20));
                    restClient = RestClient.builder().requestFactory(factory).build();
                }
                current = restClient;
            }
        }
        return current;
    }

    /** For the channel card; never the key. */
    public String describe() {
        if (!isConfigured()) {
            return "Set SMS_PROVIDER=msg91 (with SMS_API_KEY, SMS_SENDER_ID, SMS_TEMPLATE_ID) or SMS_PROVIDER=http (with SMS_API_KEY, SMS_ENDPOINT)";
        }
        if (PROVIDER_MSG91.equals(mode())) {
            return "MSG91 flow, sender " + (senderId == null ? "" : senderId.trim()) + ", template " + templateId.trim();
        }
        return "HTTP gateway " + endpoint.trim() + (senderId == null || senderId.isBlank() ? "" : ", sender " + senderId.trim());
    }
}
