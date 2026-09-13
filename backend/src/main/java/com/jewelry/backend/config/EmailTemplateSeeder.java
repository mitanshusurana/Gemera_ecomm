package com.jewelry.backend.config;

import com.jewelry.backend.entity.EmailTemplate;
import com.jewelry.backend.repository.EmailTemplateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the transactional e-mail templates (OPERATIONS-CONTRACT.md section 3)
 * as {@code EmailTemplate} rows, create-if-missing by name, so the admin can
 * edit the copy later without a redeploy. Called from DataInitializer.
 *
 * Every template carries {@code {{customerName}}} and {@code {{storefrontUrl}}};
 * the order templates also carry {@code {{orderNumber}}}. Short, inline-styled
 * HTML in Caratloop gold and ink.
 */
@Component
public class EmailTemplateSeeder {

    public static final String ORDER_CONFIRMATION = "order-confirmation";
    public static final String ORDER_PROCESSING = "order-processing";
    public static final String ORDER_SHIPPED = "order-shipped";
    public static final String ORDER_DELIVERED = "order-delivered";
    public static final String ORDER_CANCELLED = "order-cancelled";
    public static final String ORDER_REFUNDED = "order-refunded";
    public static final String LOW_STOCK_ALERT = "low-stock-alert";
    public static final String BACK_IN_STOCK = "back-in-stock";

    private static final String GOLD = "#c9a44c";
    private static final String DARK_GOLD = "#8a6d1f";
    private static final String INK = "#1c1c1c";

    @Autowired
    EmailTemplateRepository emailTemplateRepository;

    /** One seed row: name, subject, body (placed inside the shared layout), placeholders. */
    private record Seed(String name, String subject, String eyebrow, String body, List<String> placeholders) {
    }

