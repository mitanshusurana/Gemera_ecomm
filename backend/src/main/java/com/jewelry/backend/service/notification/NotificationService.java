package com.jewelry.backend.service.notification;

import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.entity.NotificationLog;
import com.jewelry.backend.repository.NotificationLogRepository;
import com.jewelry.backend.service.EmailService;
import com.jewelry.backend.service.notification.NotificationTemplateRegistry.TemplateSpec;
import com.jewelry.backend.util.PhoneNumbers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * One entry point for every customer message. {@link #notify} fans an event
 * out to e-mail (the existing {@link EmailService} and its seeded templates,
 * behaviour unchanged), WhatsApp and SMS, honouring the recipient's channel
 * preferences, and records one {@link NotificationLog} row per attempted
 * channel. It never throws: a messaging problem must not fail the order,
 * repair or exchange operation that triggered it.
 *
 * Skips are only recorded when the channel's provider is configured (so the
 * admin can see "customer opted out" or "no phone"); with a disabled provider
 * nothing is logged beyond a FINE line, otherwise every event would produce
 * two useless rows on a shop that only sends e-mail.
 */
@Service
public class NotificationService {

    private static final Logger LOGGER = Logger.getLogger(NotificationService.class.getName());

    @Autowired
    EmailService emailService;

    @Autowired
    NotificationTemplateRegistry registry;

    @Autowired
    WhatsAppProvider whatsAppProvider;

    @Autowired
    SmsProvider smsProvider;

    @Autowired
    NotificationLogRepository logRepository;

    /**
     * Sends {@code event} to {@code recipient} on every channel they accept.
     * {@code params} are the template placeholders; values may carry the
     * HTML escaping the e-mail templates need, they are turned back into plain
     * text for WhatsApp and SMS.
     */
    public List<NotificationResult> notify(NotificationEvent event, Recipient recipient, Map<String, String> params) {
        List<NotificationResult> results = new ArrayList<>(3);
        if (event == null || recipient == null) {
            return results;
        }
        Map<String, String> safeParams = params == null ? Map.of() : params;
        TemplateSpec spec;
        try {
            spec = registry.resolve(event);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Template lookup failed for " + event, e);
            spec = NotificationTemplateRegistry.defaults(event);
            if (spec == null) {
                return results;
            }
        }

        results.add(sendEmail(spec, recipient, safeParams));
        results.add(sendWhatsApp(spec, recipient, safeParams));
        results.add(sendSms(spec, recipient, safeParams));
        results.removeIf(r -> r == null);
        return results;
    }

    // ------------------------------------------------------------------
    // Channels
    // ------------------------------------------------------------------

