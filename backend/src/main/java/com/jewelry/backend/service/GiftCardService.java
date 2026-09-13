package com.jewelry.backend.service;

import com.jewelry.backend.dto.AdminIssueGiftCardRequest;
import com.jewelry.backend.dto.CreateRazorpayOrderRequest;
import com.jewelry.backend.dto.GiftCardBalanceResponse;
import com.jewelry.backend.dto.GiftCardConfirmRequest;
import com.jewelry.backend.dto.GiftCardDTO;
import com.jewelry.backend.dto.GiftCardPurchaseRequest;
import com.jewelry.backend.dto.GiftCardPurchaseResponse;
import com.jewelry.backend.dto.RazorpayOrderResponse;
import com.jewelry.backend.dto.VerifyPaymentRequest;
import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.repository.GiftCardRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
public class GiftCardService {

    private static final Logger LOGGER = Logger.getLogger(GiftCardService.class.getName());

    // Unambiguous alphabet: A-Z and 2-9 without I, O, 0, 1.
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_GROUPS = 3;
    private static final int CODE_GROUP_LENGTH = 4;

    private static final BigDecimal MIN_AMOUNT = new BigDecimal("500");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("100000");
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final String CURRENCY = "INR";
    private static final String DEFAULT_THEME = "classic";
    private static final Set<String> THEMES = Set.of("classic", "gold", "ruby");
    private static final int VALIDITY_MONTHS = 12;
    private static final DateTimeFormatter EXPIRY_FORMAT = DateTimeFormatter.ofPattern("d MMMM yyyy");

    private final SecureRandom random = new SecureRandom();

    @Autowired
    GiftCardRepository giftCardRepository;

    @Autowired
    PaymentService paymentService;

    @Autowired
    EmailService emailService;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    // ------------------------------------------------------------------
    // Public storefront flow
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public GiftCardPurchaseResponse purchase(GiftCardPurchaseRequest request) {
        BigDecimal amount = normalizeAmount(request.getAmount());
        String theme = normalizeTheme(request.getTheme());
        String purchaserEmail = normalizeEmail(request.getPurchaserEmail(), "purchaserEmail");
        String recipientEmail = normalizeEmail(request.getRecipientEmail(), "recipientEmail");
        String recipientName = requireText(request.getRecipientName(), "recipientName", 120);
        String message = optionalText(request.getMessage(), 500);

        // Create the gateway order first: if the gateway is unavailable there
        // is nothing worth persisting.
        CreateRazorpayOrderRequest orderRequest = new CreateRazorpayOrderRequest();
        orderRequest.setAmount(toPaise(amount));
        orderRequest.setCurrency(CURRENCY);

        RazorpayOrderResponse razorpayOrder;
        try {
            razorpayOrder = paymentService.createRazorpayOrder(orderRequest);
        } catch (IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Gift card purchase rejected: " + e.getMessage());
            throw new IllegalStateException("Online payment is not available right now.", e);
        }

        GiftCard card = new GiftCard();
        card.setInitialAmount(amount);
        card.setBalance(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        card.setCurrency(CURRENCY);
        card.setPurchaserEmail(purchaserEmail);
        card.setRecipientName(recipientName);
        card.setRecipientEmail(recipientEmail);
        card.setMessage(message);
        card.setTheme(theme);
        card.setStatus(GiftCard.STATUS_PENDING_PAYMENT);
        card.setRazorpayOrderId(razorpayOrder.getId());

        GiftCard saved = giftCardRepository.save(card);

        return new GiftCardPurchaseResponse(
                saved.getId(),
                razorpayOrder.getId(),
                razorpayOrder.getAmount(),
                razorpayOrder.getCurrency());
    }

    @Transactional(rollbackFor = Exception.class)
    public GiftCard confirm(UUID giftCardId, GiftCardConfirmRequest request) {
        GiftCard card = giftCardRepository.findByIdForUpdate(giftCardId)
                .orElseThrow(() -> new EntityNotFoundException("Gift card not found"));

        if (card.getRazorpayOrderId() == null
                || !card.getRazorpayOrderId().equals(request.getRazorpayOrderId())) {
            throw new IllegalArgumentException("The payment does not belong to this gift card.");
        }

        VerifyPaymentRequest verifyRequest = new VerifyPaymentRequest();
        verifyRequest.setOrderId(request.getRazorpayOrderId());
        verifyRequest.setPaymentId(request.getRazorpayPaymentId());
        verifyRequest.setPaymentToken(request.getRazorpaySignature());
        try {
            paymentService.verifyPayment(verifyRequest);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Payment verification failed.", e);
        }

        // Idempotent: a second confirm for the same, already verified payment
        // returns the card unchanged and sends no further email.
        if (GiftCard.STATUS_ACTIVE.equals(card.getStatus())) {
            return card;
        }
        if (!GiftCard.STATUS_PENDING_PAYMENT.equals(card.getStatus())) {
            throw new IllegalArgumentException("This gift card can no longer be confirmed.");
        }

        activate(card);
        card.setRazorpayPaymentId(request.getRazorpayPaymentId());
        GiftCard saved = giftCardRepository.save(card);

        sendRecipientEmail(saved);
        sendPurchaserReceipt(saved);
        return saved;
    }

    @Transactional(readOnly = true)
    public GiftCardBalanceResponse getBalance(String rawCode) {
        String code = normalizeCode(rawCode);
        GiftCard card = giftCardRepository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> new EntityNotFoundException("Gift card not found"));
        return new GiftCardBalanceResponse(
                maskCode(card.getCode()),
                money(card.getBalance()),
                card.getCurrency(),
                card.getStatus(),
                card.getExpiresAt());
    }

