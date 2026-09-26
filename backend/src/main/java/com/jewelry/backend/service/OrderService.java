package com.jewelry.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.CreateOrderRequest;
import com.jewelry.backend.dto.OrderTracking;
import com.jewelry.backend.entity.*;
import com.jewelry.backend.repository.CartRepository;
import com.jewelry.backend.repository.OrderItemRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.security.StaffPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
public class OrderService {

    private static final Logger LOGGER = Logger.getLogger(OrderService.class.getName());

    @Autowired
    AccessService access;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    OrderItemRepository orderItemRepository;

    @Autowired
    CartRepository cartRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    CartService cartService;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    PaymentService paymentService;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    com.jewelry.backend.repository.CouponRepository couponRepository;

    @Autowired
    GiftCardService giftCardService;

    @Autowired
    OrderNotificationService orderNotificationService;

    @Autowired
    InvoiceService invoiceService;

    @Autowired
    ErpSyncService erpSyncService;

    @Autowired
    TreasurePlanService treasurePlanService;

    @Autowired
    LoyaltyService loyaltyService;

    @Autowired
    ManualOrderService manualOrderService;

    @Autowired
    com.jewelry.backend.repository.ReturnRequestRepository returnRequestRepository;

    // Income-tax Rule 114B (PAN mandatory) and Section 269ST (no cash receipt)
    // both bite at two lakh rupees per transaction.
    static final java.math.BigDecimal PAN_THRESHOLD = new java.math.BigDecimal("200000");
    private static final java.util.regex.Pattern PAN_FORMAT = java.util.regex.Pattern.compile("[A-Z]{5}[0-9]{4}[A-Z]");
    private static final java.util.regex.Pattern GSTIN_FORMAT =
            java.util.regex.Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$");

