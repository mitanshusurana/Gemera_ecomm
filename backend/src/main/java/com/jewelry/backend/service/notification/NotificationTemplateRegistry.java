package com.jewelry.backend.service.notification;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.repository.GlobalSettingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Which template each {@link NotificationEvent} uses on each channel.
 *
 * Defaults live here. The WhatsApp template name and the SMS text can be
 * overridden per event from {@code global_settings}:
 * <ul>
 *   <li>{@code wa.template.<EVENT>}: the approved template name in the Meta
 *       business account, optionally followed by {@code |key1,key2,...} to
 *       change which parameters are sent, in order (defaults to the event's
 *       parameter list). The value {@code off} disables WhatsApp for the event.</li>
 *   <li>{@code sms.template.<EVENT>}: the SMS text with {@code {{key}}}
 *       placeholders. {@code off} disables SMS for the event.</li>
 * </ul>
 * E-mail keeps the seeded template names; the admin edits their copy on the
 * e-mail templates screen as before.
 */
@Component
public class NotificationTemplateRegistry {

    public static final String WA_KEY_PREFIX = "wa.template.";
    public static final String SMS_KEY_PREFIX = "sms.template.";
    public static final String OFF = "off";

    /**
     * Resolved spec for one event.
     *
     * @param emailType     legacy {@code EmailNotification.type} value, kept so the e-mail audit rows look as before
     * @param emailTemplate seeded e-mail template name, null when the event has no e-mail
     * @param waTemplate    WhatsApp template name, null when the event has no WhatsApp message
     * @param waParams      parameter keys, in body-parameter order
     * @param smsText       SMS text with {{key}} placeholders, null when the event has no SMS
     */
    public record TemplateSpec(
            NotificationEvent event,
            String emailType,
            String emailTemplate,
            String waTemplate,
            List<String> waParams,
            String smsText) {
    }

    private static final Map<NotificationEvent, TemplateSpec> DEFAULTS = new EnumMap<>(NotificationEvent.class);

    private static void def(NotificationEvent event, String emailType, String emailTemplate,
                            String waTemplate, List<String> waParams, String smsText) {
        DEFAULTS.put(event, new TemplateSpec(event, emailType, emailTemplate, waTemplate, waParams, smsText));
    }