    private NotificationResult sendEmail(TemplateSpec spec, Recipient r, Map<String, String> params) {
        if (spec.emailTemplate() == null) {
            return null;
        }
        if (!r.notifyEmail()) {
            return record(spec, NotificationChannel.EMAIL, r, spec.emailTemplate(), ProviderResult.skipped("Customer switched e-mail off"));
        }
        if (!r.hasEmail()) {
            LOGGER.fine(spec.event() + " for " + r.reference() + ": no e-mail address");
            return record(spec, NotificationChannel.EMAIL, r, spec.emailTemplate(), ProviderResult.skipped("No e-mail address"));
        }
        try {
            EmailNotification sent = emailService.sendTemplate(spec.emailType(), r.email(), spec.emailTemplate(), params);
            String status = sent == null || sent.getStatus() == null ? NotificationLog.STATUS_FAILED : sent.getStatus();
            ProviderResult pr = NotificationLog.STATUS_SENT.equals(status)
                    ? ProviderResult.sent(sent.getId() == null ? null : sent.getId().toString())
                    : ProviderResult.failed("SMTP send failed; see server log");
            return record(spec, NotificationChannel.EMAIL, r, spec.emailTemplate(), pr);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, spec.event() + " e-mail for " + r.reference() + " could not be sent", e);
            return record(spec, NotificationChannel.EMAIL, r, spec.emailTemplate(),
                    ProviderResult.failed(e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage())));
        }
    }

    private NotificationResult sendWhatsApp(TemplateSpec spec, Recipient r, Map<String, String> params) {
        if (!whatsAppProvider.isConfigured()) {
            LOGGER.fine(spec.event() + ": WhatsApp provider disabled");
            return new NotificationResult(NotificationChannel.WHATSAPP, NotificationLog.STATUS_SKIPPED, null, "WhatsApp provider is not configured");
        }
        if (spec.waTemplate() == null) {
            return null;
        }
        if (!r.notifyWhatsapp()) {
            return record(spec, NotificationChannel.WHATSAPP, r, spec.waTemplate(), ProviderResult.skipped("Customer switched WhatsApp off"));
        }
        if (!r.hasPhone()) {
            return record(spec, NotificationChannel.WHATSAPP, r, spec.waTemplate(), ProviderResult.skipped("No phone number"));
        }
        try {
            List<String> bodyParams = orderedParams(spec.waParams(), params);
            ProviderResult pr = whatsAppProvider.sendTemplate(r.phone(), spec.waTemplate(), null, bodyParams);
            return record(spec, NotificationChannel.WHATSAPP, r, spec.waTemplate(), pr);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, spec.event() + " WhatsApp for " + r.reference() + " could not be sent", e);
            return record(spec, NotificationChannel.WHATSAPP, r, spec.waTemplate(),
                    ProviderResult.failed(e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage())));
        }
    }

    private NotificationResult sendSms(TemplateSpec spec, Recipient r, Map<String, String> params) {
        if (!smsProvider.isConfigured()) {
            LOGGER.fine(spec.event() + ": SMS provider disabled");
            return new NotificationResult(NotificationChannel.SMS, NotificationLog.STATUS_SKIPPED, null, "SMS provider is not configured");
        }
        if (spec.smsText() == null) {
            return null;
        }
        if (!r.notifySms()) {
            return record(spec, NotificationChannel.SMS, r, "text", ProviderResult.skipped("Customer has not opted in to SMS"));
        }
        if (!r.hasPhone()) {
            return record(spec, NotificationChannel.SMS, r, "text", ProviderResult.skipped("No phone number"));
        }
        try {
            String text = render(spec.smsText(), params);
            ProviderResult pr = smsProvider.send(r.phone(), text, orderedParams(spec.waParams(), params));
            return record(spec, NotificationChannel.SMS, r, "text", pr);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, spec.event() + " SMS for " + r.reference() + " could not be sent", e);
            return record(spec, NotificationChannel.SMS, r, "text",
                    ProviderResult.failed(e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage())));
        }
    }

    // ------------------------------------------------------------------
    // Admin: test sends and channel status
    // ------------------------------------------------------------------

    /**
     * Sends a test message on one channel to an explicit destination. For
     * WhatsApp without an event, Meta's pre-approved {@code hello_world}
     * template (language en_US, no parameters) is used, because it exists in
     * every business account; with an event, that event's template is sent with
     * sample values.
     */
    public NotificationResult sendTest(NotificationChannel channel, String destination, NotificationEvent event) {
        if (channel == null) {
            throw new IllegalArgumentException("channel must be EMAIL, WHATSAPP or SMS");
        }
        Map<String, String> sample = sampleParams();
        String reference = "TEST";
        switch (channel) {
            case EMAIL -> {
                if (destination == null || !destination.contains("@")) {
                    throw new IllegalArgumentException("A valid e-mail address is required");
                }
                NotificationEvent ev = event == null ? NotificationEvent.ORDER_CONFIRMED : event;
                TemplateSpec spec = registry.resolve(ev);
                if (spec.emailTemplate() == null) {
                    throw new IllegalArgumentException(ev + " has no e-mail template");
                }
                Recipient r = new Recipient("Test customer", destination.trim(), null, true, false, false, reference);
                return sendEmail(spec, r, sample);
            }
            case WHATSAPP -> {
                String phone = requirePhone(destination);
                Recipient r = new Recipient("Test customer", null, phone, false, true, false, reference);
                if (!whatsAppProvider.isConfigured()) {
                    return record(NotificationTemplateRegistry.defaults(NotificationEvent.OTP), channel, r, "hello_world",
                            ProviderResult.skipped("WhatsApp provider is not configured"));
                }
                if (event == null) {
                    ProviderResult pr = whatsAppProvider.sendTemplate(phone, "hello_world", "en_US", List.of());
                    return record(NotificationTemplateRegistry.defaults(NotificationEvent.OTP), channel, r, "hello_world", pr);
                }
                TemplateSpec spec = registry.resolve(event);
                if (spec.waTemplate() == null) {
                    throw new IllegalArgumentException(event + " has no WhatsApp template");
                }
                return sendWhatsApp(spec, r, sample);
            }
            case SMS -> {
                String phone = requirePhone(destination);
                Recipient r = new Recipient("Test customer", null, phone, false, false, true, reference);
                if (!smsProvider.isConfigured()) {
                    return record(NotificationTemplateRegistry.defaults(NotificationEvent.OTP), channel, r, "text",
                            ProviderResult.skipped("SMS provider is not configured"));
                }
                if (event == null) {
                    ProviderResult pr = smsProvider.send(phone, "Caratloop test message: SMS notifications are configured correctly.", List.of());
                    return record(NotificationTemplateRegistry.defaults(NotificationEvent.OTP), channel, r, "text", pr);
                }
                TemplateSpec spec = registry.resolve(event);
                if (spec.smsText() == null) {
                    throw new IllegalArgumentException(event + " has no SMS text");
                }
                return sendSms(spec, r, sample);
            }
            default -> throw new IllegalArgumentException("Unknown channel");
        }
    }

    /** Provider state for the admin's channel cards: configured or not, and a description without secrets. */
    public Map<String, Map<String, Object>> channels() {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        Map<String, Object> email = new LinkedHashMap<>();
        email.put("configured", true);
        email.put("provider", "smtp");
        email.put("description", "SMTP via spring.mail; templates on the e-mail templates screen");
        out.put("EMAIL", email);

        Map<String, Object> wa = new LinkedHashMap<>();
        wa.put("configured", whatsAppProvider.isConfigured());
        wa.put("provider", whatsAppProvider.name());
        wa.put("description", whatsAppProvider instanceof MetaWhatsAppProvider m ? m.describe() : whatsAppProvider.name());
        out.put("WHATSAPP", wa);

        Map<String, Object> sms = new LinkedHashMap<>();
        sms.put("configured", smsProvider.isConfigured());
        sms.put("provider", smsProvider.name());
        sms.put("description", smsProvider instanceof HttpSmsProvider h ? h.describe() : smsProvider.name());
        out.put("SMS", sms);
        return out;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private NotificationResult record(TemplateSpec spec, NotificationChannel channel, Recipient r, String template, ProviderResult pr) {
        String status = pr.status();
        NotificationResult result = new NotificationResult(channel, status, pr.messageId(), pr.error());
        try {
            NotificationLog log = new NotificationLog();
            log.setEvent(spec == null || spec.event() == null ? "UNKNOWN" : spec.event().name());
            log.setChannel(channel.name());
            log.setRecipient(channel == NotificationChannel.EMAIL ? PhoneNumbers.maskEmail(r.email()) : PhoneNumbers.mask(r.phone()));
            log.setTemplate(template);
            log.setStatus(status);
            log.setProviderMessageId(pr.messageId());
            log.setError(truncate(pr.error(), 1000));
            log.setReference(truncate(r.reference(), 255));
            logRepository.save(log);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Notification log row could not be saved", e);
        }
        return result;
    }

    /** Values for the spec's parameter keys, in order, as plain text; a missing key becomes "-" (Meta rejects empty parameters). */
    static List<String> orderedParams(List<String> keys, Map<String, String> params) {
        List<String> out = new ArrayList<>();
        if (keys == null) {
            return out;
        }
        for (String key : keys) {
            String v = plainText(params.get(key));
            out.add(v.isEmpty() ? "-" : v);
        }
        return out;
    }

    /** {{key}} substitution with plain-text values; unknown keys are removed. */
    static String render(String template, Map<String, String> params) {
        if (template == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(template.length());
        int i = 0;
        while (i < template.length()) {
            int open = template.indexOf("{{", i);
            if (open < 0) {
                sb.append(template, i, template.length());
                break;
            }
            sb.append(template, i, open);
            int close = template.indexOf("}}", open + 2);
            if (close < 0) {
                sb.append(template, open, template.length());
                break;
            }
            String key = template.substring(open + 2, close).trim();
            sb.append(plainText(params.get(key)));
            i = close + 2;
        }
        return sb.toString().replaceAll("[ \\t]{2,}", " ").trim();
    }

    /** Strips tags and HTML entities from a value that was prepared for an e-mail template. */
    static String plainText(String value) {
        if (value == null) {
            return "";
        }
        String s = value;
        if (s.indexOf('<') >= 0) {
            s = s.replaceAll("<br\\s*/?>", ", ").replaceAll("</(tr|p|div|li)>", ", ").replaceAll("<[^>]+>", "");
        }
        s = s.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#x27;", "'")
                .replace("&#8377;", "Rs ")
                .replace("₹", "Rs ");
        s = s.replaceAll("(,\\s*)+$", "").replaceAll("\\s+", " ").trim();
        return s;
    }

    private static String requirePhone(String destination) {
        String phone = PhoneNumbers.toE164(destination);
        if (phone == null) {
            throw new IllegalArgumentException("A valid phone number is required (10 digits, or with country code)");
        }
        return phone;
    }

    private static Map<String, String> sampleParams() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("customerName", "Test customer");
        m.put("orderNumber", "ORD-TEST-0001");
        m.put("total", "Rs 1,00,000");
        m.put("trackingNumber", "TEST123456");
        m.put("shippingMethod", "Insured courier");
        m.put("estimatedDelivery", "in 3 days");
        m.put("reason", "This is a test.");
        m.put("jobNumber", "RJ-TEST-0001");
        m.put("itemDescription", "gold ring");
        m.put("estimateAmount", "Rs 2,500");
        m.put("amountDue", "Rs 2,500");
        m.put("trackingUrl", "https://www.caratloop.com/repairs/track/RJ-TEST-0001");
        m.put("requestNumber", "EX-TEST-0001");
        m.put("metal", "Gold");
        m.put("amount", "Rs 45,000");
        m.put("code", "TEST-CODE");
        m.put("appointmentType", "Consultation");
        m.put("requestedDate", "tomorrow at 11:00");
        m.put("storeName", "Caratloop MI Road");
        m.put("consultantLine", "");
        m.put("notes", "No notes.");
        m.put("rmaNumber", "RMA-TEST-00001");
        m.put("refundAmount", "Rs 12,500");
        m.put("resolution", "Refund");
        m.put("resolutionText", "Refund");
        m.put("detailText", "Refunded to the original payment method; allow 5-7 working days.");
        m.put("feeText", "");
        m.put("dueDate", "in 3 days");
        m.put("balance", "Rs 60,000");
        m.put("productName", "Solitaire ring");
        m.put("price", "Rs 85,000");
        m.put("productUrl", "https://www.caratloop.com/products");
        m.put("storefrontUrl", "https://www.caratloop.com");
        m.put("itemsHtml", "");
        m.put("paymentMethod", "Test");
        m.put("shippingAddress", "Test address");
        return m;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