    @Transactional(rollbackFor = Exception.class)
    public Order createOrder(String userEmail, CreateOrderRequest request) {
        if (request.getPaymentDetails() != null && request.getPaymentDetails().getRazorpay_order_id() != null) {
            java.util.Optional<Order> existingOrder = orderRepository.findByRazorpayOrderId(request.getPaymentDetails().getRazorpay_order_id());
            if (existingOrder.isPresent()) {
                return existingOrder.get(); // Idempotency check: return existing order to avoid duplicates
            }
        } else if (request.getIdempotencyKey() != null) {
            java.util.Optional<Order> existingOrder = orderRepository.findByIdempotencyKey(request.getIdempotencyKey());
            if (existingOrder.isPresent()) {
                return existingOrder.get(); // COD idempotency check
            }
        }

        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Cart cart = cartService.getCart(userEmail);

        if (cart.getItems().isEmpty()) {
            throw new RuntimeException("Cart is empty");
        }

        // Compliance before anything is written. The payable value is the
        // invoice value before the gift card: the statutory limits look at
        // the transaction, not at how much of it was prepaid.
        String buyerPan = normalizeIdentifier(request.getBuyerPan());
        String buyerGstin = normalizeIdentifier(request.getBuyerGstin());
        if (buyerPan != null && !PAN_FORMAT.matcher(buyerPan).matches()) {
            throw new IllegalArgumentException("The PAN must be 10 characters in the form AAAAA9999A.");
        }
        if (buyerGstin != null && !GSTIN_FORMAT.matcher(buyerGstin).matches()) {
            throw new IllegalArgumentException("The GSTIN must be 15 characters, e.g. 08AAAAA9999A1Z5.");
        }
        java.math.BigDecimal payable = nz(cart.getSubtotal()).subtract(nz(cart.getDiscount()))
                .add(nz(cart.getTax())).add(nz(cart.getShipping()))
                .setScale(2, java.math.RoundingMode.HALF_UP);
        if (payable.compareTo(PAN_THRESHOLD) >= 0) {
            if (buyerPan == null) {
                throw new IllegalArgumentException(
                        "A PAN is required for purchases of ₹2,00,000 or more (Income-tax Rule 114B).");
            }
            if (isCodMethod(request.getPaymentMethod())) {
                throw new IllegalArgumentException(
                        "Cash on delivery is not available for purchases of ₹2,00,000 or more "
                                + "(Income-tax Act Section 269ST). Please pay online.");
            }
        }

        Order order = new Order();
        order.setUser(user);
        order.setBuyerPan(buyerPan);
        order.setBuyerGstin(buyerGstin);
        order.setTotal(cart.getTotal());
        order.setStatus("PENDING_PAYMENT");
        order.setOrderNumber("ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());

        order.setSubtotal(cart.getSubtotal());
        order.setTax(cart.getTax());
        order.setShipping(cart.getShipping());
        order.setDiscount(cart.getDiscount());
        order.setAppliedCoupon(cart.getAppliedCoupon());

        java.math.BigDecimal giftCardAmount = cart.getGiftCardAmount() == null
                ? java.math.BigDecimal.ZERO
                : cart.getGiftCardAmount().setScale(2, java.math.RoundingMode.HALF_UP);
        boolean giftCardApplied = cart.getAppliedGiftCard() != null
                && !cart.getAppliedGiftCard().isBlank()
                && giftCardAmount.compareTo(java.math.BigDecimal.ZERO) > 0;
        order.setAppliedGiftCard(giftCardApplied ? cart.getAppliedGiftCard() : null);
        order.setGiftCardAmount(giftCardApplied ? giftCardAmount : java.math.BigDecimal.ZERO);

        // Treasure plan (a payment) and loyalty points (a discount already in
        // cart.discount): copied now, settled below in the same transaction.
        java.math.BigDecimal treasureAmount = cart.getTreasureAmount() == null
                ? java.math.BigDecimal.ZERO : cart.getTreasureAmount().setScale(2, java.math.RoundingMode.HALF_UP);
        boolean treasureApplied = cart.getAppliedTreasureAccountId() != null
                && treasureAmount.compareTo(java.math.BigDecimal.ZERO) > 0;
        order.setAppliedTreasureAccountId(treasureApplied ? cart.getAppliedTreasureAccountId() : null);
        order.setTreasureAmount(treasureApplied ? treasureAmount : java.math.BigDecimal.ZERO);
        int pointsRedeemed = cart.getLoyaltyPointsRedeemed() == null ? 0 : cart.getLoyaltyPointsRedeemed();
        order.setLoyaltyPointsRedeemed(Math.max(pointsRedeemed, 0));
        order.setLoyaltyDiscount(cart.getLoyaltyDiscount() == null ? java.math.BigDecimal.ZERO : cart.getLoyaltyDiscount());

        try {
            order.setShippingAddress(objectMapper.writeValueAsString(request.getShippingAddress()));
            order.setBillingAddress(objectMapper.writeValueAsString(request.getBillingAddress()));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error serializing address", e);
        }

        order.setPaymentMethod(request.getPaymentMethod());
        order.setShippingMethod(request.getShippingMethod());
        order.setEstimatedDelivery(LocalDate.now().plusDays(7)); // Mock estimated delivery

        if (request.getPaymentDetails() != null) {
            order.setRazorpayOrderId(request.getPaymentDetails().getRazorpay_order_id());
            order.setRazorpayPaymentId(request.getPaymentDetails().getRazorpay_payment_id());
            order.setRazorpaySignature(request.getPaymentDetails().getRazorpay_signature());

            // Cryptographically verify the payment signature
            com.jewelry.backend.dto.VerifyPaymentRequest verifyReq = new com.jewelry.backend.dto.VerifyPaymentRequest();
            verifyReq.setOrderId(request.getPaymentDetails().getRazorpay_order_id());
            verifyReq.setPaymentId(request.getPaymentDetails().getRazorpay_payment_id());
            verifyReq.setPaymentToken(request.getPaymentDetails().getRazorpay_signature());

            try {
                paymentService.verifyPayment(verifyReq);
                order.setStatus("PAID");
            } catch (Exception e) {
                // Do not create order on failed payment, throw exception to trigger rollback
                throw new RuntimeException("Payment verification failed", e);
            }
        } else if ("COD".equalsIgnoreCase(request.getPaymentMethod()) || "CASH_ON_DELIVERY".equalsIgnoreCase(request.getPaymentMethod())) {
            // Cash on delivery is considered confirmed but not paid yet
            order.setStatus("CONFIRMED");
        }

        // A gift card or Treasure plan that covers the whole total is the payment.
        if ((giftCardApplied || treasureApplied) && order.getTotal() != null
                && order.getTotal().compareTo(java.math.BigDecimal.ZERO) <= 0) {
            order.setPaymentMethod(giftCardApplied ? "GIFT_CARD" : "TREASURE");
            order.setStatus("PAID");
        }

        if (request.getIdempotencyKey() != null) {
            order.setIdempotencyKey(request.getIdempotencyKey());
        }

        Order savedOrder = orderRepository.save(order);

        for (CartItem cartItem : cart.getItems()) {
            Product product = productRepository.findByIdWithPessimisticWrite(cartItem.getProduct().getId())
                    .orElseThrow(() -> new RuntimeException("Product not found"));

            if (product.getStock() != null && product.getStock() < cartItem.getQuantity()) {
                throw new RuntimeException("Insufficient stock for product: " + product.getName());
            }

            if (product.getStock() != null) {
                product.setStock(product.getStock() - cartItem.getQuantity());
                productRepository.save(product);
            }

            OrderItem orderItem = new OrderItem();
            orderItem.setOrder(savedOrder);
            orderItem.setProduct(product);
            orderItem.setQuantity(cartItem.getQuantity());
            orderItem.setPrice(product.getPrice());
            orderItem.setUnitCost(product.getCostPrice());
            orderItem.setOptions(cartItem.getOptions());

            orderItemRepository.save(orderItem);
            // Keep the in-memory order complete so the confirmation e-mail
            // (and the returned DTO) list the items without a reload.
            savedOrder.getItems().add(orderItem);
        }

        // Redeem the coupon before the cart is cleared.
        //
        // Coupon.timesUsed was read to enforce usageLimit but incremented
        // nowhere in the codebase, so the limit could never be reached: a
        // single-use launch code was redeemable without end, by everyone.
        String redeemed = cart.getAppliedCoupon();
        if (redeemed != null && !redeemed.isBlank()) {
            couponRepository.findByCodeIgnoreCase(redeemed).ifPresent(coupon -> {
                Integer used = coupon.getTimesUsed();
                coupon.setTimesUsed((used == null ? 0 : used) + 1);
                couponRepository.save(coupon);
            });
        }

        // Redeem the gift card in the same transaction: the row is locked,
        // status and balance are re-checked, and the card becomes DEPLETED
        // when its balance reaches zero. A failure here rolls the order back.
        if (giftCardApplied) {
            giftCardService.redeem(cart.getAppliedGiftCard(), giftCardAmount);
        }

        // Treasure plan: the account row is locked and its redeemable value
        // re-checked; it becomes REDEEMED (or keeps the rest redeemable).
        if (treasureApplied) {
            treasurePlanService.redeem(cart.getAppliedTreasureAccountId(), treasureAmount, savedOrder);
        }

        // Loyalty points burned on this order (REDEEM row; balance re-checked).
        loyaltyService.redeemForOrder(savedOrder);

        // Clear cart
        cart.getItems().clear();
        cart.setSubtotal(java.math.BigDecimal.ZERO);
        cart.setTotal(java.math.BigDecimal.ZERO);
        cart.setDiscount(java.math.BigDecimal.ZERO);
        cart.setTax(java.math.BigDecimal.ZERO);
        cart.setShipping(java.math.BigDecimal.ZERO);
        cart.setAppliedCoupon(null);
        cart.setAppliedGiftCard(null);
        cart.setGiftCardAmount(java.math.BigDecimal.ZERO);
        cart.setAppliedTreasureAccountId(null);
        cart.setTreasureAmount(java.math.BigDecimal.ZERO);
        cart.setLoyaltyPointsRedeemed(0);
        cart.setLoyaltyDiscount(java.math.BigDecimal.ZERO);
        cartRepository.save(cart);

        // Points are earned once the money is in; COD earns on DELIVERED.
        if ("PAID".equals(savedOrder.getStatus())) {
            loyaltyService.earnForOrder(savedOrder);
        }

        // Confirmation e-mail for orders that are already settled: online
        // payment verified above, gift card covering the total, or cash on
        // delivery (CONFIRMED counts as confirmed). A PENDING_PAYMENT order
        // gets its e-mail from the webhook / verify path when it becomes PAID.
        if ("PAID".equals(savedOrder.getStatus()) || "CONFIRMED".equals(savedOrder.getStatus())) {
            orderNotificationService.sendOrderConfirmation(savedOrder);
        }

        // GST invoice for a settled online order. Issued after this
        // transaction commits so it can never roll the payment back.
        if ("PAID".equals(savedOrder.getStatus())) {
            invoiceService.issueAfterCommit(savedOrder);
        }

        return savedOrder;
    }

    /** Uppercases and trims a PAN/GSTIN; blank becomes null. */
    private static String normalizeIdentifier(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim().toUpperCase();
        return value.isEmpty() ? null : value;
    }

    private static boolean isCodMethod(String paymentMethod) {
        return paymentMethod != null
                && ("COD".equalsIgnoreCase(paymentMethod.trim()) || "CASH_ON_DELIVERY".equalsIgnoreCase(paymentMethod.trim()));
    }

    private static java.math.BigDecimal nz(java.math.BigDecimal value) {
        return value == null ? java.math.BigDecimal.ZERO : value;
    }

    public Page<Order> getUserOrders(String userEmail, String status, Pageable pageable) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        if (status != null && !status.isEmpty() && !status.equalsIgnoreCase("ALL")) {
            return orderRepository.findByUserAndStatus(user, status, pageable);
        }
        return orderRepository.findByUser(user, pageable);
    }

