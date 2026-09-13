package com.jewelry.backend.service;

import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.StockNotification;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.StockNotificationRepository;
import com.jewelry.backend.util.EmailText;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Stock alerts (OPERATIONS-CONTRACT.md section 5): the 09:00 low-stock
 * digest to the admin, the same list for the dashboard card, and the
 * back-in-stock notices released when an admin update takes a product from
 * sold out to available. E-mail failures are logged, never propagated.
 */
@Service
public class InventoryAlertService {

    private static final Logger LOGGER = Logger.getLogger(InventoryAlertService.class.getName());

    /** global_settings key; products without their own reorderPointAlert use this. */
    public static final String THRESHOLD_SETTING = "inventory.lowStockThreshold";
    public static final int DEFAULT_THRESHOLD = 1;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    StockNotificationRepository stockNotificationRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    EmailService emailService;

    @Value("${app.admin.email:}")
    private String adminEmail;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    /** {@code inventory.lowStockThreshold} setting, default 1; malformed values fall back to the default. */
    public int lowStockThreshold() {
        return globalSettingRepository.findBySettingKey(THRESHOLD_SETTING)
                .map(GlobalSetting::getSettingValue)
                .map(value -> {
                    try {
                        return Integer.parseInt(value.trim());
                    } catch (NumberFormatException e) {
                        LOGGER.warning(THRESHOLD_SETTING + " is not a number: " + value);
                        return DEFAULT_THRESHOLD;
                    }
                })
                .orElse(DEFAULT_THRESHOLD);
    }

    /** Products with stock <= reorderPointAlert (or <= the global threshold when none), lowest stock first. */
    @Transactional(readOnly = true)
    public List<Product> findLowStock() {
        return productRepository.findLowStock(lowStockThreshold());
    }

    /** Daily 09:00 digest. */
    @Scheduled(cron = "0 0 9 * * *")
    @Transactional(readOnly = true)
    public void sendLowStockDigest() {
        List<Product> low;
        try {
            low = findLowStock();
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Low-stock digest: could not load products", e);
            return;
        }
        if (low.isEmpty()) {
            LOGGER.info("Low-stock digest: nothing to report");
            return;
        }

        Set<String> recipients = new LinkedHashSet<>();
        if (adminEmail != null && !adminEmail.isBlank()) {
            recipients.add(adminEmail.trim());
        }
        globalSettingRepository.findBySettingKey("companyEmail")
                .map(GlobalSetting::getSettingValue)
                .filter(v -> v != null && !v.isBlank())
                .map(String::trim)
                .filter(v -> recipients.stream().noneMatch(v::equalsIgnoreCase))
                .ifPresent(recipients::add);
        if (recipients.isEmpty()) {
            LOGGER.warning("Low-stock digest: no recipient (app.admin.email and companyEmail are both empty)");
            return;
        }

        Map<String, String> data = new HashMap<>();
        data.put("count", String.valueOf(low.size()));
        data.put("rowsHtml", rowsHtml(low));
        data.put("customerName", "Caratloop team");
        data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));

        for (String to : recipients) {
            try {
                emailService.sendTemplate("LOW_STOCK", to, EmailTemplateSeeder.LOW_STOCK_ALERT, data);
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Low-stock digest to " + to + " could not be sent", e);
            }
        }
        LOGGER.info("Low-stock digest: " + low.size() + " products reported to " + recipients);
    }

    /**
     * Sends {@code back-in-stock} to every unnotified subscriber of the
     * product and marks them notified. Called by ProductService when an
     * update moves stock from <= 0 to > 0. Never fails the update.
     */
    @Transactional(rollbackFor = Exception.class)
    public void notifyBackInStock(Product product) {
        try {
            List<StockNotification> waiting = stockNotificationRepository.findByProductIdAndNotifiedFalse(product.getId());
            if (waiting.isEmpty()) {
                return;
            }

            String productUrl = EmailText.trimSlash(frontendUrl) + "/products/" + product.getId();
            List<StockNotification> done = new ArrayList<>(waiting.size());
            for (StockNotification subscription : waiting) {
                if (subscription.getEmail() != null && !subscription.getEmail().isBlank()) {
                    Map<String, String> data = new HashMap<>();
                    data.put("productName", EmailText.escape(product.getName()));
                    data.put("productUrl", productUrl);
                    data.put("price", EmailText.inr(product.getPrice()));
                    data.put("customerName", "Customer");
                    data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
                    try {
                        emailService.sendTemplate("BACK_IN_STOCK", subscription.getEmail().trim(),
                                EmailTemplateSeeder.BACK_IN_STOCK, data);
                    } catch (Exception e) {
                        LOGGER.log(Level.WARNING, "Back-in-stock email to " + subscription.getEmail() + " could not be sent", e);
                    }
                }
                // Marked regardless of the SMTP outcome so a broken mailbox
                // is not retried on every later stock change.
                subscription.setNotified(true);
                done.add(subscription);
            }
            stockNotificationRepository.saveAll(done);
            LOGGER.info("Back in stock: " + product.getSku() + " released " + done.size() + " notifications");
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Back-in-stock notifications for product " + product.getId() + " failed", e);
        }
    }

    private static String rowsHtml(List<Product> products) {
        StringBuilder sb = new StringBuilder();
        for (Product p : products) {
            String reorder = p.getReorderPointAlert() == null ? "default" : String.valueOf(p.getReorderPointAlert());
            sb.append("<tr>")
              .append("<td style=\"padding:6px 8px 6px 0;border-bottom:1px solid #f0ebe0;\">").append(EmailText.escape(p.getSku())).append("</td>")
              .append("<td style=\"padding:6px 8px;border-bottom:1px solid #f0ebe0;\">").append(EmailText.escape(p.getName())).append("</td>")
              .append("<td style=\"padding:6px 8px;border-bottom:1px solid #f0ebe0;text-align:right;\">").append(p.getStock()).append("</td>")
              .append("<td style=\"padding:6px 0 6px 8px;border-bottom:1px solid #f0ebe0;text-align:right;\">").append(reorder).append("</td>")
              .append("</tr>");
        }
        return sb.toString();
    }
}