    // ------------------------------------------------------------------
    // Cart / checkout support
    // ------------------------------------------------------------------

    /**
     * True when the card can be spent right now: ACTIVE, not expired and with
     * a positive balance.
     */
    public boolean isRedeemable(GiftCard card) {
        if (card == null || card.getCode() == null) {
            return false;
        }
        if (!GiftCard.STATUS_ACTIVE.equals(card.getStatus())) {
            return false;
        }
        if (card.getExpiresAt() != null && card.getExpiresAt().isBefore(LocalDateTime.now())) {
            return false;
        }
        return card.getBalance() != null && card.getBalance().compareTo(BigDecimal.ZERO) > 0;
    }

    /**
     * Looks a code up without complaining; used by cart recalculation, which
     * silently drops a card that has stopped being valid.
     */
    @Transactional(readOnly = true)
    public Optional<GiftCard> findRedeemable(String rawCode) {
        if (rawCode == null || rawCode.isBlank()) {
            return Optional.empty();
        }
        return giftCardRepository.findByCodeIgnoreCase(normalizeCode(rawCode))
                .filter(this::isRedeemable);
    }

    /**
     * Looks a code up for "apply to cart" and explains why it cannot be used.
     */
    @Transactional(readOnly = true)
    public GiftCard requireRedeemable(String rawCode) {
        String code = normalizeCode(rawCode);
        GiftCard card = giftCardRepository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> new IllegalArgumentException("We could not find a gift card with that code."));