    static {
        def(NotificationEvent.ORDER_CONFIRMED, "ORDER_CONFIRMATION", EmailTemplateSeeder.ORDER_CONFIRMATION,
                "caratloop_order_confirmed", List.of("customerName", "orderNumber", "total"),
                "Dear {{customerName}}, your Caratloop order {{orderNumber}} for {{total}} is confirmed. Track it at {{storefrontUrl}}/account/orders");
        def(NotificationEvent.ORDER_PROCESSING, "ORDER_PROCESSING", EmailTemplateSeeder.ORDER_PROCESSING,
                null, List.of(), null);
        def(NotificationEvent.ORDER_SHIPPED, "SHIPPING", EmailTemplateSeeder.ORDER_SHIPPED,
                "caratloop_order_shipped", List.of("customerName", "orderNumber", "trackingNumber", "estimatedDelivery"),
                "Dear {{customerName}}, Caratloop order {{orderNumber}} has shipped. Tracking: {{trackingNumber}}. Expected {{estimatedDelivery}}. A signature and photo ID are needed on delivery.");
        def(NotificationEvent.ORDER_DELIVERED, "DELIVERY", EmailTemplateSeeder.ORDER_DELIVERED,
                "caratloop_order_delivered", List.of("customerName", "orderNumber"),
                "Dear {{customerName}}, Caratloop order {{orderNumber}} has been delivered. We hope it brings you joy. Questions? Reply within 7 days.");
        def(NotificationEvent.ORDER_CANCELLED, "ORDER_CANCELLED", EmailTemplateSeeder.ORDER_CANCELLED,
                "caratloop_order_cancelled", List.of("customerName", "orderNumber", "reason"),
                "Dear {{customerName}}, Caratloop order {{orderNumber}} was cancelled: {{reason}} Any amount paid is refunded within 5-7 working days.");
        def(NotificationEvent.ORDER_REFUNDED, "ORDER_REFUNDED", EmailTemplateSeeder.ORDER_REFUNDED,
                "caratloop_order_refunded", List.of("customerName", "orderNumber", "total"),
                "Dear {{customerName}}, a refund of {{total}} has been issued for Caratloop order {{orderNumber}}. Allow 5-7 working days for it to appear.");

        def(NotificationEvent.REPAIR_RECEIVED, "REPAIR_RECEIVED", EmailTemplateSeeder.REPAIR_RECEIVED,
                "caratloop_repair_received", List.of("customerName", "jobNumber", "itemDescription", "trackingUrl"),
                "Dear {{customerName}}, Caratloop has logged repair job {{jobNumber}} for your {{itemDescription}}. Track it at {{trackingUrl}}");
        def(NotificationEvent.REPAIR_ESTIMATE, "REPAIR_ESTIMATE", EmailTemplateSeeder.REPAIR_ESTIMATE,
                "caratloop_repair_estimate", List.of("customerName", "jobNumber", "estimateAmount", "trackingUrl"),
                "Dear {{customerName}}, the estimate for Caratloop repair job {{jobNumber}} is {{estimateAmount}}. Approve it at {{trackingUrl}}");
        def(NotificationEvent.REPAIR_READY, "REPAIR_READY", EmailTemplateSeeder.REPAIR_READY,
                "caratloop_repair_ready", List.of("customerName", "jobNumber", "itemDescription", "amountDue"),
                "Dear {{customerName}}, your {{itemDescription}} (Caratloop job {{jobNumber}}) is ready for collection. Amount due: {{amountDue}}.");
        def(NotificationEvent.REPAIR_DELIVERED, "REPAIR_DELIVERED", EmailTemplateSeeder.REPAIR_DELIVERED,
                "caratloop_repair_delivered", List.of("customerName", "jobNumber"),
                "Dear {{customerName}}, Caratloop repair job {{jobNumber}} has been handed over. Thank you for trusting us with your piece.");

        def(NotificationEvent.EXCHANGE_RECEIVED, "EXCHANGE_RECEIVED", EmailTemplateSeeder.EXCHANGE_RECEIVED,
                "caratloop_exchange_received", List.of("customerName", "requestNumber", "metal"),
                "Dear {{customerName}}, your old {{metal}} for Caratloop exchange request {{requestNumber}} has reached us. The assay result and store credit follow shortly.");
        def(NotificationEvent.EXCHANGE_CREDITED, "EXCHANGE_CREDITED", EmailTemplateSeeder.EXCHANGE_CREDITED,
                "caratloop_exchange_credited", List.of("customerName", "requestNumber", "amount", "code"),
                "Dear {{customerName}}, Caratloop store credit of {{amount}} for exchange request {{requestNumber}} is ready. Your code: {{code}}. Use it in the gift card field at checkout.");
        def(NotificationEvent.EXCHANGE_REJECTED, "EXCHANGE_REJECTED", EmailTemplateSeeder.EXCHANGE_REJECTED,
                "caratloop_exchange_rejected", List.of("customerName", "requestNumber", "reason"),
                "Dear {{customerName}}, we could not accept the item under Caratloop exchange request {{requestNumber}}: {{reason}}");

        def(NotificationEvent.APPOINTMENT_RECEIVED, "APPOINTMENT_RECEIVED", EmailTemplateSeeder.APPOINTMENT_RECEIVED,
                "caratloop_appointment_received", List.of("customerName", "appointmentType", "requestedDate", "storeName"),
                "Dear {{customerName}}, we have your Caratloop appointment request ({{appointmentType}}) for {{requestedDate}} at {{storeName}}. We will confirm it shortly.");
        def(NotificationEvent.APPOINTMENT_CONFIRMED, "APPOINTMENT_CONFIRMED", EmailTemplateSeeder.APPOINTMENT_CONFIRMED,
                "caratloop_appointment_confirmed", List.of("customerName", "appointmentType", "requestedDate"),
                "Dear {{customerName}}, your Caratloop appointment ({{appointmentType}}) is confirmed for {{requestedDate}} at {{storeName}}. Reply to reschedule.");
        def(NotificationEvent.APPOINTMENT_REMINDER, "APPOINTMENT_REMINDER", EmailTemplateSeeder.APPOINTMENT_REMINDER,
                "caratloop_appointment_reminder", List.of("customerName", "appointmentType", "requestedDate"),
                "Reminder: dear {{customerName}}, your Caratloop appointment ({{appointmentType}}) is tomorrow, {{requestedDate}}. We look forward to seeing you.");
        def(NotificationEvent.APPOINTMENT_CANCELLED, "APPOINTMENT_CANCELLED", EmailTemplateSeeder.APPOINTMENT_CANCELLED,
                "caratloop_appointment_cancelled", List.of("customerName", "appointmentType", "requestedDate", "reason"),
                "Dear {{customerName}}, your Caratloop appointment ({{appointmentType}}) on {{requestedDate}} has been cancelled. {{reason}} Book again at {{storefrontUrl}}/appointments");

        def(NotificationEvent.RETURN_APPROVED, "RETURN_APPROVED", EmailTemplateSeeder.RETURN_APPROVED,
                "caratloop_return_approved", List.of("customerName", "rmaNumber", "orderNumber", "refundAmount"),
                "Dear {{customerName}}, return {{rmaNumber}} for Caratloop order {{orderNumber}} is approved. Send the piece back insured quoting the RMA number; {{refundAmount}} follows once it is received.");
        def(NotificationEvent.RETURN_REJECTED, "RETURN_REJECTED", EmailTemplateSeeder.RETURN_REJECTED,
                "caratloop_return_rejected", List.of("customerName", "rmaNumber", "orderNumber", "reason"),
                "Dear {{customerName}}, we could not accept return {{rmaNumber}} for Caratloop order {{orderNumber}}: {{reason}}");
        def(NotificationEvent.RETURN_REFUNDED, "RETURN_REFUNDED", EmailTemplateSeeder.RETURN_REFUNDED,
                "caratloop_return_refunded", List.of("customerName", "rmaNumber", "orderNumber", "refundAmount", "resolution"),
                "Dear {{customerName}}, return {{rmaNumber}} for Caratloop order {{orderNumber}} is complete: {{resolution}} of {{refundAmount}}. Allow 5-7 working days for a bank refund.");

        def(NotificationEvent.TREASURE_INSTALLMENT_DUE, "TREASURE_INSTALLMENT_DUE", EmailTemplateSeeder.TREASURE_INSTALLMENT_DUE,
                "caratloop_treasure_due", List.of("customerName", "amount", "dueDate"),
                "Dear {{customerName}}, your Caratloop Treasure Chest installment of {{amount}} is due on {{dueDate}}. Pay at {{storefrontUrl}}/treasure");
        def(NotificationEvent.TREASURE_MATURED, "TREASURE_MATURED", EmailTemplateSeeder.TREASURE_MATURED,
                "caratloop_treasure_matured", List.of("customerName", "balance"),
                "Congratulations {{customerName}}, your Caratloop Treasure Chest plan has matured. Balance available: {{balance}}. Visit a store or {{storefrontUrl}}/products to redeem.");

        def(NotificationEvent.BACK_IN_STOCK, "BACK_IN_STOCK", EmailTemplateSeeder.BACK_IN_STOCK,
                "caratloop_back_in_stock", List.of("customerName", "productName", "price", "productUrl"),
                "Good news {{customerName}}: {{productName}} is back in stock at Caratloop for {{price}}. {{productUrl}}");

        def(NotificationEvent.OTP, "OTP", null,
                "caratloop_otp", List.of("code"),
                "{{code}} is your Caratloop verification code. It is valid for 10 minutes. Do not share it.");
    }

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    /** Built-in defaults, no database access. */
    public static TemplateSpec defaults(NotificationEvent event) {
        return DEFAULTS.get(event);
    }

