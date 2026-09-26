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
    public static final String TREASURE_INSTALLMENT = "treasure-installment";
    public static final String TREASURE_MATURED = "treasure-matured";
    public static final String REPAIR_RECEIVED = "repair-received";
    public static final String REPAIR_ESTIMATE = "repair-estimate";
    public static final String REPAIR_READY = "repair-ready";
    public static final String REPAIR_DELIVERED = "repair-delivered";
    public static final String EXCHANGE_RECEIVED = "exchange-received";
    public static final String EXCHANGE_CREDITED = "exchange-credited";
    public static final String EXCHANGE_REJECTED = "exchange-rejected";
    public static final String APPOINTMENT_RECEIVED = "appointment-received";
    public static final String APPOINTMENT_CONFIRMED = "appointment-confirmed";
    public static final String APPOINTMENT_REMINDER = "appointment-reminder";
    public static final String APPOINTMENT_CANCELLED = "appointment-cancelled";
    public static final String TREASURE_INSTALLMENT_DUE = "treasure-installment-due";
    public static final String RETURN_APPROVED = "return-approved";
    public static final String RETURN_REJECTED = "return-rejected";
    public static final String RETURN_REFUNDED = "return-refunded";

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
                    List.of("customerName", "storefrontUrl", "productName", "productUrl", "price")),

            new Seed(TREASURE_INSTALLMENT,
                    "Installment {{installmentNumber}} of {{totalInstallments}} received",
                    "Treasure Chest plan",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Thank you. We have received installment <strong>{{installmentNumber}} of {{totalInstallments}}</strong> towards your Treasure Chest plan.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Amount received</td><td style="padding:6px 0;"><strong>{{amount}}</strong></td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Plan balance</td><td style="padding:6px 0;"><strong>{{balance}}</strong></td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Next installment due</td><td style="padding:6px 0;">{{nextDueDate}}</td></tr>
                    </table>
                    <p style="margin:0;">See your plan and payment history any time on <a href="{{storefrontUrl}}/treasure" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "installmentNumber", "totalInstallments", "amount", "balance", "nextDueDate")),

            new Seed(TREASURE_MATURED,
                    "Your Treasure Plan has matured",
                    "Plan matured",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Congratulations: every installment of your Treasure Chest plan has been paid, and we have added your bonus of <strong>{{bonus}}</strong>.</p>
                    <div style="margin:20px 0;padding:20px;border:1px solid #e3d7b8;border-radius:8px;background:linear-gradient(135deg,#fffdf7,#f6efe0);text-align:center;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;">Balance available</div>
                      <div style="font-size:26px;letter-spacing:1px;font-weight:bold;margin:8px 0;color:#1c1c1c;">{{balance}}</div>
                    </div>
                    <p style="margin:0 0 16px;">Redeem it against any piece in our collection: visit a store or reply to this email and our team will help you choose.</p>
                    <p style="margin:0;">Browse the collection at <a href="{{storefrontUrl}}/products" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "balance", "bonus")),

            // ----- Repair and service jobs (RepairNotificationService) -----
            new Seed(REPAIR_RECEIVED,
                    "Repair request {{jobNumber}} received",
                    "Repair request received",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">We have logged your request for <strong>{{serviceType}}</strong> on your <strong>{{itemDescription}}</strong> as job <strong>{{jobNumber}}</strong>.</p>
                    <p style="margin:0 0 16px;">Please bring the piece to the store (or send it insured) quoting the job number. Our goldsmith will assess it and send you an estimate to approve before any work begins.</p>
                    <p style="margin:0 0 20px;text-align:center;">
                      <a href="{{trackingUrl}}" style="display:inline-block;padding:12px 28px;background:#1c1c1c;color:#c9a44c;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-size:12px;">Track this job</a>
                    </p>
                    <p style="margin:0;font-size:13px;color:#666;">Tracking asks for the phone number you gave us. Questions? Reply to this email or visit <a href="{{storefrontUrl}}/repairs" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "jobNumber", "itemDescription", "serviceType", "trackingUrl", "promisedDate")),

            new Seed(REPAIR_ESTIMATE,
                    "Your estimate for repair job {{jobNumber}}",
                    "Estimate ready",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">We have assessed your <strong>{{itemDescription}}</strong> (job <strong>{{jobNumber}}</strong>, {{serviceType}}).</p>
                    <div style="margin:20px 0;padding:20px;border:1px solid #e3d7b8;border-radius:8px;background:#fffdf7;text-align:center;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;">Estimate</div>
                      <div style="font-size:26px;letter-spacing:1px;font-weight:bold;margin:8px 0;color:#1c1c1c;">{{estimateAmount}}</div>
                      <div style="font-size:13px;color:#666;">Promised by {{promisedDate}}</div>
                    </div>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{estimateNote}}</p>
                    <p style="margin:0 0 16px;">Work begins as soon as you approve. You can approve online in one click:</p>
                    <p style="margin:0 0 20px;text-align:center;">
                      <a href="{{trackingUrl}}" style="display:inline-block;padding:12px 28px;background:#1c1c1c;color:#c9a44c;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-size:12px;">Review and approve</a>
                    </p>
                    <p style="margin:0;font-size:13px;color:#666;">Prefer to talk it through first? Reply to this email or call the store.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "jobNumber", "itemDescription", "serviceType", "trackingUrl", "estimateAmount", "estimateNote", "promisedDate")),

            new Seed(REPAIR_READY,
                    "Your {{itemDescription}} is ready for collection ({{jobNumber}})",
                    "Ready for collection",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Good news: the <strong>{{serviceType}}</strong> on your <strong>{{itemDescription}}</strong> is complete and job <strong>{{jobNumber}}</strong> is ready for collection.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Amount due</td><td style="padding:6px 0;"><strong>{{amountDue}}</strong></td></tr>
                    </table>
                    <p style="margin:0 0 16px;">Please bring your receipt stub or quote the job number at the counter.</p>
                    <p style="margin:0;">Job history: <a href="{{trackingUrl}}" style="color:#8a6d1f;">{{trackingUrl}}</a></p>
                    """,
                    List.of("customerName", "storefrontUrl", "jobNumber", "itemDescription", "serviceType", "trackingUrl", "amountDue")),

            new Seed(REPAIR_DELIVERED,
                    "Repair job {{jobNumber}} delivered",
                    "Delivered",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Job <strong>{{jobNumber}}</strong> ({{serviceType}} on your {{itemDescription}}) has been handed over. Thank you for trusting us with your piece.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Bill</td><td style="padding:6px 0;"><strong>{{finalAmount}}</strong></td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Paid</td><td style="padding:6px 0;">{{paidAmount}}</td></tr>
                    </table>
                    <p style="margin:0 0 16px;">Every Caratloop piece is welcome back for complimentary cleaning. Book any time at <a href="{{storefrontUrl}}/repairs" style="color:#8a6d1f;">caratloop</a>.</p>
                    <p style="margin:0;">If anything is not as expected, reply to this email within 7 days and we will make it right.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "jobNumber", "itemDescription", "serviceType", "trackingUrl", "finalAmount", "paidAmount")),

            new Seed(EXCHANGE_RECEIVED,
                    "We have received your old {{metal}} ({{requestNumber}})",
                    "Old gold exchange",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Your item for exchange request <strong>{{requestNumber}}</strong> has reached us safely.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Metal</td><td style="padding:6px 0;">{{metal}}</td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Declared purity</td><td style="padding:6px 0;">{{declaredPurity}}</td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Declared weight</td><td style="padding:6px 0;">{{declaredWeight}} g</td></tr>
                    </table>
                    <p style="margin:0 0 16px;">Our assayer will now test the purity and weigh the piece net of stones and solder. The final value follows the assay and the rate of the day; we will email it to you as store credit.</p>
                    <p style="margin:0;">Follow the request any time at <a href="{{storefrontUrl}}/exchange" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "requestNumber", "metal", "declaredPurity", "declaredWeight")),

            new Seed(EXCHANGE_CREDITED,
                    "Your store credit of {{amount}} is ready ({{requestNumber}})",
                    "Store credit issued",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">The assay of your old {{metal}} for request <strong>{{requestNumber}}</strong> is complete and its value has been issued as Caratloop store credit.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Assayed purity</td><td style="padding:6px 0;">{{purity}}</td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Net weight</td><td style="padding:6px 0;">{{netWeight}} g</td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Rate (fine, per gram)</td><td style="padding:6px 0;">{{rate}}</td></tr>
                    </table>
                    <div style="margin:20px 0;padding:20px;border:1px solid #e3d7b8;border-radius:8px;background:#faf7f0;text-align:center;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;">Store credit</div>
                      <div style="font-size:26px;font-weight:bold;margin:8px 0;color:#1c1c1c;">{{amount}}</div>
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;margin-top:12px;">Your code</div>
                      <div style="font-family:monospace;font-size:20px;letter-spacing:2px;margin:6px 0;color:#1c1c1c;">{{code}}</div>
                      <div style="font-size:12px;color:#666;">Valid until {{expiresAt}}</div>
                    </div>
                    <p style="margin:0 0 16px;">Enter the code in the gift card field at checkout; any unused balance stays on the code. Keep this email safe: the code is as good as cash in our store.</p>
                    <p style="margin:0;">Browse the collection at <a href="{{storefrontUrl}}/products" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "requestNumber", "metal", "purity", "netWeight", "rate", "amount", "code", "expiresAt")),

            new Seed(EXCHANGE_REJECTED,
                    "About your exchange request {{requestNumber}}",
                    "Old gold exchange",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">We are sorry: we could not accept the item under exchange request <strong>{{requestNumber}}</strong>.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{reason}}</p>
                    <p style="margin:0 0 16px;">If the item is with us it is being returned to you by insured courier, or is ready for collection at the store where you handed it in.</p>
                    <p style="margin:0;">Questions? Reply to this email or visit <a href="{{storefrontUrl}}/contact" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "requestNumber", "reason")),

            // ----- Appointments and Treasure reminders (service/notification) -----
            new Seed(APPOINTMENT_RECEIVED,
                    "We have your appointment request for {{requestedDate}}",
                    "Appointment requested",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Thank you. We have received your request for a <strong>{{appointmentType}}</strong> on <strong>{{requestedDate}}</strong> ({{storeName}}).</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{notes}}</p>
                    <p style="margin:0 0 16px;">A member of our team will confirm the slot shortly. You can change or cancel the booking any time from <a href="{{storefrontUrl}}/account?tab=orders" style="color:#8a6d1f;">your account</a>.</p>
                    <p style="margin:0;">Find our address and hours at <a href="{{storefrontUrl}}/stores" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "appointmentType", "requestedDate", "storeName", "notes")),

            new Seed(APPOINTMENT_CONFIRMED,
                    "Your Caratloop appointment on {{requestedDate}}",
                    "Appointment confirmed",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Thank you for booking with us. Your <strong>{{appointmentType}}</strong> appointment is set for <strong>{{requestedDate}}</strong> ({{storeName}}){{consultantLine}}.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{notes}}</p>
                    <p style="margin:0 0 16px;">Our team will have pieces ready for you. If you need to change the time, simply reply to this email or call the store.</p>
                    <p style="margin:0;">Find our address and hours at <a href="{{storefrontUrl}}/stores" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "appointmentType", "requestedDate", "storeName", "consultantLine", "notes")),

            new Seed(APPOINTMENT_CANCELLED,
                    "Your Caratloop appointment on {{requestedDate}} was cancelled",
                    "Appointment cancelled",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Your <strong>{{appointmentType}}</strong> appointment on <strong>{{requestedDate}}</strong> has been cancelled.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{reason}}</p>
                    <p style="margin:0 0 16px;">We would love to see you another time: <a href="{{storefrontUrl}}/appointments" style="color:#8a6d1f;">book a new slot</a> in a minute.</p>
                    <p style="margin:0;">Questions? Reply to this email or call the store.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "appointmentType", "requestedDate", "reason")),

            // ----- Returns and exchanges (ReturnService) -----
            new Seed(RETURN_APPROVED,
                    "Return {{rmaNumber}} approved",
                    "Return approved",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Your return request <strong>{{rmaNumber}}</strong> for order <strong>{{orderNumber}}</strong> has been approved.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                      <thead><tr style="color:#8a6d1f;text-transform:uppercase;font-size:12px;letter-spacing:1px;">
                        <th style="text-align:left;padding:6px 0;border-bottom:1px solid #e3d7b8;">Item</th>
                        <th style="text-align:center;padding:6px 0;border-bottom:1px solid #e3d7b8;">Qty</th>
                      </tr></thead>
                      <tbody>{{itemsHtml}}</tbody>
                    </table>
                    <p style="margin:0 0 16px;">Please send the piece back by insured courier, in its original packaging with the certificate, quoting <strong>{{rmaNumber}}</strong> on the parcel, or bring it to any Caratloop store.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{resolutionText}}: <strong>{{refundAmount}}</strong>{{feeText}}</p>
                    <p style="margin:0;">Follow the return from <a href="{{storefrontUrl}}/account?tab=orders" style="color:#8a6d1f;">your account</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "rmaNumber", "orderNumber", "itemsHtml", "refundAmount", "resolutionText", "feeText")),

            new Seed(RETURN_REJECTED,
                    "About your return request {{rmaNumber}}",
                    "Return request",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">We are sorry: we could not accept return request <strong>{{rmaNumber}}</strong> for order <strong>{{orderNumber}}</strong>.</p>
                    <p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c9a44c;background:#faf7f0;">{{reason}}</p>
                    <p style="margin:0 0 16px;">If the piece is already with us it is being returned to you by insured courier.</p>
                    <p style="margin:0;">Questions? Reply to this email or visit <a href="{{storefrontUrl}}/contact" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "rmaNumber", "orderNumber", "reason")),

            new Seed(RETURN_REFUNDED,
                    "Return {{rmaNumber}} complete: {{resolutionText}}",
                    "Return complete",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">We have received the item(s) under return <strong>{{rmaNumber}}</strong> for order <strong>{{orderNumber}}</strong>.</p>
                    <div style="margin:20px 0;padding:20px;border:1px solid #e3d7b8;border-radius:8px;background:#faf7f0;text-align:center;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;">{{resolutionText}}</div>
                      <div style="font-size:26px;font-weight:bold;margin:8px 0;color:#1c1c1c;">{{refundAmount}}</div>
                      <div style="font-size:13px;color:#666;">{{detailText}}</div>
                    </div>
                    <p style="margin:0;">Thank you for shopping with <a href="{{storefrontUrl}}" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "rmaNumber", "orderNumber", "refundAmount", "resolutionText", "detailText")),

            new Seed(APPOINTMENT_REMINDER,
                    "Reminder: your Caratloop appointment is tomorrow",
                    "Appointment reminder",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">A quick reminder that your <strong>{{appointmentType}}</strong> appointment is tomorrow, <strong>{{requestedDate}}</strong>.</p>
                    <p style="margin:0 0 16px;">If something has come up, reply to this email or call the store and we will find another time.</p>
                    <p style="margin:0;">Directions and hours: <a href="{{storefrontUrl}}/stores" style="color:#8a6d1f;">caratloop</a>.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "appointmentType", "requestedDate")),

            new Seed(TREASURE_INSTALLMENT_DUE,
                    "Your Treasure Chest installment of {{amount}} is due on {{dueDate}}",
                    "Installment due",
                    """
                    <p style="margin:0 0 16px;font-size:16px;">Dear {{customerName}},</p>
                    <p style="margin:0 0 16px;">Installment <strong>{{installmentNumber}} of {{totalInstallments}}</strong> of your {{planName}} plan is due on <strong>{{dueDate}}</strong>.</p>
                    <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Amount due</td><td style="padding:6px 0;"><strong>{{amount}}</strong></td></tr>
                      <tr><td style="padding:6px 16px 6px 0;color:#666;">Plan balance</td><td style="padding:6px 0;">{{balance}}</td></tr>
                    </table>
                    <p style="margin:0 0 20px;text-align:center;">
                      <a href="{{storefrontUrl}}/treasure" style="display:inline-block;padding:12px 28px;background:#1c1c1c;color:#c9a44c;text-decoration:none;letter-spacing:2px;text-transform:uppercase;font-size:12px;">Pay installment</a>
                    </p>
                    <p style="margin:0;font-size:13px;color:#666;">Paying on time keeps your bonus on track. You can also pay in cash at any Caratloop store.</p>
                    """,
                    List.of("customerName", "storefrontUrl", "planName", "installmentNumber", "totalInstallments", "amount", "dueDate", "balance")));

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