        String status = card.getStatus();
        if (GiftCard.STATUS_PENDING_PAYMENT.equals(status)) {
            throw new IllegalArgumentException("This gift card has not been paid for yet.");
        }
        if (GiftCard.STATUS_DISABLED.equals(status)) {
            throw new IllegalArgumentException("This gift card has been disabled.");
        }
        if (GiftCard.STATUS_DEPLETED.equals(status)
                || card.getBalance() == null
                || card.getBalance().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("This gift card has no remaining balance.");
        }
        if (card.getExpiresAt() != null && card.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("This gift card expired on "
                    + card.getExpiresAt().format(EXPIRY_FORMAT) + ".");
        }
        if (!GiftCard.STATUS_ACTIVE.equals(status)) {
            throw new IllegalArgumentException("This gift card cannot be used right now.");
        }
        return card;
    }

    /**
     * Debits {@code amount} from the card inside the caller's transaction,
     * holding a row lock so concurrent checkouts cannot overspend. Marks the
     * card DEPLETED when the balance reaches zero.
     */
    @Transactional(rollbackFor = Exception.class)
    public GiftCard redeem(String rawCode, BigDecimal amount) {
        BigDecimal debit = money(amount);
        if (debit.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Gift card redemption amount must be positive.");
        }

        GiftCard card = giftCardRepository.findByCodeIgnoreCaseForUpdate(normalizeCode(rawCode))
                .orElseThrow(() -> new IllegalArgumentException("The applied gift card no longer exists."));

        if (!isRedeemable(card)) {
            throw new IllegalArgumentException("The applied gift card is no longer valid. Please remove it and try again.");
        }
        BigDecimal balance = money(card.getBalance());
        if (balance.compareTo(debit) < 0) {
            throw new IllegalArgumentException("The applied gift card no longer covers the amount. Please re-apply it and try again.");
        }

        BigDecimal remaining = balance.subtract(debit).setScale(2, RoundingMode.HALF_UP);
        card.setBalance(remaining);
        if (remaining.compareTo(BigDecimal.ZERO) == 0) {
            card.setStatus(GiftCard.STATUS_DEPLETED);
        }
        return giftCardRepository.save(card);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<GiftCard> list(int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 200);
        return giftCardRepository.findAll(
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @Transactional(rollbackFor = Exception.class)
    public GiftCard issue(AdminIssueGiftCardRequest request, String adminEmail) {
        BigDecimal amount = normalizeAmount(request.getAmount());
        String recipientEmail = normalizeEmail(request.getRecipientEmail(), "recipientEmail");
        String recipientName = requireText(request.getRecipientName(), "recipientName", 120);

        GiftCard card = new GiftCard();
        card.setInitialAmount(amount);
        card.setCurrency(CURRENCY);
        card.setRecipientName(recipientName);
        card.setRecipientEmail(recipientEmail);
        card.setMessage(optionalText(request.getMessage(), 500));
        card.setNote(optionalText(request.getNote(), 2000));
        card.setTheme(DEFAULT_THEME);
        card.setIssuedBy(adminEmail);
        card.setStatus(GiftCard.STATUS_PENDING_PAYMENT);

        activate(card);
        GiftCard saved = giftCardRepository.save(card);

        sendRecipientEmail(saved);
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public GiftCard disable(UUID id) {
        GiftCard card = giftCardRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Gift card not found"));
        card.setStatus(GiftCard.STATUS_DISABLED);
        return giftCardRepository.save(card);
    }

    // ------------------------------------------------------------------
    // Mapping
    // ------------------------------------------------------------------

    public GiftCardDTO toDTO(GiftCard card) {
        if (card == null) return null;
        GiftCardDTO dto = new GiftCardDTO();
        dto.setId(card.getId());
        dto.setCode(card.getCode());
        dto.setInitialAmount(money(card.getInitialAmount()));
        dto.setBalance(money(card.getBalance()));
        dto.setCurrency(card.getCurrency());
        dto.setRecipientName(card.getRecipientName());
        dto.setRecipientEmail(card.getRecipientEmail());
        dto.setMessage(card.getMessage());
        dto.setTheme(card.getTheme());
        dto.setStatus(card.getStatus());
        dto.setExpiresAt(card.getExpiresAt());
        dto.setCreatedAt(card.getCreatedAt());
        return dto;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /** Sets ACTIVE, assigns a fresh unique code, balance = initialAmount, expiry = now + 12 months. */
    private void activate(GiftCard card) {
        LocalDateTime now = LocalDateTime.now();
        card.setCode(generateUniqueCode());
        card.setBalance(money(card.getInitialAmount()));
        card.setStatus(GiftCard.STATUS_ACTIVE);
        card.setExpiresAt(now.plusMonths(VALIDITY_MONTHS));
    }

    private String generateUniqueCode() {
        String code;
        do {
            code = randomCode();
        } while (giftCardRepository.existsByCode(code));
        return code;
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder("CL");
        for (int group = 0; group < CODE_GROUPS; group++) {
            sb.append('-');
            for (int i = 0; i < CODE_GROUP_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
        }
        return sb.toString();
    }

    /** CL-ABCD-EFGH-JKLM -> CL-****-****-JKLM */
    static String maskCode(String code) {
        if (code == null) return null;
        int lastDash = code.lastIndexOf('-');
        String tail = lastDash >= 0 ? code.substring(lastDash + 1) : code;
        return "CL-****-****-" + tail;
    }

    /**
     * Trims, upper-cases, strips whitespace, and re-inserts the dashes when a
     * customer typed the 12 characters without them.
     */
    static String normalizeCode(String rawCode) {
        if (rawCode == null) {
            throw new IllegalArgumentException("A gift card code is required.");
        }
        String code = rawCode.trim().toUpperCase().replaceAll("\\s+", "");
        if (code.isEmpty()) {
            throw new IllegalArgumentException("A gift card code is required.");
        }
        String compact = code.replace("-", "");
        if (compact.length() == 14 && compact.startsWith("CL")) {
            code = "CL-" + compact.substring(2, 6) + "-" + compact.substring(6, 10) + "-" + compact.substring(10, 14);
        }
        return code;
    }

    private static BigDecimal normalizeAmount(BigDecimal amount) {
        if (amount == null) {
            throw new IllegalArgumentException("An amount is required.");
        }
        BigDecimal whole;
        try {
            whole = amount.setScale(0, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("Gift card amounts must be a whole number of rupees.");
        }
        if (whole.compareTo(MIN_AMOUNT) < 0) {
            throw new IllegalArgumentException("Gift card amounts start at INR 500.");
        }
        if (whole.compareTo(MAX_AMOUNT) > 0) {
            throw new IllegalArgumentException("Gift card amounts may not exceed INR 1,00,000.");
        }
        return whole.setScale(2, RoundingMode.HALF_UP);
    }

    private static int toPaise(BigDecimal rupees) {
        return rupees.multiply(HUNDRED).setScale(0, RoundingMode.HALF_UP).intValueExact();
    }

    private static String normalizeTheme(String theme) {
        if (theme == null || theme.isBlank()) {
            return DEFAULT_THEME;
        }
        String t = theme.trim().toLowerCase();
        if (!THEMES.contains(t)) {
            throw new IllegalArgumentException("Theme must be one of classic, gold or ruby.");
        }
        return t;
    }

    private static String normalizeEmail(String email, String field) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        String e = email.trim().toLowerCase();
        int at = e.indexOf('@');
        if (at < 1 || at == e.length() - 1 || e.contains(" ")) {
            throw new IllegalArgumentException(field + " must be a valid email address.");
        }
        return e;
    }

    private static String requireText(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        String v = value.trim();
        if (v.length() > maxLength) {
            throw new IllegalArgumentException(field + " may not exceed " + maxLength + " characters.");
        }
        return v;
    }

    private static String optionalText(String value, int maxLength) {
        if (value == null) return null;
        String v = value.trim();
        if (v.isEmpty()) return null;
        if (v.length() > maxLength) {
            throw new IllegalArgumentException("Text may not exceed " + maxLength + " characters.");
        }
        return v;
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------
    // Emails (inline HTML; never allowed to fail the business operation)
    // ------------------------------------------------------------------

    private void sendRecipientEmail(GiftCard card) {
        try {
            String subject = (card.getPurchaserEmail() != null
                    ? "You've received a Caratloop gift card"
                    : "Your Caratloop gift card");
            EmailNotification notification = new EmailNotification();
            notification.setType("GIFT_CARD");
            notification.setEmail(card.getRecipientEmail());
            notification.setSubject(subject);
            notification.setData(baseData(card));
            notification.setHtmlContent(buildRecipientHtml(card));
            emailService.sendEmail(notification);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Gift card " + card.getId() + ": recipient email could not be sent", e);
        }
    }

    private void sendPurchaserReceipt(GiftCard card) {
        if (card.getPurchaserEmail() == null || card.getPurchaserEmail().isBlank()) {
            return;
        }
        try {
            EmailNotification notification = new EmailNotification();
            notification.setType("GIFT_CARD");
            notification.setEmail(card.getPurchaserEmail());
            notification.setSubject("Your Caratloop gift card receipt");
            notification.setData(baseData(card));
            notification.setHtmlContent(buildPurchaserHtml(card));
            emailService.sendEmail(notification);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Gift card " + card.getId() + ": purchaser receipt could not be sent", e);
        }
    }

    private Map<String, String> baseData(GiftCard card) {
        Map<String, String> data = new HashMap<>();
        data.put("giftCardId", String.valueOf(card.getId()));
        data.put("code", maskCode(card.getCode()));
        data.put("amount", formatInr(card.getInitialAmount()));
        data.put("recipientName", card.getRecipientName() == null ? "" : card.getRecipientName());
        data.put("expiresAt", card.getExpiresAt() == null ? "" : card.getExpiresAt().format(EXPIRY_FORMAT));
        return data;
    }

    private String buildRecipientHtml(GiftCard card) {
        String name = escapeHtml(card.getRecipientName());
        String amount = escapeHtml(formatInr(card.getInitialAmount()));
        String code = escapeHtml(card.getCode());
        String expires = card.getExpiresAt() == null ? "" : escapeHtml(card.getExpiresAt().format(EXPIRY_FORMAT));
        String from = card.getPurchaserEmail() == null ? "Caratloop" : escapeHtml(card.getPurchaserEmail());
        String redeemUrl = escapeHtml(trimSlash(frontendUrl) + "/products");
        String balanceUrl = escapeHtml(trimSlash(frontendUrl) + "/gift-card");

        StringBuilder html = new StringBuilder();
        html.append(emailHeader(card.getTheme()));
        html.append("<p style=\"margin:0 0 16px;font-size:16px;\">Dear ").append(name).append(",</p>");
        html.append("<p style=\"margin:0 0 16px;\">").append(from)
            .append(" has sent you a Caratloop gift card worth <strong>").append(amount).append("</strong>.</p>");
        if (card.getMessage() != null && !card.getMessage().isBlank()) {
            html.append("<blockquote style=\"margin:0 0 20px;padding:12px 16px;border-left:3px solid #c9a44c;")
                .append("background:#faf7f0;font-style:italic;\">")
                .append(escapeHtml(card.getMessage()).replace("\n", "<br>"))
                .append("</blockquote>");
        }
        html.append(codeBlock(code, amount, expires));
        html.append("<h3 style=\"margin:24px 0 8px;font-size:15px;\">How to redeem</h3>");
        html.append("<ol style=\"margin:0 0 16px;padding-left:20px;line-height:1.6;\">")
            .append("<li>Browse <a href=\"").append(redeemUrl).append("\" style=\"color:#8a6d1f;\">caratloop</a> and add your favourites to the cart.</li>")
            .append("<li>Sign in, open your cart and choose <strong>Apply gift card</strong>.</li>")
            .append("<li>Enter the code above. The balance is applied to your total; any remainder can be paid online.</li>")
            .append("</ol>");
        html.append("<p style=\"margin:0 0 8px;font-size:13px;color:#666;\">Unused balance stays on the card until ")
            .append(expires.isEmpty() ? "it expires" : expires)
            .append(". Check your balance any time at <a href=\"").append(balanceUrl)
            .append("\" style=\"color:#8a6d1f;\">").append(balanceUrl).append("</a>.</p>");
        html.append(emailFooter());
        return html.toString();
    }

    private String buildPurchaserHtml(GiftCard card) {
        String amount = escapeHtml(formatInr(card.getInitialAmount()));
        String code = escapeHtml(card.getCode());
        String recipientName = escapeHtml(card.getRecipientName());
        String recipientEmail = escapeHtml(card.getRecipientEmail());
        String expires = card.getExpiresAt() == null ? "" : escapeHtml(card.getExpiresAt().format(EXPIRY_FORMAT));
        String paymentId = card.getRazorpayPaymentId() == null ? "" : escapeHtml(card.getRazorpayPaymentId());
        String orderId = card.getRazorpayOrderId() == null ? "" : escapeHtml(card.getRazorpayOrderId());

        StringBuilder html = new StringBuilder();
        html.append(emailHeader(card.getTheme()));
        html.append("<p style=\"margin:0 0 16px;font-size:16px;\">Thank you for your purchase.</p>");
        html.append("<p style=\"margin:0 0 16px;\">Your gift card worth <strong>").append(amount)
            .append("</strong> has been activated and emailed to <strong>").append(recipientName)
            .append("</strong> (").append(recipientEmail).append(").</p>");
        html.append(codeBlock(code, amount, expires));
        html.append("<table style=\"border-collapse:collapse;margin:20px 0;font-size:13px;\">")
            .append(row("Amount paid", amount))
            .append(row("Recipient", recipientName + " &lt;" + recipientEmail + "&gt;"))
            .append(row("Razorpay order", orderId))
            .append(row("Razorpay payment", paymentId))
            .append(row("Valid until", expires))
            .append("</table>");
        html.append("<p style=\"margin:0 0 8px;font-size:13px;color:#666;\">Keep this email as your receipt. ")
            .append("The code is shown so you can pass it on in person if the recipient's email does not arrive.</p>");
        html.append(emailFooter());
        return html.toString();
    }

    private static String emailHeader(String theme) {
        String accent = "ruby".equals(theme) ? "#9b1b30" : "gold".equals(theme) ? "#b8860b" : "#1c1c1c";
        return "<div style=\"font-family:Georgia,'Times New Roman',serif;max-width:600px;margin:0 auto;"
                + "padding:32px 28px;color:#222;background:#ffffff;\">"
                + "<div style=\"border-bottom:2px solid " + accent + ";padding-bottom:12px;margin-bottom:24px;\">"
                + "<span style=\"font-size:22px;letter-spacing:3px;text-transform:uppercase;color:" + accent + ";\">Caratloop</span>"
                + "<div style=\"font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;margin-top:4px;\">Gift card</div>"
                + "</div>";
    }

    private static String codeBlock(String code, String amount, String expires) {
        return "<div style=\"margin:20px 0;padding:20px;border:1px solid #e3d7b8;border-radius:8px;"
                + "background:linear-gradient(135deg,#fffdf7,#f6efe0);text-align:center;\">"
                + "<div style=\"font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;\">Gift card code</div>"
                + "<div style=\"font-size:26px;letter-spacing:3px;font-weight:bold;margin:8px 0;color:#1c1c1c;\">" + code + "</div>"
                + "<div style=\"font-size:14px;color:#444;\">Value " + amount
                + (expires.isEmpty() ? "" : " &middot; Valid until " + expires) + "</div>"
                + "</div>";
    }

    private static String row(String label, String value) {
        return "<tr><td style=\"padding:6px 16px 6px 0;color:#666;\">" + label
                + "</td><td style=\"padding:6px 0;\">" + value + "</td></tr>";
    }

    private static String emailFooter() {
        return "<p style=\"margin:24px 0 0;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px;\">"
                + "Gift cards are redeemable only on caratloop, are not exchangeable for cash and cannot be reloaded. "
                + "If you did not expect this email, please ignore it.</p>"
                + "</div>";
    }

    private static String formatInr(BigDecimal amount) {
        BigDecimal value = money(amount);
        String plain = value.setScale(0, RoundingMode.HALF_UP).toPlainString();
        // Indian grouping: 1,00,000
        StringBuilder sb = new StringBuilder();
        int len = plain.length();
        if (len <= 3) {
            sb.append(plain);
        } else {
            String last3 = plain.substring(len - 3);
            String rest = plain.substring(0, len - 3);
            StringBuilder grouped = new StringBuilder();
            while (rest.length() > 2) {
                grouped.insert(0, "," + rest.substring(rest.length() - 2));
                rest = rest.substring(0, rest.length() - 2);
            }
            grouped.insert(0, rest);
            sb.append(grouped).append(',').append(last3);
        }
        return "INR " + sb;
    }

    private static String trimSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&': sb.append("&amp;"); break;
                case '<': sb.append("&lt;"); break;
                case '>': sb.append("&gt;"); break;
                case '"': sb.append("&quot;"); break;
                case '\'': sb.append("&#39;"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }
}