    public Page<Order> getAllOrders(String status, Pageable pageable) {
        if (status != null && !status.isEmpty() && !status.equalsIgnoreCase("ALL")) {
            return orderRepository.findByStatus(status, pageable);
        }
        return orderRepository.findAll(pageable);
    }

    /** Admin order list chips: every known status (0 when none) plus any legacy value found in the table. */
    public Map<String, Long> getOrderStats() {
        Map<String, Long> stats = new LinkedHashMap<>();
        for (String status : STATUS_ORDER) {
            stats.put(status, 0L);
        }
        for (Object[] row : orderRepository.countGroupedByStatus()) {
            String status = row[0] == null ? "UNKNOWN" : row[0].toString().trim().toUpperCase();
            long count = row[1] == null ? 0L : ((Number) row[1]).longValue();
            stats.merge(status, count, Long::sum);
        }
        return stats;
    }

    public Order getOrder(UUID orderId) {
        return orderRepository.findById(orderId).orElseThrow(() -> new RuntimeException("Order not found"));
    }

    public Order getOrderByIdentifier(String identifier) {
        try {
            UUID id = UUID.fromString(identifier);
            return orderRepository.findById(id)
                .orElseGet(() -> orderRepository.findByOrderNumber(identifier)
                    .orElseThrow(() -> new RuntimeException("Order not found")));
        } catch (IllegalArgumentException e) {
            return orderRepository.findByOrderNumber(identifier).orElseThrow(() -> new RuntimeException("Order not found"));
        }
    }

