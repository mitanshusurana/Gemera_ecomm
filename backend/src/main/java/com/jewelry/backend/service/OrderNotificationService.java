package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.config.EmailTemplateSeeder;
import com.jewelry.backend.dto.AddressDTO;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.service.notification.NotificationEvent;
import com.jewelry.backend.service.notification.NotificationService;
import com.jewelry.backend.service.notification.Recipient;
import com.jewelry.backend.util.EmailText;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Order lifecycle e-mails (OPERATIONS-CONTRACT.md section 3). Every public
 * method swallows and logs failures: a mail problem must never fail the
 * order operation that triggered it. Callers hold the transaction, so the
 * lazy {@code Order.items} collection is readable here.
 */
@Service
public class OrderNotificationService {

    private static final Logger LOGGER = Logger.getLogger(OrderNotificationService.class.getName());
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("d MMMM yyyy");

    @Autowired
    EmailService emailService;

    @Autowired
    NotificationService notificationService;

    @Autowired
    ObjectMapper objectMapper;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    public void sendOrderConfirmation(Order order) {
        Map<String, String> data = new HashMap<>();
        data.put("itemsHtml", itemsHtml(order));
        data.put("total", EmailText.inr(order.getTotal()));
        data.put("paymentMethod", paymentMethodLabel(order));
        data.put("shippingAddress", shippingAddressHtml(order));
        send(order, EmailTemplateSeeder.ORDER_CONFIRMATION, "ORDER_CONFIRMATION", data);
    }

    public void sendProcessing(Order order) {
        send(order, EmailTemplateSeeder.ORDER_PROCESSING, "ORDER_PROCESSING", Map.of());
    }

    public void sendShipped(Order order) {
        Map<String, String> data = new HashMap<>();
        data.put("trackingNumber", text(order.getTrackingNumber(), "Will follow shortly"));
        data.put("shippingMethod", text(order.getShippingMethod(), "Insured courier"));
        data.put("estimatedDelivery", order.getEstimatedDelivery() == null
                ? "To be confirmed"
                : order.getEstimatedDelivery().format(DATE_FORMAT));
        send(order, EmailTemplateSeeder.ORDER_SHIPPED, "SHIPPING", data);
    }

    public void sendDelivered(Order order) {
        send(order, EmailTemplateSeeder.ORDER_DELIVERED, "DELIVERY", Map.of());
    }

    public void sendCancelled(Order order, String reason) {
        String text = (reason == null || reason.isBlank())
                ? "No reason was recorded."
                : EmailText.escape(reason.trim());
        send(order, EmailTemplateSeeder.ORDER_CANCELLED, "ORDER_CANCELLED", Map.of("reason", text));
    }

    public void sendRefunded(Order order) {
        send(order, EmailTemplateSeeder.ORDER_REFUNDED, "ORDER_REFUNDED",
                Map.of("total", EmailText.inr(order.getTotal())));
    }

    /** Dispatches the e-mail that belongs to a status the order has just entered; unknown statuses send nothing. */
    public void sendForStatus(Order order, String status, String reason) {
        if (status == null) {
            return;
        }
        switch (status.trim().toUpperCase()) {
            case "PROCESSING" -> sendProcessing(order);
            case "SHIPPED" -> sendShipped(order);
            case "DELIVERED" -> sendDelivered(order);
            case "CANCELLED" -> sendCancelled(order, reason);
            case "REFUNDED" -> sendRefunded(order);
            default -> { }
        }
    }

    // ------------------------------------------------------------------

    /**
     * E-mail through the seeded template exactly as before (same type string,
     * same placeholders), plus WhatsApp and SMS via NotificationService when
     * the customer allows them. The phone comes from the profile, falling back
     * to the shipping address.
     */
    private void send(Order order, String templateName, String type, Map<String, String> extra) {
        try {
            Map<String, String> data = new HashMap<>(extra);
            data.put("orderNumber", text(order.getOrderNumber(), ""));
            data.put("customerName", EmailText.escape(customerName(order)));
            data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));

