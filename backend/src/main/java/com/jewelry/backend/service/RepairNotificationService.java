package com.jewelry.backend.service;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.util.EmailText;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Repair job e-mails (received, estimate, ready, delivered). As with the
 * order e-mails, every method swallows and logs failures so a mail problem
 * never fails the repair operation that triggered it.
 */
@Service
public class RepairNotificationService {

    private static final Logger LOGGER = Logger.getLogger(RepairNotificationService.class.getName());
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy");

    @Autowired
    EmailService emailService;

    @Autowired
    com.jewelry.backend.service.notification.NotificationService notificationService;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    public void sendReceived(RepairJob job) {
        send(job, EmailTemplateSeeder.REPAIR_RECEIVED, "REPAIR_RECEIVED", Map.of());
    }

    public void sendEstimate(RepairJob job) {
        Map<String, String> data = new HashMap<>();
        data.put("estimateAmount", EmailText.inr(job.getEstimateAmount()));
        data.put("estimateNote", EmailText.escape(job.getEstimateNote() == null ? "" : job.getEstimateNote()));
        send(job, EmailTemplateSeeder.REPAIR_ESTIMATE, "REPAIR_ESTIMATE", data);
    }

    public void sendReady(RepairJob job) {
        Map<String, String> data = new HashMap<>();
        BigDecimal due = RepairJobService.balanceDue(job);
        BigDecimal quoted = job.getFinalAmount() != null ? job.getFinalAmount() : job.getEstimateAmount();
        data.put("amountDue", due != null ? EmailText.inr(due) : quoted != null ? EmailText.inr(quoted) : "To be confirmed at the counter");
        send(job, EmailTemplateSeeder.REPAIR_READY, "REPAIR_READY", data);
    }

    public void sendDelivered(RepairJob job) {
        Map<String, String> data = new HashMap<>();
        data.put("finalAmount", job.getFinalAmount() == null ? "-" : EmailText.inr(job.getFinalAmount()));
        data.put("paidAmount", job.getPaidAmount() == null ? "-" : EmailText.inr(job.getPaidAmount()));
        send(job, EmailTemplateSeeder.REPAIR_DELIVERED, "REPAIR_DELIVERED", data);
    }

    /** {FRONTEND_URL}/repairs/track/{jobNumber}; the page asks for the phone. */
    public String trackingUrl(RepairJob job) {
        return EmailText.trimSlash(frontendUrl) + "/repairs/track/" + job.getJobNumber();
    }

    /**
     * E-mail through the seeded template as before, plus WhatsApp and SMS via
     * NotificationService. Guests (no account) get the default preferences
     * with the phone they gave on the form.
     */
    private void send(RepairJob job, String templateName, String type, Map<String, String> extra) {
        try {
            com.jewelry.backend.service.notification.Recipient recipient =
                    com.jewelry.backend.service.notification.Recipient.of(
                            job.getUser(), job.getCustomerName(), job.getEmail(), job.getPhone(), job.getJobNumber());
            if (!recipient.hasEmail() && !recipient.hasPhone()) {
                LOGGER.warning("Repair " + job.getJobNumber() + ": no customer email or phone, skipping " + templateName);
                return;
            }
            Map<String, String> data = new HashMap<>(extra);
            data.put("jobNumber", job.getJobNumber());
            data.put("customerName", EmailText.escape(job.getCustomerName()));
            data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
            data.put("trackingUrl", trackingUrl(job));
            data.put("itemDescription", EmailText.escape(job.getItemDescription() == null ? "" : job.getItemDescription()));
            data.put("serviceType", serviceLabel(job.getServiceType()));
            data.put("promisedDate", job.getPromisedDate() == null ? "To be confirmed" : job.getPromisedDate().format(DATE));
            com.jewelry.backend.service.notification.NotificationEvent event =
                    com.jewelry.backend.service.notification.NotificationEvent.parse(type);
            if (event == null) {
                if (recipient.hasEmail()) {
                    emailService.sendTemplate(type, recipient.email(), templateName, data);
                }
                return;
            }
            notificationService.notify(event, recipient, data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Repair " + job.getJobNumber() + ": " + templateName + " notification could not be sent", e);
        }
    }

    /** "STONE_RESET" to "Stone reset" etc. Shared with the job card. */
    public static String serviceLabel(RepairJob.ServiceType type) {
        if (type == null) return "";
        return switch (type) {
            case RESIZE -> "Resizing";
            case POLISH -> "Polishing";
            case STONE_RESET -> "Stone resetting";
            case RHODIUM_PLATING -> "Rhodium plating";
            case CHAIN_REPAIR -> "Chain repair";
            case ENGRAVING -> "Engraving";
            case CLEANING -> "Cleaning";
            case OTHER -> "Other service";
        };
    }

    public static String itemLabel(RepairJob.ItemType type) {
        if (type == null) return "";
        String s = type.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