    /** Defaults with any {@code global_settings} override applied. Never throws; falls back to defaults. */
    public TemplateSpec resolve(NotificationEvent event) {
        TemplateSpec base = DEFAULTS.get(event);
        if (base == null) {
            return new TemplateSpec(event, event.name(), null, null, List.of(), null);
        }
        Map<String, String> overrides;
        try {
            overrides = overrides(List.of(event));
        } catch (Exception e) {
            return base;
        }
        return apply(base, overrides.get(WA_KEY_PREFIX + event.name()), overrides.get(SMS_KEY_PREFIX + event.name()));
    }

    /** Every event with overrides applied, for the admin screens. */
    public List<TemplateSpec> resolveAll() {
        Map<String, String> overrides;
        try {
            overrides = overrides(Arrays.asList(NotificationEvent.values()));
        } catch (Exception e) {
            overrides = Map.of();
        }
        List<TemplateSpec> out = new ArrayList<>();
        for (NotificationEvent event : NotificationEvent.values()) {
            TemplateSpec base = DEFAULTS.get(event);
            if (base == null) continue;
            out.add(apply(base, overrides.get(WA_KEY_PREFIX + event.name()), overrides.get(SMS_KEY_PREFIX + event.name())));
        }
        return out;
    }

    private Map<String, String> overrides(List<NotificationEvent> events) {
        List<String> keys = new ArrayList<>(events.size() * 2);
        for (NotificationEvent e : events) {
            keys.add(WA_KEY_PREFIX + e.name());
            keys.add(SMS_KEY_PREFIX + e.name());
        }
        Map<String, String> map = new java.util.HashMap<>();
        for (GlobalSetting s : globalSettingRepository.findBySettingKeyIn(keys)) {
            if (s.getSettingKey() != null && s.getSettingValue() != null && !s.getSettingValue().isBlank()) {
                map.put(s.getSettingKey(), s.getSettingValue().trim());
            }
        }
        return map;
    }

    static TemplateSpec apply(TemplateSpec base, String waOverride, String smsOverride) {
        String waTemplate = base.waTemplate();
        List<String> waParams = base.waParams();
        if (waOverride != null) {
            if (OFF.equalsIgnoreCase(waOverride)) {
                waTemplate = null;
            } else {
                int bar = waOverride.indexOf('|');
                if (bar >= 0) {
                    waTemplate = waOverride.substring(0, bar).trim();
                    List<String> params = new ArrayList<>();
                    for (String p : waOverride.substring(bar + 1).split(",")) {
                        if (!p.isBlank()) params.add(p.trim());
                    }
                    waParams = params;
                } else {
                    waTemplate = waOverride.trim();
                }
                if (waTemplate.isEmpty()) {
                    waTemplate = base.waTemplate();
                }
            }
        }
        String smsText = base.smsText();
        if (smsOverride != null) {
            smsText = OFF.equalsIgnoreCase(smsOverride) ? null : smsOverride;
        }
        return new TemplateSpec(base.event(), base.emailType(), base.emailTemplate(), waTemplate, waParams, smsText);
    }
}