    public OrderTracking trackOrder(String identifier) {
        Order order = getOrderByIdentifier(identifier);
        OrderTracking tracking = new OrderTracking();
        tracking.setOrderId(order.getId().toString());
        tracking.setOrderNumber(order.getOrderNumber());
        tracking.setStatus(order.getStatus());
        tracking.setEstimatedDelivery(order.getEstimatedDelivery());
        tracking.setTrackingNumber(order.getTrackingNumber());
        tracking.setHistory(List.of("Order Placed", "Payment Confirmed", "Processing")); // Mock history
        return tracking;
    }

    /**
     * Permitted order status transitions.
     *
     * There was no state machine: any string was accepted, so DELIVERED could
     * move back to PENDING_PAYMENT, CANCELLED to PAID, or a typo like
     * "delivered" could be stored -- after which the code that string-matches
     * "DELIVERED" and "COMPLETED" elsewhere behaves inconsistently.
     *
     * The admin UI offers only valid transitions (OrderDTO.nextStatuses is
     * derived from this map), but the API is the authority and must enforce
     * this independently of any client.
     *
     * CONFIRMED is what createOrder assigns to cash-on-delivery orders; it
     * had no entry here, so a COD order could never leave that state.
     */
    public static final Map<String, Set<String>> ALLOWED_TRANSITIONS =
            Map.of(
                    "PENDING_PAYMENT", Set.of("PAID", "CANCELLED"),
                    "CONFIRMED", Set.of("PROCESSING", "CANCELLED"),
                    "PAID", Set.of("PROCESSING", "CANCELLED", "REFUNDED"),
                    "PROCESSING", Set.of("SHIPPED", "CANCELLED"),
                    "SHIPPED", Set.of("DELIVERED"),
                    "DELIVERED", Set.of("RETURNED", "COMPLETED"),
                    "RETURNED", Set.of("REFUNDED"),
                    "COMPLETED", Set.of("RETURNED"),
                    "CANCELLED", Set.of(),
                    "REFUNDED", Set.of()
            );

