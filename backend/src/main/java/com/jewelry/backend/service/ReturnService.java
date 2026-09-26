package com.jewelry.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.ReturnDtos.CreateReturnRequest;
import com.jewelry.backend.dto.ReturnDtos.EligibilityDTO;
import com.jewelry.backend.dto.ReturnDtos.EligibleLineDTO;
import com.jewelry.backend.dto.ReturnDtos.ExchangeItemDTO;
import com.jewelry.backend.dto.ReturnDtos.ExchangeItemRequest;
import com.jewelry.backend.dto.ReturnDtos.LineRequest;
import com.jewelry.backend.dto.ReturnDtos.ReceiveLine;
import com.jewelry.backend.dto.ReturnDtos.ReceiveRequest;
import com.jewelry.backend.dto.ReturnDtos.ReturnLineDTO;
import com.jewelry.backend.dto.ReturnDtos.ReturnRequestDTO;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.ReturnLine;
import com.jewelry.backend.entity.ReturnRequest;
import com.jewelry.backend.entity.ReturnSequence;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.ReturnRequestRepository;
import com.jewelry.backend.repository.ReturnSequenceRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.security.StaffPermissions;
import com.jewelry.backend.service.notification.NotificationEvent;
import com.jewelry.backend.service.notification.NotificationService;
import com.jewelry.backend.service.notification.Recipient;
import com.jewelry.backend.util.EmailText;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Returns and exchanges (RMA).
 *
 * A customer raises a request on a DELIVERED / COMPLETED order within
 * {@code returnWindowDays} (setting, 7) for products that are returnable.
 * Staff approve (optionally with a restocking fee) or reject, mark the
 * lines received at the counter, then resolve: REFUND goes back through
 * Razorpay (cumulative order.refundedAmount), STORE_CREDIT becomes a gift
 * card, EXCHANGE becomes a gift card applied to a replacement order. Only
 * received lines are restocked, the order moves to RETURNED (partial) or
 * REFUNDED (everything back), and a credit note per RMA is queued for the
 * ERP with refund_paid = the gateway refund.
 */
@Service
public class ReturnService {

    private static final Logger LOGGER = Logger.getLogger(ReturnService.class.getName());
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Set<String> RETURNABLE_ORDER_STATUSES = Set.of("DELIVERED", "COMPLETED", "RETURNED");
    private static final Set<String> RESOLUTIONS = Set.of(
            ReturnRequest.RESOLUTION_REFUND, ReturnRequest.RESOLUTION_STORE_CREDIT, ReturnRequest.RESOLUTION_EXCHANGE);
    private static final TypeReference<List<ExchangeItemRequest>> EXCHANGE_ITEMS = new TypeReference<>() {
    };

    @Autowired
    ReturnRequestRepository returnRepository;

    @Autowired
    ReturnSequenceRepository sequenceRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    PaymentService paymentService;

    @Autowired
    GiftCardService giftCardService;

    @Autowired
    ErpSyncService erpSyncService;

    @Autowired
    LoyaltyService loyaltyService;

    @Autowired
    ManualOrderService manualOrderService;

    @Autowired
    NotificationService notificationService;

    @Autowired
    AccessService access;

    @Autowired
    ObjectMapper objectMapper;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    // ------------------------------------------------------------------
    // Eligibility
    // ------------------------------------------------------------------

    public int returnWindowDays() {
        try {
            int days = globalSettingRepository.findBySettingKey("returnWindowDays")
                    .map(s -> s.getSettingValue())
                    .filter(v -> v != null && !v.isBlank())
                    .map(v -> Integer.parseInt(v.trim()))
                    .orElse(7);
            return days < 0 ? 0 : days;
        } catch (NumberFormatException e) {
            return 7;
        }
    }