            NotificationEvent event = eventFor(type);
            Recipient recipient = recipient(order);
            if (event == null) {
                if (recipient.hasEmail()) {
                    emailService.sendTemplate(type, recipient.email(), templateName, data);
                }
                return;
            }
            if (!recipient.hasEmail() && !recipient.hasPhone()) {
                LOGGER.warning("Order " + order.getOrderNumber() + ": no customer email or phone, skipping " + templateName);
                return;
            }
            notificationService.notify(event, recipient, data);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Order " + order.getOrderNumber() + ": " + templateName + " notification could not be sent", e);
        }
    }

    /** Legacy EmailNotification.type strings to events; unknown types stay e-mail only. */
    static NotificationEvent eventFor(String type) {
        if (type == null) return null;
        return switch (type) {
            case "ORDER_CONFIRMATION" -> NotificationEvent.ORDER_CONFIRMED;
            case "ORDER_PROCESSING" -> NotificationEvent.ORDER_PROCESSING;
            case "SHIPPING" -> NotificationEvent.ORDER_SHIPPED;
            case "DELIVERY" -> NotificationEvent.ORDER_DELIVERED;
            case "ORDER_CANCELLED" -> NotificationEvent.ORDER_CANCELLED;
            case "ORDER_REFUNDED" -> NotificationEvent.ORDER_REFUNDED;
            default -> null;
        };
    }

    private Recipient recipient(Order order) {
        AddressDTO address = shippingAddress(order);
        String addressName = address == null ? null : join(address.getFirstName(), address.getLastName());
        String addressPhone = address == null ? null : address.getPhone();
        return Recipient.of(order.getUser(), addressName, null, addressPhone, order.getOrderNumber());
    }

    private String customerName(Order order) {
        User user = order.getUser();
        if (user != null) {
            String name = join(user.getFirstName(), user.getLastName());
            if (!name.isEmpty()) return name;
        }
        AddressDTO address = shippingAddress(order);
        if (address != null) {
            String name = join(address.getFirstName(), address.getLastName());
            if (!name.isEmpty()) return name;
        }
        return "Customer";
    }

    private AddressDTO shippingAddress(Order order) {
        if (order.getShippingAddress() == null || order.getShippingAddress().isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(order.getShippingAddress(), AddressDTO.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String shippingAddressHtml(Order order) {
        AddressDTO a = shippingAddress(order);
        if (a == null) {
            return "As provided at checkout";
        }
        StringBuilder sb = new StringBuilder();
        appendLine(sb, join(a.getFirstName(), a.getLastName()));
        appendLine(sb, a.getStreet());
        appendLine(sb, join(join(a.getCity(), a.getState()), a.getZipCode()));
        appendLine(sb, a.getCountry());
        appendLine(sb, a.getPhone());
        return sb.length() == 0 ? "As provided at checkout" : sb.toString();
    }

    private static void appendLine(StringBuilder sb, String value) {
        if (value == null || value.isBlank()) return;
        if (sb.length() > 0) sb.append("<br>");
        sb.append(EmailText.escape(value.trim()));
    }

    private static String itemsHtml(Order order) {
        if (order.getItems() == null || order.getItems().isEmpty()) {
            return "<tr><td colspan=\"3\" style=\"padding:8px 0;color:#666;\">Items as listed in your account</td></tr>";
        }
        StringBuilder sb = new StringBuilder();
        for (OrderItem item : order.getItems()) {
            String name = item.getDescription() != null && !item.getDescription().isBlank()
                    ? item.getDescription()
                    : item.getProduct() != null && item.getProduct().getName() != null
                    ? item.getProduct().getName() : "Item";
            String sku = item.getProduct() != null && item.getProduct().getSku() != null
                    ? " <span style=\"color:#999;font-size:12px;\">" + EmailText.escape(item.getProduct().getSku()) + "</span>"
                    : "";
            BigDecimal unit = item.getPrice() == null ? BigDecimal.ZERO : item.getPrice();
            BigDecimal line = unit.multiply(BigDecimal.valueOf(Math.max(item.getQuantity(), 1)));
            sb.append("<tr>")
              .append("<td style=\"padding:8px 0;border-bottom:1px solid #f0ebe0;\">").append(EmailText.escape(name)).append(sku).append("</td>")
              .append("<td style=\"padding:8px 0;border-bottom:1px solid #f0ebe0;text-align:center;\">").append(item.getQuantity()).append("</td>")
              .append("<td style=\"padding:8px 0;border-bottom:1px solid #f0ebe0;text-align:right;\">").append(EmailText.inr(line)).append("</td>")
              .append("</tr>");
        }
        return sb.toString();
    }

    private static String paymentMethodLabel(Order order) {
        String method = order.getPaymentMethod() == null ? "" : order.getPaymentMethod().trim().toUpperCase();
        String label = switch (method) {
            case "COD", "CASH_ON_DELIVERY" -> "Cash on delivery";
            case "GIFT_CARD" -> "Gift card";
            case "RAZORPAY", "CARD", "UPI", "ONLINE" -> "Paid online";
            case "" -> "As selected at checkout";
            default -> EmailText.escape(order.getPaymentMethod());
        };
        if (!"GIFT_CARD".equals(method) && order.getGiftCardAmount() != null
                && order.getGiftCardAmount().compareTo(BigDecimal.ZERO) > 0) {
            label += " + gift card " + EmailText.inr(order.getGiftCardAmount());
        }
        return label;
    }

    private static String join(String a, String b) {
        String left = a == null ? "" : a.trim();
        String right = b == null ? "" : b.trim();
        if (left.isEmpty()) return right;
        if (right.isEmpty()) return left;
        return left + " " + right;
    }

    private static String text(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : EmailText.escape(value.trim());
    }
}