    /** Display order for statuses (chips, action buttons, stats). */
    public static final List<String> STATUS_ORDER = List.of(
            "PENDING_PAYMENT", "CONFIRMED", "PAID", "PROCESSING", "SHIPPED",
            "DELIVERED", "COMPLETED", "RETURNED", "CANCELLED", "REFUNDED");

    /** Statuses an order in {@code current} may move to, in display order. */
    public static List<String> nextStatuses(String current) {
        String key = current == null ? "PENDING_PAYMENT" : current.trim().toUpperCase();
        Set<String> allowed = ALLOWED_TRANSITIONS.getOrDefault(key, Set.of());
        List<String> ordered = new ArrayList<>();
        for (String status : STATUS_ORDER) {
            if (allowed.contains(status)) {
                ordered.add(status);
            }
        }
        return ordered;
    }

    @Transactional(rollbackFor = Exception.class)
    public Order updateOrderStatus(UUID orderId, String status) {
        return updateOrderStatus(orderId, status, Map.of());
    }

    /**
     * Moves an order to {@code status} when ALLOWED_TRANSITIONS permits it.
     *
     * {@code details} may carry {@code trackingNumber}, {@code shippingMethod}
     * and {@code estimatedDelivery} (ISO date) for SHIPPED, and {@code reason}
     * for CANCELLED. Side effects: SHIPPED requires a tracking number;
     * CANCELLED restocks the items and re-credits an applied gift card; every
     * transition with a template sends the matching customer e-mail (never
     * failing the request).
     */
    @Transactional(rollbackFor = Exception.class)
    public Order updateOrderStatus(UUID orderId, String status, Map<String, String> details) {
        Order order = getOrder(orderId);
        Map<String, String> extra = details == null ? Map.of() : details;

        if (status == null || status.isBlank()) {
            throw new IllegalArgumentException("A status is required.");
        }

        String next = status.trim().toUpperCase();
        String current = order.getStatus() == null
                ? "PENDING_PAYMENT"
                : order.getStatus().trim().toUpperCase();

        if (next.equals(current)) {
            return order;
        }

        Set<String> allowed = ALLOWED_TRANSITIONS.getOrDefault(current, Set.of());

        if (!ALLOWED_TRANSITIONS.containsKey(next)) {
            throw new IllegalArgumentException("Unknown order status: " + next);
        }

        if (!allowed.contains(next)) {
            throw new IllegalArgumentException(
                    "An order cannot move from " + current + " to " + next + ".");
        }

        if ("REFUNDED".equals(next) && !access.isSystemContext() && !access.has(StaffPermissions.ORDERS_REFUND)) {
            // orders.write lets staff move an order along; returning money is
            // a separate permission (ACCOUNTS, MANAGER, ADMIN).
            throw new AccessDeniedException("Refunding an order requires the orders.refund permission.");
        }

        String reason = extra.get("reason");
        boolean moneyReturned = false;

        switch (next) {
            case "SHIPPED" -> applyShippingDetails(order, extra, true);
            case "RETURNED" -> restockOnce(order);
            case "REFUNDED" -> {
                // Gateway first: if Razorpay refuses, the IllegalStateException
                // aborts the whole transition and the order stays where it was.
                refundOnlinePayment(order, reason);
                recreditGiftCard(order);
                restoreTreasure(order);
                restockOnce(order);
                loyaltyService.reverseForOrder(order, reason);
                moneyReturned = true;
            }
            case "CANCELLED" -> {
                if ("PAID".equals(current)) {
                    refundOnlinePayment(order, reason);
                    moneyReturned = true;
                }
                restockOnce(order);
                recreditGiftCard(order);
                restoreTreasure(order);
                loyaltyService.reverseForOrder(order, reason);
            }
            case "DELIVERED" -> {
                // The returns window (ReturnService) counts from here.
                order.setDeliveredAt(java.time.LocalDateTime.now());
                // Cash on delivery: the money is in now, so the points are earned now.
                if (InvoiceService.isCashOnDelivery(order)) {
                    loyaltyService.earnForOrder(order);
                }
            }
            default -> { }
        }

        order.setStatus(next);
        Order saved = orderRepository.save(order);

        // Reverse the sale in the ERP when an invoiced order is refunded or
        // cancelled after payment. enqueueCreditNote is a no-op without an
        // invoice; partial returns settled through ReturnService already
        // carry their own credit notes, so only the remainder is reversed.
        if (moneyReturned) {
            invoiceService.findForOrder(saved.getId()).ifPresent(invoice -> {
                java.math.BigDecimal credited = java.math.BigDecimal.ZERO;
                for (ReturnRequest r : returnRequestRepository.findByOrderIdAndStatusIn(saved.getId(),
                        List.of(ReturnRequest.STATUS_REFUNDED, ReturnRequest.STATUS_EXCHANGED))) {
                    credited = credited.add(nz(r.getRefundAmount()));
                }
                java.math.BigDecimal amount = nz(invoice.getGrandTotal()).subtract(credited);
                if (amount.signum() > 0) {
                    erpSyncService.enqueueCreditNote(saved, amount,
                            "Refund: " + (reason == null || reason.isBlank() ? "order " + next.toLowerCase() : reason.trim()));
                }
            });
        }

        // Cash-on-delivery orders get their tax invoice when they ship;
        // anything else that is now eligible and somehow has none is caught
        // here too. Runs after commit and never fails the transition.
        if (invoiceService.isEligible(saved)) {
            invoiceService.issueAfterCommit(saved);
        }

        orderNotificationService.sendForStatus(saved, next, reason);
        return saved;
    }