    /** What the owner may still return on this order, and why not when nothing. */
    @Transactional(readOnly = true)
    public EligibilityDTO eligibility(Order order) {
        EligibilityDTO out = new EligibilityDTO();
        out.setOrderId(order.getId());
        out.setOrderNumber(order.getOrderNumber());
        int days = returnWindowDays();
        out.setWindowDays(days);
        out.setLines(new ArrayList<>());

        String status = order.getStatus() == null ? "" : order.getStatus().trim().toUpperCase(Locale.ROOT);
        if (!RETURNABLE_ORDER_STATUSES.contains(status)) {
            out.setEligible(false);
            out.setReason("REFUNDED".equals(status) ? "This order has already been refunded."
                    : "Returns can be requested once the order has been delivered.");
            return out;
        }
        LocalDateTime delivered = deliveredAt(order);
        LocalDate windowEnd = delivered.toLocalDate().plusDays(days);
        out.setWindowEnds(windowEnd);
        if (LocalDate.now(INDIA).isAfter(windowEnd)) {
            out.setEligible(false);
            out.setReason("The " + days + "-day return window closed on " + windowEnd + ".");
        }

        Map<UUID, Integer> alreadyReturned = returnedQuantities(order.getId(), null);
        boolean any = false;
        for (OrderItem item : order.getItems() == null ? List.<OrderItem>of() : order.getItems()) {
            EligibleLineDTO line = new EligibleLineDTO();
            line.setOrderItemId(item.getId());
            Product product = item.getProduct();
            line.setProductId(product == null ? null : product.getId());
            line.setName(itemName(item));
            line.setSku(product == null ? null : product.getSku());
            line.setImage(product == null || product.getImages() == null || product.getImages().isEmpty() ? null : product.getImages().get(0));
            line.setQuantity(item.getQuantity());
            line.setUnitPrice(money(item.getPrice()));
            boolean returnable = product == null || !Boolean.FALSE.equals(product.getReturnable());
            int left = Math.max(item.getQuantity() - alreadyReturned.getOrDefault(item.getId(), 0), 0);
            line.setReturnable(returnable && left > 0);
            line.setReturnableQuantity(returnable ? left : 0);
            if (!returnable) {
                line.setReason("This piece is not returnable (made to order or final sale).");
            } else if (left <= 0) {
                line.setReason("Already returned or under an open return request.");
            }
            if (line.isReturnable()) {
                any = true;
            }
            out.getLines().add(line);
        }
        if (out.getReason() == null) {
            out.setEligible(any);
            if (!any) {
                out.setReason(out.getLines().isEmpty() ? "This order has no returnable lines." : "Every line of this order has been returned already.");
            }
        }
        return out;
    }

    /** Delivery time: the stamp set on DELIVERED, else the row's last update (orders that pre-date the column). */
    static LocalDateTime deliveredAt(Order order) {
        if (order.getDeliveredAt() != null) {
            return order.getDeliveredAt();
        }
        if (order.getUpdatedAt() != null) {
            return order.getUpdatedAt();
        }
        return order.getCreatedAt() == null ? LocalDateTime.now() : order.getCreatedAt();
    }