    private static final List<Seed> SEEDS = List.of(
            new Seed(ORDER_CONFIRMATION,
                    "Your Caratloop order {{orderNumber}} is confirmed",
                    "Order confirmed",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Thank you for your order. We have received order <strong>{{orderNumber}}</strong> and it is now being prepared.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                      <thead><tr style="color:#8a6d1f;text-transform:uppercase;font-size:12px;letter-spacing:1px;">
                        <th style="text-align:left;padding:6px 0;border-bottom:1px solid #e3d7b8;">Item</th>
                        <th style="text-align:center;padding:6px 0;border-bottom:1px solid #e3d7b8;">Qty</th>
                        <th style="text-align:right;padding:6px 0;border-bottom:1px solid #e3d7b8;">Price</th>
                      </tr></thead>
                      <tbody>{{itemsHtml}}</tbody>
                    </table>
                    <p style="margin:0 0 6px;font-size:15px;"><strong>Total: {{total}}</strong></p>
                    <p style="margin:0 0 16px;font-size:13px;color:#666;">Payment: {{paymentMethod}}</p>
                    <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8a6d1f;">Shipping to</p>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">{{shippingAddress}}</p>
                    <p style="margin:0;">Track your order any time from <a href="{{storefrontUrl}}/account/orders" style="color:#8a6d1f;">your account</a>.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl", "itemsHtml", "total", "paymentMethod", "shippingAddress")),

            new Seed(ORDER_PROCESSING,
                    "We are preparing your order {{orderNumber}}",
                    "Order in progress",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Good news: order <strong>{{orderNumber}}</strong> has passed quality checks and our team is now preparing it for dispatch.</p>
                    <p style="margin:0 0 16px;">We will email you again with a tracking number as soon as it ships.</p>
                    <p style="margin:0;">Questions? Reply to this email or visit <a href="{{storefrontUrl}}" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl")),

            new Seed(ORDER_SHIPPED,
                    "Your order {{orderNumber}} is on its way",
                    "Shipped",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Order <strong>{{orderNumber}}</strong> has left our atelier.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Tracking number</td><td style="padding:6px 0;"><strong>{{trackingNumber}}</strong></td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Shipping method</td><td style="padding:6px 0;">{{shippingMethod}}</td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Estimated delivery</td><td style="padding:6px 0;">{{estimatedDelivery}}</td></tr>
                    </table>
                    <p style="margin:0 0 16px;font-size:13px;color:#666;">Our shipments are insured and require a signature on delivery. Please have a photo ID ready.</p>
                    <p style="margin:0;">Follow the parcel from <a href="{{storefrontUrl}}/account/orders" style="color:#8a6d1f;">your account</a>.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl", "trackingNumber", "shippingMethod", "estimatedDelivery")),

            new Seed(ORDER_DELIVERED,
                    "Your order {{orderNumber}} has been delivered",
                    "Delivered",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Order <strong>{{orderNumber}}</strong> has been delivered. We hope it brings you joy for years to come.</p>
                    <p style="margin:0 0 16px;">Every Caratloop piece comes with lifetime cleaning and a certificate you can verify at any time on <a href="{{storefrontUrl}}/verify-certificate" style="color:#8a6d1f;">caratloop</a>.</p>
                    <p style="margin:0;">If anything is not as expected, reply to this email within 7 days and we will make it right.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl")),

            new Seed(ORDER_CANCELLED,
                    "Your order {{orderNumber}} was cancelled",
                    "Order cancelled",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Order <strong>{{orderNumber}}</strong> has been cancelled.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{reason}}</p>
                    <p style="margin:0 0 16px;">Any amount already paid, including gift card balance, is returned to the original payment method within 5-7 working days.</p>
                    <p style="margin:0;">We would love to help you find the right piece: <a href="{{storefrontUrl}}/products" style="color:#8a6d1f;">browse the collection</a>.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl", "reason")),

            new Seed(ORDER_REFUNDED,
                    "Refund issued for order {{orderNumber}}",
                    "Refund issued",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">A refund of <strong>{{total}}</strong> has been issued for order <strong>{{orderNumber}}</strong>.</p>
                    <p style="margin:0 0 16px;">Depending on your bank it can take 5-7 working days to appear on your statement.</p>
                    <p style="margin:0;">Thank you for shopping with <a href="{{storefrontUrl}}" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("orderNumber", "customerName", "storefrontUrl", "total")),

            new Seed(LOW_STOCK_ALERT,
                    "Low stock: {{count}} items need reordering",
                    "Inventory alert",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Hello {{customerName}},</p>
                    <p style="margin:0 0 16px;"><strong>{{count}}</strong> products are at or below their reorder point.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
                      <thead><tr style="color:#8a6d1f;text-transform:uppercase;font-size:12px;letter-spacing:1px;">
                        <th style="text-align:left;padding:6px 8px 6px 0;border-bottom:1px solid #e3d7b8;">SKU</th>
                        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e3d7b8;">Name</th>
                        <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e3d7b8;">Stock</th>
                        <th style="text-align:right;padding:6px 0 6px 8px;border-bottom:1px solid #e3d7b8;">Reorder point</th>
                      </tr></thead>
                      <tbody>{{rowsHtml}}</tbody>
                    </table>
                    <p style="margin:0;">Open the <a href="{{storefrontUrl}}" style="color:#8a6d1f;">storefront</a> or the admin product list filtered by low stock to restock.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "count", "rowsHtml")),

            new Seed(BACK_IN_STOCK,
                    "{{productName}} is back in stock",
                    "Back in stock",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">You asked us to let you know: <strong>{{productName}}</strong> is available again at <strong>{{price}}</strong>.</p>
                    <p style="margin:0 0 20px;text-align:center;">
                      <a href="{{productUrl}}" style="display:inline-block;padding:12px 28px;background:#1c1c1c;color:#c9a44c;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-size:12px;">View product</a>
                    </p>
                    <p style="margin:0;font-size:13px;color:#666;">Pieces are often one of a kind, so it may not stay in stock for long. Browse more at <a href="{{storefrontUrl}}/products" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "productName", "productUrl", "price")));

    /** Create-if-missing by name; existing rows (possibly admin-edited) are left untouched. */
    public void seed() {
        int created = 0;
        for (Seed seed : SEEDS) {
            if (emailTemplateRepository.findByName(seed.name()).isPresent()) {
                continue;
            }
            EmailTemplate template = new EmailTemplate();
            template.setName(seed.name());
            template.setSubject(seed.subject());
            template.setHtmlContent(layout(seed.eyebrow(), seed.body()));
            template.setPlaceholders(new java.util.ArrayList<>(seed.placeholders()));
            emailTemplateRepository.save(template);
            created++;
        }
        if (created > 0) {
            System.out.println("Email templates initialized: " + created + " created.");
        }
    }

    /** Shared wrapper: Caratloop word mark, gold rule, body, muted footer. */
    static String layout(String eyebrow, String body) {
        return "<div style=\"font-family:Georgia,'Times New Roman',serif;max-width:600px;margin:0 auto;"
                + "padding:32px 28px;color:#222;background:#ffffff;\">"
                + "<div style=\"border-bottom:2px solid " + GOLD + ";padding-bottom:12px;margin-bottom:24px;\">"
                + "<span style=\"font-size:22px;letter-spacing:3px;text-transform:uppercase;color:" + INK + ";\">Caratloop</span>"
                + "<div style=\"font-size:12px;letter-spacing:2px;text-transform:uppercase;color:" + DARK_GOLD + ";margin-top:4px;\">"
                + eyebrow + "</div>"
                + "</div>"
                + body
                + "<p style=\"margin:24px 0 0;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px;\">"
                + "This email was sent by Caratloop. If you did not expect it, please ignore it.</p>"
                + "</div>";
    }
}