    /**
     * Refunds what is left of order.total through Razorpay. Orders without a
     * gateway payment (COD, gift-card only) or already refunded in full are
     * left alone; a partial return (ReturnService) may have refunded part of
     * it already, in which case only the remainder goes back.
     */
    private void refundOnlinePayment(Order order, String reason) {
        String paymentId = order.getRazorpayPaymentId();
        if (paymentId == null || paymentId.isBlank()) {
            return;
        }
        java.math.BigDecimal total = nz(order.getTotal()).setScale(2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal already = nz(order.getRefundedAmount()).setScale(2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal amount = total.subtract(already);
        if (amount.signum() <= 0) {
            return;
        }
        String note = "Order " + order.getOrderNumber()
                + (reason == null || reason.isBlank() ? "" : ": " + reason.trim());
        String refundId = paymentService.refund(paymentId, amount, note);
        order.setRazorpayRefundId(refundId);
        order.setRefundedAmount(already.add(amount));
    }

    /**
     * Razorpay order for one of the customer's own orders that is still
     * PENDING_PAYMENT (an accepted quote, the balance of an exchange).
     * Created once and reused; payment completes through the verify /
     * webhook path like a checkout payment.
     */
    @Transactional(rollbackFor = Exception.class)
    public ManualOrderService.PaymentOrder paymentOrderFor(UUID orderId, String userEmail) {
        Order order = getOrder(orderId);
        boolean staff = access.has(StaffPermissions.ORDERS_WRITE);
        if (!staff && (order.getUser() == null || userEmail == null
                || !userEmail.equalsIgnoreCase(order.getUser().getEmail()))) {
            throw new jakarta.persistence.EntityNotFoundException("Order not found");
        }
        return manualOrderService.ensureGatewayOrder(order);
    }

    /**
     * One call for the admin "Mark shipped" button: records the tracking
     * details, then transitions to SHIPPED. An order that is already SHIPPED
     * just has its tracking details updated (no second e-mail).
     */
    @Transactional(rollbackFor = Exception.class)
    public Order shipOrder(UUID orderId, String trackingNumber, String shippingMethod, String estimatedDelivery) {
        if (trackingNumber == null || trackingNumber.isBlank()) {
            throw new IllegalArgumentException("Add a tracking number before marking the order shipped");
        }
        Map<String, String> details = new java.util.HashMap<>();
        details.put("trackingNumber", trackingNumber.trim());
        if (shippingMethod != null && !shippingMethod.isBlank()) {
            details.put("shippingMethod", shippingMethod.trim());
        }
        if (estimatedDelivery != null && !estimatedDelivery.isBlank()) {
            details.put("estimatedDelivery", estimatedDelivery.trim());
        }

        Order order = getOrder(orderId);
        if (order.getStatus() != null && "SHIPPED".equalsIgnoreCase(order.getStatus().trim())) {
            applyShippingDetails(order, details, false);
            return orderRepository.save(order);
        }
        return updateOrderStatus(orderId, "SHIPPED", details);
    }

    /** Copies tracking fields from the request onto the order; with {@code require}, insists a tracking number ends up set. */
    private static void applyShippingDetails(Order order, Map<String, String> details, boolean require) {
        String tracking = details.get("trackingNumber");
        if (tracking != null && !tracking.isBlank()) {
            order.setTrackingNumber(tracking.trim());
        }
        if (require && (order.getTrackingNumber() == null || order.getTrackingNumber().isBlank())) {
            throw new IllegalArgumentException("Add a tracking number before marking the order shipped");
        }

        String method = details.get("shippingMethod");
        if (method != null && !method.isBlank()) {
            order.setShippingMethod(method.trim());
        }

        String eta = details.get("estimatedDelivery");
        if (eta != null && !eta.isBlank()) {
            try {
                order.setEstimatedDelivery(LocalDate.parse(eta.trim()));
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("estimatedDelivery must be a date in the form YYYY-MM-DD");
            }
        }
    }

    /**
     * Adds each item's quantity back to Product.stock, once per order
     * (products without stock tracking are skipped). RETURNED followed by
     * REFUNDED would otherwise count the same pieces twice.
     */
    private void restockOnce(Order order) {
        if (Boolean.TRUE.equals(order.getRestocked())) {
            return;
        }
        order.setRestocked(true);
        if (order.getItems() == null) {
            return;
        }
        for (OrderItem item : order.getItems()) {
            if (item.getProduct() == null || item.getProduct().getId() == null) {
                continue;
            }
            Product product = productRepository.findByIdWithPessimisticWrite(item.getProduct().getId()).orElse(null);
            if (product == null || product.getStock() == null) {
                continue;
            }
            product.setStock(product.getStock() + Math.max(item.getQuantity(), 0));
            productRepository.save(product);
        }
    }

    /** Puts the redeemed Treasure balance and grams back on the plan; never fatal to the cancellation. */
    private void restoreTreasure(Order order) {
        try {
            treasurePlanService.restore(order);
        } catch (RuntimeException e) {
            LOGGER.log(Level.WARNING, "Order " + order.getOrderNumber() + ": Treasure plan could not be restored: " + e.getMessage());
        }
    }

    /** Returns the redeemed amount to the gift card; a missing card is logged, not fatal to the cancellation. */
    private void recreditGiftCard(Order order) {
        String code = order.getAppliedGiftCard();
        java.math.BigDecimal amount = order.getGiftCardAmount();
        if (code == null || code.isBlank() || amount == null || amount.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            return;
        }
        try {
            giftCardService.recredit(code, amount);
        } catch (IllegalArgumentException e) {
            LOGGER.log(Level.WARNING, "Order " + order.getOrderNumber() + ": gift card " + code
                    + " could not be re-credited: " + e.getMessage());
        }
    }

    public Order updateOrderTracking(UUID orderId, String trackingNumber) {
        Order order = getOrder(orderId);
        order.setTrackingNumber(trackingNumber);
        return orderRepository.save(order);
    }

    public Order updateOrderNotes(UUID orderId, String notes) {
        Order order = getOrder(orderId);
        order.setInternalNotes(notes);
        return orderRepository.save(order);
    }
}