    /** Quantity per order item tied up in open or completed returns (optionally ignoring one request). */
    private Map<UUID, Integer> returnedQuantities(UUID orderId, UUID ignoreRequestId) {
        Map<UUID, Integer> out = new HashMap<>();
        for (ReturnRequest r : returnRepository.findByOrderIdAndStatusIn(orderId, ReturnRequest.OPEN_OR_DONE)) {
            if (ignoreRequestId != null && ignoreRequestId.equals(r.getId())) {
                continue;
            }
            for (ReturnLine l : r.getLines()) {
                if (l.getOrderItem() != null) {
                    out.merge(l.getOrderItem().getId(), l.getQuantity(), Integer::sum);
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Customer
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest create(String userEmail, UUID orderId, CreateReturnRequest request) {
        User user = userRepository.findByEmail(userEmail).orElseThrow(() -> new EntityNotFoundException("User not found"));
        Order order = orderRepository.findById(orderId).orElseThrow(() -> new EntityNotFoundException("Order not found"));
        if (order.getUser() == null || !order.getUser().getId().equals(user.getId())) {
            throw new EntityNotFoundException("Order not found");
        }
        if (request == null || request.getLines() == null || request.getLines().isEmpty()) {
            throw new IllegalArgumentException("Choose at least one item to return.");
        }
        EligibilityDTO eligibility = eligibility(order);
        if (!eligibility.isEligible()) {
            throw new IllegalArgumentException(eligibility.getReason());
        }
        Map<UUID, EligibleLineDTO> eligible = new HashMap<>();
        for (EligibleLineDTO l : eligibility.getLines()) {
            eligible.put(l.getOrderItemId(), l);
        }
        Map<UUID, OrderItem> items = new HashMap<>();
        for (OrderItem item : order.getItems()) {
            items.put(item.getId(), item);
        }

        ReturnRequest rma = new ReturnRequest();
        rma.setOrder(order);
        rma.setUser(user);
        rma.setStatus(ReturnRequest.STATUS_REQUESTED);
        rma.setReason(parseReason(request.getReason()));
        rma.setReasonNote(clip(request.getReasonNote(), 2000));
        String resolution = request.getResolution() == null ? "" : request.getResolution().trim().toUpperCase(Locale.ROOT);
        if (!RESOLUTIONS.contains(resolution)) {
            throw new IllegalArgumentException("Choose a resolution: refund, store credit or exchange.");
        }
        rma.setResolution(resolution);

        Set<UUID> seen = new java.util.HashSet<>();
        for (LineRequest lr : request.getLines()) {
            if (lr == null || lr.getOrderItemId() == null) {
                throw new IllegalArgumentException("Each return line needs an order item.");
            }
            if (!seen.add(lr.getOrderItemId())) {
                throw new IllegalArgumentException("An item is listed twice.");
            }
            EligibleLineDTO e = eligible.get(lr.getOrderItemId());
            OrderItem item = items.get(lr.getOrderItemId());
            if (e == null || item == null) {
                throw new IllegalArgumentException("That item is not part of this order.");
            }
            if (!e.isReturnable()) {
                throw new IllegalArgumentException(e.getName() + ": " + e.getReason());
            }
            if (lr.getQuantity() < 1 || lr.getQuantity() > e.getReturnableQuantity()) {
                throw new IllegalArgumentException(e.getName() + ": you can return up to " + e.getReturnableQuantity() + ".");
            }
            ReturnLine line = new ReturnLine();
            line.setReturnRequest(rma);
            line.setOrderItem(item);
            line.setQuantity(lr.getQuantity());
            line.setUnitPrice(money(item.getPrice()));
            line.setReceived(false);
            rma.getLines().add(line);
        }

        if (ReturnRequest.RESOLUTION_EXCHANGE.equals(resolution)) {
            List<ExchangeItemRequest> wanted = request.getExchangeItems();
            if (wanted == null || wanted.isEmpty()) {
                throw new IllegalArgumentException("Choose the piece(s) you would like in exchange.");
            }
            List<ExchangeItemRequest> cleaned = new ArrayList<>();
            for (ExchangeItemRequest w : wanted) {
                if (w == null || w.getProductId() == null) {
                    throw new IllegalArgumentException("Each exchange line needs a product.");
                }
                Product p = productRepository.findById(w.getProductId())
                        .orElseThrow(() -> new IllegalArgumentException("A chosen exchange product no longer exists."));
                if (Boolean.FALSE.equals(p.getPublished())) {
                    throw new IllegalArgumentException(p.getName() + " is not available at the moment.");
                }
                ExchangeItemRequest c = new ExchangeItemRequest();
                c.setProductId(p.getId());
                c.setQuantity(Math.max(w.getQuantity(), 1));
                cleaned.add(c);
            }
            rma.setExchangeItemsJson(toJson(cleaned));
        }

        rma.setRestockingFee(BigDecimal.ZERO.setScale(2));
        rma.setRefundAmount(value(order, rma.getLines()));
        rma.setRmaNumber(nextRmaNumber());
        ReturnRequest saved = returnRepository.save(rma);
        LOGGER.info("Return " + saved.getRmaNumber() + " requested on order " + order.getOrderNumber()
                + " (" + resolution + ", " + saved.getRefundAmount() + ")");
        return saved;
    }

    @Transactional(readOnly = true)
    public List<ReturnRequest> mine(String userEmail) {
        User user = userRepository.findByEmail(userEmail).orElse(null);
        return user == null ? List.of() : returnRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest cancelByCustomer(String userEmail, String rmaNumber) {
        ReturnRequest rma = returnRepository.findByRmaNumberIgnoreCase(rmaNumber == null ? "" : rmaNumber.trim())
                .orElseThrow(() -> new EntityNotFoundException("Return request not found"));
        if (rma.getUser() == null || userEmail == null || !userEmail.equalsIgnoreCase(rma.getUser().getEmail())) {
            throw new EntityNotFoundException("Return request not found");
        }
        if (!cancellable(rma)) {
            throw new IllegalArgumentException("A " + rma.getStatus().toLowerCase(Locale.ROOT) + " return cannot be cancelled.");
        }
        rma.setStatus(ReturnRequest.STATUS_CANCELLED);
        rma.setClosedAt(LocalDateTime.now());
        return returnRepository.save(rma);
    }

    static boolean cancellable(ReturnRequest rma) {
        return ReturnRequest.STATUS_REQUESTED.equals(rma.getStatus()) || ReturnRequest.STATUS_APPROVED.equals(rma.getStatus());
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<ReturnRequest> list(String status, String q, int page, int size) {
        String s = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status) ? null : status.trim().toUpperCase(Locale.ROOT);
        String like = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200));
        return returnRepository.search(s, like, pageable);
    }

    @Transactional(readOnly = true)
    public Map<String, Long> stats() {
        Map<String, Long> out = new LinkedHashMap<>();
        for (String s : ReturnRequest.STATUSES) {
            out.put(s, 0L);
        }
        for (Object[] row : returnRepository.countGroupedByStatus()) {
            if (row[0] != null) {
                out.merge(row[0].toString(), ((Number) row[1]).longValue(), Long::sum);
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public ReturnRequest get(UUID id) {
        return returnRepository.findById(id).orElseThrow(() -> new EntityNotFoundException("Return request not found"));
    }

    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest approve(UUID id, BigDecimal restockingFee, String note) {
        ReturnRequest rma = get(id);
        requireStatus(rma, ReturnRequest.STATUS_REQUESTED);
        BigDecimal fee = money(restockingFee);
        if (fee.signum() < 0) {
            throw new IllegalArgumentException("The restocking fee cannot be negative.");
        }
        BigDecimal gross = value(rma.getOrder(), rma.getLines());
        if (fee.compareTo(gross) > 0) {
            throw new IllegalArgumentException("The restocking fee cannot exceed the value of the return (" + gross + ").");
        }
        rma.setRestockingFee(fee);
        rma.setRefundAmount(gross.subtract(fee));
        rma.setAdminNote(appendNote(rma.getAdminNote(), note));
        rma.setStatus(ReturnRequest.STATUS_APPROVED);
        rma.setApprovedAt(LocalDateTime.now());
        ReturnRequest saved = returnRepository.save(rma);
        notify(NotificationEvent.RETURN_APPROVED, saved, approvedParams(saved));
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest reject(UUID id, String note) {
        ReturnRequest rma = get(id);
        if (!ReturnRequest.STATUS_REQUESTED.equals(rma.getStatus()) && !ReturnRequest.STATUS_APPROVED.equals(rma.getStatus())
                && !ReturnRequest.STATUS_RECEIVED.equals(rma.getStatus())) {
            throw new IllegalArgumentException("A " + rma.getStatus().toLowerCase(Locale.ROOT) + " return cannot be rejected.");
        }
        if (note == null || note.isBlank()) {
            throw new IllegalArgumentException("Give the customer a reason for the rejection.");
        }
        rma.setAdminNote(appendNote(rma.getAdminNote(), note));
        rma.setStatus(ReturnRequest.STATUS_REJECTED);
        rma.setClosedAt(LocalDateTime.now());
        ReturnRequest saved = returnRepository.save(rma);
        Map<String, String> params = baseParams(saved);
        params.put("reason", EmailText.escape(note.trim()));
        notify(NotificationEvent.RETURN_REJECTED, saved, params);
        return saved;
    }

    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest receive(UUID id, ReceiveRequest request) {
        ReturnRequest rma = get(id);
        if (!ReturnRequest.STATUS_APPROVED.equals(rma.getStatus()) && !ReturnRequest.STATUS_RECEIVED.equals(rma.getStatus())) {
            throw new IllegalArgumentException("Approve the return before recording what came back.");
        }
        Map<UUID, ReturnLine> lines = new HashMap<>();
        for (ReturnLine l : rma.getLines()) {
            lines.put(l.getId(), l);
        }
        if (request != null && request.getLines() != null) {
            for (ReceiveLine rl : request.getLines()) {
                if (rl == null || rl.getLineId() == null) {
                    continue;
                }
                ReturnLine line = lines.get(rl.getLineId());
                if (line == null) {
                    throw new IllegalArgumentException("Line " + rl.getLineId() + " is not part of this return.");
                }
                if (rl.getReceived() != null) {
                    line.setReceived(rl.getReceived());
                }
                if (rl.getCondition() != null) {
                    line.setCondition(clip(rl.getCondition().trim().toUpperCase(Locale.ROOT).replace(' ', '_'), 32));
                }
            }
        }
        boolean any = rma.getLines().stream().anyMatch(l -> Boolean.TRUE.equals(l.getReceived()));
        if (!any) {
            throw new IllegalArgumentException("Mark at least one line as received.");
        }
        rma.setAdminNote(appendNote(rma.getAdminNote(), request == null ? null : request.getNote()));
        rma.setStatus(ReturnRequest.STATUS_RECEIVED);
        rma.setReceivedAt(LocalDateTime.now());
        return returnRepository.save(rma);
    }

    /**
     * Settles a RECEIVED return by its resolution. Needs orders.refund (money
     * or credit leaves the shop). Received lines only are valued, refunded
     * and restocked; lines that never came back are dropped from the value.
     */
    @Transactional(rollbackFor = Exception.class)
    public ReturnRequest resolve(UUID id, String note) {
        if (!access.isSystemContext() && !access.has(StaffPermissions.ORDERS_REFUND)) {
            throw new AccessDeniedException("Resolving a return requires the orders.refund permission.");
        }
        ReturnRequest rma = get(id);
        requireStatus(rma, ReturnRequest.STATUS_RECEIVED);
        Order order = rma.getOrder();
        List<ReturnLine> received = rma.getLines().stream().filter(l -> Boolean.TRUE.equals(l.getReceived())).toList();
        if (received.isEmpty()) {
            throw new IllegalArgumentException("Mark at least one line as received before resolving.");
        }
        BigDecimal amount = value(order, received).subtract(money(rma.getRestockingFee())).max(BigDecimal.ZERO);
        rma.setRefundAmount(amount);
        rma.setAdminNote(appendNote(rma.getAdminNote(), note));

        BigDecimal gatewayRefund = BigDecimal.ZERO;
        String actor = access.currentEmailOr("system");
        User customer = rma.getUser() != null ? rma.getUser() : order.getUser();
        String customerName = customerName(rma);
        String customerEmail = customer == null ? null : customer.getEmail();

        switch (rma.getResolution()) {
            case ReturnRequest.RESOLUTION_REFUND -> {
                gatewayRefund = refundThroughGateway(order, rma, amount);
                BigDecimal rest = amount.subtract(gatewayRefund);
                if (rest.signum() > 0 && order.getAppliedGiftCard() != null && money(order.getGiftCardAmount()).signum() > 0) {
                    // Part of the order was paid with a gift card: that part goes back onto the card.
                    BigDecimal toCard = rest.min(money(order.getGiftCardAmount()));
                    try {
                        giftCardService.recredit(order.getAppliedGiftCard(), toCard);
                        rma.setStoreCreditGiftCardCode(order.getAppliedGiftCard());
                    } catch (IllegalArgumentException e) {
                        LOGGER.warning("Return " + rma.getRmaNumber() + ": gift card " + order.getAppliedGiftCard()
                                + " could not be re-credited: " + e.getMessage());
                    }
                }
                rma.setStatus(ReturnRequest.STATUS_REFUNDED);
            }
            case ReturnRequest.RESOLUTION_STORE_CREDIT -> {
                if (amount.signum() > 0) {
                    GiftCard card = giftCardService.issueReturnCredit(rma.getId(), rma.getRmaNumber(), amount,
                            customerName, customerEmail, actor);
                    rma.setStoreCreditGiftCardCode(card.getCode());
                }
                rma.setStatus(ReturnRequest.STATUS_REFUNDED);
            }
            case ReturnRequest.RESOLUTION_EXCHANGE -> {
                String code = null;
                if (amount.signum() > 0) {
                    GiftCard card = giftCardService.issueReturnCredit(rma.getId(), rma.getRmaNumber(), amount,
                            customerName, customerEmail, actor);
                    code = card.getCode();
                    rma.setStoreCreditGiftCardCode(code);
                }
                Order replacement = manualOrderService.create(customer, exchangeLines(rma), null, code,
                        order.getShippingAddress(), order.getBillingAddress(),
                        "Exchange for " + rma.getRmaNumber() + " (order " + order.getOrderNumber() + ")");
                rma.setExchangeOrderId(replacement.getId());
                if ("PENDING_PAYMENT".equals(replacement.getStatus())) {
                    try {
                        manualOrderService.ensureGatewayOrder(replacement);
                    } catch (IllegalStateException e) {
                        LOGGER.warning("Exchange order " + replacement.getOrderNumber() + ": Razorpay order not created: " + e.getMessage());
                    }
                }
                rma.setStatus(ReturnRequest.STATUS_EXCHANGED);
            }
            default -> throw new IllegalArgumentException("Unknown resolution: " + rma.getResolution());
        }
        rma.setRefundedViaGateway(gatewayRefund);

        restock(received);
        boolean everythingBack = everythingReturned(order, rma);
        order.setStatus(everythingBack ? "REFUNDED" : "RETURNED");
        if (everythingBack) {
            order.setRestocked(true);
            try {
                loyaltyService.reverseForOrder(order, "Return " + rma.getRmaNumber());
            } catch (RuntimeException e) {
                LOGGER.log(Level.WARNING, "Return " + rma.getRmaNumber() + ": loyalty points could not be reversed", e);
            }
        }
        orderRepository.save(order);

        if (amount.signum() > 0) {
            erpSyncService.enqueueReturnCreditNote(order, rma.getRmaNumber(), amount, gatewayRefund,
                    "Return " + rma.getRmaNumber() + ": " + reasonLabel(rma.getReason()));
        }

        rma.setResolvedAt(LocalDateTime.now());
        rma.setClosedAt(rma.getResolvedAt());
        ReturnRequest saved = returnRepository.save(rma);
        notify(NotificationEvent.RETURN_REFUNDED, saved, refundedParams(saved));
        LOGGER.info("Return " + saved.getRmaNumber() + " resolved: " + saved.getResolution() + " " + amount
                + " (gateway " + gatewayRefund + "), order " + order.getOrderNumber() + " -> " + order.getStatus());
        return saved;
    }

    /** Refunds up to what the gateway still holds for the order; 0 when it was not paid online. */
    private BigDecimal refundThroughGateway(Order order, ReturnRequest rma, BigDecimal amount) {
        String paymentId = order.getRazorpayPaymentId();
        if (paymentId == null || paymentId.isBlank() || amount.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal held = money(order.getTotal()).subtract(money(order.getRefundedAmount()));
        BigDecimal toRefund = amount.min(held);
        if (toRefund.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        String refundId = paymentService.refund(paymentId, toRefund,
                "Return " + rma.getRmaNumber() + " on order " + order.getOrderNumber());
        rma.setRazorpayRefundId(refundId);
        order.setRazorpayRefundId(refundId);
        order.setRefundedAmount(money(order.getRefundedAmount()).add(toRefund));
        return toRefund;
    }

    private void restock(List<ReturnLine> received) {
        for (ReturnLine line : received) {
            OrderItem item = line.getOrderItem();
            if (item == null || item.getProduct() == null || item.getProduct().getId() == null) {
                continue;
            }
            Product product = productRepository.findByIdWithPessimisticWrite(item.getProduct().getId()).orElse(null);
            if (product == null || product.getStock() == null) {
                continue;
            }
            product.setStock(product.getStock() + Math.max(line.getQuantity(), 0));
            productRepository.save(product);
        }
    }

    /** True when every unit of every line of the order has come back across completed returns (this one included). */
    private boolean everythingReturned(Order order, ReturnRequest current) {
        Map<UUID, Integer> back = new HashMap<>();
        for (ReturnRequest r : returnRepository.findByOrderIdAndStatusIn(order.getId(),
                List.of(ReturnRequest.STATUS_REFUNDED, ReturnRequest.STATUS_EXCHANGED))) {
            if (r.getId().equals(current.getId())) {
                continue;
            }
            for (ReturnLine l : r.getLines()) {
                if (Boolean.TRUE.equals(l.getReceived()) && l.getOrderItem() != null) {
                    back.merge(l.getOrderItem().getId(), l.getQuantity(), Integer::sum);
                }
            }
        }
        for (ReturnLine l : current.getLines()) {
            if (Boolean.TRUE.equals(l.getReceived()) && l.getOrderItem() != null) {
                back.merge(l.getOrderItem().getId(), l.getQuantity(), Integer::sum);
            }
        }
        for (OrderItem item : order.getItems()) {
            if (back.getOrDefault(item.getId(), 0) < item.getQuantity()) {
                return false;
            }
        }
        return !order.getItems().isEmpty();
    }

    private List<ManualOrderService.Line> exchangeLines(ReturnRequest rma) {
        List<ExchangeItemRequest> wanted = parseExchangeItems(rma.getExchangeItemsJson());
        if (wanted.isEmpty()) {
            throw new IllegalArgumentException("The return has no exchange items recorded.");
        }
        List<ManualOrderService.Line> lines = new ArrayList<>();
        for (ExchangeItemRequest w : wanted) {
            Product p = productRepository.findById(w.getProductId())
                    .orElseThrow(() -> new IllegalArgumentException("An exchange product no longer exists; ask the customer to choose again."));
            lines.add(new ManualOrderService.Line(p, p.getName(), Math.max(w.getQuantity(), 1), p.getPrice()));
        }
        return lines;
    }

    // ------------------------------------------------------------------
    // Valuation
    // ------------------------------------------------------------------

    /**
     * What the returned lines are worth to the customer: their price share
     * of the order after the order-level discount, plus the same share of
     * the tax charged. Capped at the invoice value.
     */
    static BigDecimal value(Order order, List<ReturnLine> lines) {
        BigDecimal subtotal = money(order.getSubtotal());
        if (subtotal.signum() <= 0) {
            subtotal = BigDecimal.ZERO;
            for (OrderItem item : order.getItems() == null ? List.<OrderItem>of() : order.getItems()) {
                subtotal = subtotal.add(money(item.getPrice()).multiply(BigDecimal.valueOf(item.getQuantity())));
            }
        }
        BigDecimal discount = money(order.getDiscount());
        BigDecimal net = subtotal.subtract(discount).max(BigDecimal.ZERO);
        BigDecimal tax = money(order.getTax());
        BigDecimal netFactor = subtotal.signum() > 0 ? net.divide(subtotal, 6, RoundingMode.HALF_UP) : BigDecimal.ONE;
        BigDecimal taxFactor = net.signum() > 0 ? tax.divide(net, 6, RoundingMode.HALF_UP) : BigDecimal.ZERO;

        BigDecimal value = BigDecimal.ZERO;
        for (ReturnLine line : lines) {
            BigDecimal unit = line.getUnitPrice() != null ? line.getUnitPrice()
                    : (line.getOrderItem() == null ? BigDecimal.ZERO : money(line.getOrderItem().getPrice()));
            BigDecimal gross = money(unit).multiply(BigDecimal.valueOf(Math.max(line.getQuantity(), 0)));
            value = value.add(gross.multiply(netFactor).multiply(BigDecimal.ONE.add(taxFactor)));
        }
        BigDecimal invoiceValue = money(order.getTotal()).add(money(order.getGiftCardAmount())).add(money(order.getTreasureAmount()));
        BigDecimal result = value.setScale(2, RoundingMode.HALF_UP);
        return invoiceValue.signum() > 0 ? result.min(invoiceValue) : result;
    }

    // ------------------------------------------------------------------
    // Notifications
    // ------------------------------------------------------------------

    private void notify(NotificationEvent event, ReturnRequest rma, Map<String, String> params) {
        try {
            User user = rma.getUser() != null ? rma.getUser() : (rma.getOrder() == null ? null : rma.getOrder().getUser());
            Recipient recipient = Recipient.of(user, rma.getRmaNumber());
            if (!recipient.hasEmail() && !recipient.hasPhone()) {
                return;
            }
            notificationService.notify(event, recipient, params);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Return " + rma.getRmaNumber() + ": " + event + " could not be sent", e);
        }
    }

    private Map<String, String> baseParams(ReturnRequest rma) {
        Map<String, String> p = new HashMap<>();
        p.put("customerName", EmailText.escape(customerName(rma)));
        p.put("rmaNumber", rma.getRmaNumber());
        p.put("orderNumber", rma.getOrder() == null ? "" : rma.getOrder().getOrderNumber());
        p.put("refundAmount", EmailText.inr(rma.getRefundAmount()));
        p.put("resolution", resolutionLabel(rma.getResolution()));
        p.put("resolutionText", resolutionLabel(rma.getResolution()));
        p.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
        return p;
    }

    private Map<String, String> approvedParams(ReturnRequest rma) {
        Map<String, String> p = baseParams(rma);
        StringBuilder rows = new StringBuilder();
        for (ReturnLine l : rma.getLines()) {
            rows.append("<tr><td style=\"padding:8px 0;border-bottom:1px solid #f0ebe0;\">")
                    .append(EmailText.escape(itemName(l.getOrderItem())))
                    .append("</td><td style=\"padding:8px 0;border-bottom:1px solid #f0ebe0;text-align:center;\">")
                    .append(l.getQuantity()).append("</td></tr>");
        }
        p.put("itemsHtml", rows.toString());
        BigDecimal fee = money(rma.getRestockingFee());
        p.put("feeText", fee.signum() > 0 ? " (after a restocking fee of " + EmailText.inr(fee) + ")" : "");
        return p;
    }

    private Map<String, String> refundedParams(ReturnRequest rma) {
        Map<String, String> p = baseParams(rma);
        String detail;
        switch (rma.getResolution()) {
            case ReturnRequest.RESOLUTION_STORE_CREDIT -> detail = rma.getStoreCreditGiftCardCode() == null
                    ? "Store credit has been issued to your account."
                    : "Your store credit code: " + rma.getStoreCreditGiftCardCode() + ". Enter it in the gift card field at checkout.";
            case ReturnRequest.RESOLUTION_EXCHANGE -> {
                Order replacement = rma.getExchangeOrderId() == null ? null : orderRepository.findById(rma.getExchangeOrderId()).orElse(null);
                detail = replacement == null ? "Your replacement order is being prepared."
                        : "PENDING_PAYMENT".equals(replacement.getStatus())
                        ? "Replacement order " + replacement.getOrderNumber() + " is ready; pay the balance of "
                            + EmailText.inr(replacement.getTotal()) + " from your account to release it."
                        : "Replacement order " + replacement.getOrderNumber() + " is confirmed.";
            }
            default -> detail = money(rma.getRefundedViaGateway()).signum() > 0
                    ? "Refunded to the original payment method; allow 5-7 working days."
                    : rma.getStoreCreditGiftCardCode() != null
                    ? "Re-credited to gift card " + rma.getStoreCreditGiftCardCode() + "."
                    : "The refund will be settled by the store.";
        }
        p.put("detailText", EmailText.escape(detail));
        return p;
    }

    // ------------------------------------------------------------------
    // Mapping
    // ------------------------------------------------------------------

    public ReturnRequestDTO toDTO(ReturnRequest r) {
        if (r == null) {
            return null;
        }
        ReturnRequestDTO dto = new ReturnRequestDTO();
        dto.setId(r.getId());
        dto.setRmaNumber(r.getRmaNumber());
        if (r.getOrder() != null) {
            dto.setOrderId(r.getOrder().getId());
            dto.setOrderNumber(r.getOrder().getOrderNumber());
            dto.setOrderStatus(r.getOrder().getStatus());
        }
        dto.setStatus(r.getStatus());
        dto.setReason(r.getReason() == null ? null : r.getReason().name());
        dto.setReasonNote(r.getReasonNote());
        dto.setResolution(r.getResolution());
        dto.setRefundAmount(r.getRefundAmount());
        dto.setRestockingFee(r.getRestockingFee());
        dto.setRefundedViaGateway(r.getRefundedViaGateway());
        dto.setRazorpayRefundId(r.getRazorpayRefundId());
        dto.setExchangeOrderId(r.getExchangeOrderId());
        if (r.getExchangeOrderId() != null) {
            orderRepository.findById(r.getExchangeOrderId()).ifPresent(o -> {
                dto.setExchangeOrderNumber(o.getOrderNumber());
                dto.setExchangeOrderStatus(o.getStatus());
            });
        }
        dto.setStoreCreditGiftCardCode(r.getStoreCreditGiftCardCode());
        List<ExchangeItemDTO> wanted = new ArrayList<>();
        for (ExchangeItemRequest w : parseExchangeItems(r.getExchangeItemsJson())) {
            ExchangeItemDTO e = new ExchangeItemDTO();
            e.setProductId(w.getProductId());
            e.setQuantity(w.getQuantity());
            productRepository.findById(w.getProductId()).ifPresent(p -> {
                e.setName(p.getName());
                e.setSku(p.getSku());
                e.setPrice(p.getPrice());
            });
            wanted.add(e);
        }
        dto.setExchangeItems(wanted);
        dto.setAdminNote(r.getAdminNote());
        dto.setCustomerName(customerName(r));
        User user = r.getUser() != null ? r.getUser() : (r.getOrder() == null ? null : r.getOrder().getUser());
        dto.setCustomerEmail(user == null ? null : user.getEmail());
        dto.setCustomerPhone(user == null ? null : user.getPhone());
        List<ReturnLineDTO> lines = new ArrayList<>();
        for (ReturnLine l : r.getLines()) {
            ReturnLineDTO ld = new ReturnLineDTO();
            ld.setId(l.getId());
            OrderItem item = l.getOrderItem();
            Product product = item == null ? null : item.getProduct();
            ld.setOrderItemId(item == null ? null : item.getId());
            ld.setProductId(product == null ? null : product.getId());
            ld.setName(itemName(item));
            ld.setSku(product == null ? null : product.getSku());
            ld.setImage(product == null || product.getImages() == null || product.getImages().isEmpty() ? null : product.getImages().get(0));
            ld.setQuantity(l.getQuantity());
            ld.setUnitPrice(l.getUnitPrice());
            ld.setCondition(l.getCondition());
            ld.setReceived(l.getReceived());
            lines.add(ld);
        }
        dto.setLines(lines);
        dto.setCreatedAt(r.getCreatedAt());
        dto.setUpdatedAt(r.getUpdatedAt());
        dto.setApprovedAt(r.getApprovedAt());
        dto.setReceivedAt(r.getReceivedAt());
        dto.setResolvedAt(r.getResolvedAt());
        dto.setClosedAt(r.getClosedAt());
        dto.setCancellable(cancellable(r));
        return dto;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private String nextRmaNumber() {
        String year = String.valueOf(LocalDateTime.now(INDIA).getYear());
        sequenceRepository.ensureRow(year);
        ReturnSequence sequence = sequenceRepository.lockByYear(year)
                .orElseThrow(() -> new IllegalStateException("Return sequence row missing for " + year));
        long next = sequence.getLastNumber() + 1;
        sequence.setLastNumber(next);
        sequenceRepository.save(sequence);
        return String.format("RMA-%s-%05d", year, next);
    }

    private static void requireStatus(ReturnRequest rma, String expected) {
        if (!expected.equals(rma.getStatus())) {
            throw new IllegalArgumentException("This return is " + rma.getStatus().toLowerCase(Locale.ROOT)
                    + "; it must be " + expected.toLowerCase(Locale.ROOT) + " for that.");
        }
    }

    private static ReturnRequest.Reason parseReason(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Tell us why you are returning the item.");
        }
        try {
            return ReturnRequest.Reason.valueOf(raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown return reason: " + raw);
        }
    }

    static String reasonLabel(ReturnRequest.Reason reason) {
        if (reason == null) return "return";
        return switch (reason) {
            case DAMAGED -> "damaged on arrival";
            case WRONG_ITEM -> "wrong item";
            case NOT_AS_DESCRIBED -> "not as described";
            case SIZE -> "size";
            case CHANGED_MIND -> "changed mind";
            case OTHER -> "other";
        };
    }

    static String resolutionLabel(String resolution) {
        if (resolution == null) return "Refund";
        return switch (resolution) {
            case ReturnRequest.RESOLUTION_STORE_CREDIT -> "Store credit";
            case ReturnRequest.RESOLUTION_EXCHANGE -> "Exchange";
            default -> "Refund";
        };
    }

    static String itemName(OrderItem item) {
        if (item == null) return "Item";
        if (item.getDescription() != null && !item.getDescription().isBlank()) return item.getDescription();
        return item.getProduct() == null || item.getProduct().getName() == null ? "Item" : item.getProduct().getName();
    }

    private static String customerName(ReturnRequest r) {
        User user = r.getUser() != null ? r.getUser() : (r.getOrder() == null ? null : r.getOrder().getUser());
        if (user == null) return "Customer";
        String name = ((user.getFirstName() == null ? "" : user.getFirstName().trim()) + " "
                + (user.getLastName() == null ? "" : user.getLastName().trim())).trim();
        return name.isEmpty() ? (user.getEmail() == null ? "Customer" : user.getEmail()) : name;
    }

    private List<ExchangeItemRequest> parseExchangeItems(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<ExchangeItemRequest> items = objectMapper.readValue(json, EXCHANGE_ITEMS);
            return items == null ? List.of() : items;
        } catch (Exception e) {
            LOGGER.warning("Unreadable exchange items JSON: " + e.getMessage());
            return List.of();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise exchange items", e);
        }
    }

    private static String appendNote(String existing, String note) {
        if (note == null || note.isBlank()) {
            return existing;
        }
        String line = LocalDate.now(INDIA) + ": " + note.trim();
        return existing == null || existing.isBlank() ? line : existing + "\n" + line;
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
