package com.jewelry.backend.service;

import com.jewelry.backend.dto.AcceptQuoteResponse;
import com.jewelry.backend.dto.NegotiationRequestDTO;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.RFQItem;
import com.jewelry.backend.entity.RFQQuote;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.RFQQuoteRepository;
import com.jewelry.backend.repository.RFQRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.logging.Logger;

@Service
public class RFQService {

    private static final Logger LOGGER = Logger.getLogger(RFQService.class.getName());

    @Autowired
    RFQRepository rfqRepository;

    @Autowired
    RFQQuoteRepository rfqQuoteRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    ManualOrderService manualOrderService;

    @Transactional(rollbackFor = Exception.class)
    public RFQ createRequest(String userEmail, RFQ rfq) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        rfq.setUser(user);
        rfq.setStatus("PENDING");
        // BaseEntity auditing handles createdAt, but for immediate use we might set it if needed.
        // Spring Data JPA auditing works on save.

        rfq.setRfqNumber("RFQ-" + System.currentTimeMillis() + "-" + new Random().nextInt(1000));

        if (rfq.getItems() != null) {
            for (RFQItem item : rfq.getItems()) {
                item.setRfq(rfq);
            }
        }

        return rfqRepository.save(rfq);
    }

    public RFQ getRequest(UUID id) {
        return rfqRepository.findById(id).orElseThrow(() -> new RuntimeException("RFQ not found"));
    }

    public RFQ getRequestByNumber(String rfqNumber) {
        return rfqRepository.findByRfqNumber(rfqNumber).orElseThrow(() -> new RuntimeException("RFQ not found"));
    }

    /** Admin pipeline list: every request, optionally one status ("ALL" or blank means no filter). */
    public Page<RFQ> getAllRequests(String status, Pageable pageable) {
        if (status != null && !status.isBlank() && !status.equalsIgnoreCase("ALL")) {
            return rfqRepository.findByStatus(status.trim().toUpperCase(), pageable);
        }
        return rfqRepository.findAll(pageable);
    }

    public Page<RFQ> getUserRequests(UUID userId, String status, Pageable pageable) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        if (status != null && !status.isEmpty()) {
            return rfqRepository.findByUserAndStatus(user, status, pageable);
        }
        return rfqRepository.findByUser(user, pageable);
    }

    @Transactional(rollbackFor = Exception.class)
    public RFQ updateRequest(UUID id, Map<String, Object> updates) {
        RFQ rfq = getRequest(id);
        if (updates.containsKey("companyName")) rfq.setCompanyName((String) updates.get("companyName"));
        if (updates.containsKey("additionalNotes")) rfq.setAdditionalNotes((String) updates.get("additionalNotes"));
        if (updates.containsKey("email")) rfq.setEmail((String) updates.get("email"));
        if (updates.containsKey("deliveryTimeline")) rfq.setDeliveryTimeline((String) updates.get("deliveryTimeline"));

        return rfqRepository.save(rfq);
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancelRequest(UUID id) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("CANCELLED");
        rfqRepository.save(rfq);
    }

    public RFQQuote getLatestQuote(UUID id) {
        RFQ rfq = getRequest(id);
        return rfq.getQuotes().stream()
                .filter(q -> q.getCreatedAt() != null)
                .max(Comparator.comparing(RFQQuote::getCreatedAt))
                .orElse(rfq.getQuotes().isEmpty() ? null : rfq.getQuotes().get(0));
    }

    public Page<RFQQuote> getAllQuotes(UUID id, Pageable pageable) {
        RFQ rfq = getRequest(id);
        return rfqQuoteRepository.findByRfq(rfq, pageable);
    }

    public byte[] generateQuotePdf(UUID id) {
        return "Mock PDF Content".getBytes();
    }

    @Transactional(rollbackFor = Exception.class)
    public RFQQuote createQuote(UUID id, java.math.BigDecimal proposedPrice, String notes) {
        if (proposedPrice == null || proposedPrice.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Proposed price must be greater than zero");
        }
        
        RFQ rfq = getRequest(id);

        RFQQuote quote = new RFQQuote();
        quote.setRfq(rfq);
        quote.setQuoteAmount(proposedPrice);
        quote.setNotes(notes);
        quote.setAccepted(false);

        rfq.setStatus("QUOTED");

        RFQQuote savedQuote = rfqQuoteRepository.save(quote);
        rfqRepository.save(rfq);

        return savedQuote;
    }

    /**
     * Accepts the latest quote and turns it into a PENDING_PAYMENT order:
     * one line per RFQ item (the catalogue product when it still exists,
     * otherwise a custom line), the quoted total spread over the lines in
     * proportion to their target price (or list price, or quantity), tax by
     * the category rules and shipping by the cart rules. The Razorpay order
     * for the total is created here so the storefront can open the checkout
     * at once; payment completes through the verify / webhook path.
     *
     * Idempotent: accepting an already accepted quote returns its order.
     */
    @Transactional(rollbackFor = Exception.class)
    public AcceptQuoteResponse acceptQuote(UUID id) {
        RFQ rfq = getRequest(id);
        String status = rfq.getStatus() == null ? "" : rfq.getStatus().trim().toUpperCase();

        List<Order> existing = orderRepository.findByRfqIdOrderByCreatedAtDesc(rfq.getId());
        if (!existing.isEmpty()) {
            return paymentFor(existing.get(0));
        }
        if ("REJECTED".equals(status) || "CANCELLED".equals(status)) {
            throw new IllegalArgumentException("This quote request is " + status.toLowerCase() + " and cannot be accepted.");
        }
        RFQQuote quote = getLatestQuote(id);
        if (quote == null || quote.getQuoteAmount() == null || quote.getQuoteAmount().signum() <= 0) {
            throw new IllegalArgumentException("There is no quote to accept yet.");
        }
        if (quote.getValidUntil() != null && quote.getValidUntil().isBefore(java.time.LocalDate.now())) {
            throw new IllegalArgumentException("This quote expired on " + quote.getValidUntil() + ". Please ask for a fresh one.");
        }
        if (rfq.getUser() == null) {
            throw new IllegalArgumentException("The quote request has no customer account to bill.");
        }

        List<ManualOrderService.Line> lines = linesFor(rfq, quote.getQuoteAmount());
        Order order = manualOrderService.create(rfq.getUser(), lines, rfq, null, null, null,
                "Created from quote " + rfq.getRfqNumber());

        quote.setAccepted(true);
        rfqQuoteRepository.save(quote);
        rfq.setStatus("ACCEPTED");
        rfqRepository.save(rfq);
        return paymentFor(order);
    }

    private AcceptQuoteResponse paymentFor(Order order) {
        String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim().toUpperCase();
        if (!"PENDING_PAYMENT".equals(orderStatus)) {
            return new AcceptQuoteResponse(order.getId(), order.getOrderNumber(), order.getStatus(), null, null, "INR",
                    order.getTotal() == null ? BigDecimal.ZERO : order.getTotal());
        }
        try {
            ManualOrderService.PaymentOrder payment = manualOrderService.ensureGatewayOrder(order);
            return new AcceptQuoteResponse(order.getId(), order.getOrderNumber(), order.getStatus(),
                    payment.razorpayOrderId(), payment.amount(), payment.currency(), payment.amountInr());
        } catch (IllegalStateException e) {
            // Gateway not configured / unreachable: the order exists, the
            // storefront retries through POST /orders/{id}/payment-order.
            LOGGER.warning("RFQ order " + order.getOrderNumber() + ": Razorpay order not created: " + e.getMessage());
            return new AcceptQuoteResponse(order.getId(), order.getOrderNumber(), order.getStatus(), null, null, "INR",
                    order.getTotal() == null ? BigDecimal.ZERO : order.getTotal());
        }
    }

    /**
     * Spreads the quoted total over the RFQ items. Weights: the customer's
     * target price when given, else the product's list price, else 1 per
     * piece. The last line absorbs the rounding so the lines add up to the
     * quote exactly.
     */
    List<ManualOrderService.Line> linesFor(RFQ rfq, BigDecimal quoteAmount) {
        List<RFQItem> items = rfq.getItems() == null ? List.of() : rfq.getItems();
        BigDecimal quote = quoteAmount.setScale(2, RoundingMode.HALF_UP);
        if (items.isEmpty()) {
            return List.of(new ManualOrderService.Line(null, "Quote " + rfq.getRfqNumber(), 1, quote));
        }
        List<Product> products = new ArrayList<>();
        List<BigDecimal> weights = new ArrayList<>();
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (RFQItem item : items) {
            Product product = item.getProductId() == null ? null : productRepository.findById(item.getProductId()).orElse(null);
            products.add(product);
            int qty = Math.max(item.getQuantity(), 1);
            BigDecimal unit = item.getTargetPrice() != null && item.getTargetPrice().signum() > 0 ? item.getTargetPrice()
                    : product != null && product.getPrice() != null && product.getPrice().signum() > 0 ? product.getPrice()
                    : BigDecimal.ONE;
            BigDecimal weight = unit.multiply(BigDecimal.valueOf(qty));
            weights.add(weight);
            totalWeight = totalWeight.add(weight);
        }
        List<ManualOrderService.Line> lines = new ArrayList<>();
        BigDecimal allocated = BigDecimal.ZERO;
        for (int i = 0; i < items.size(); i++) {
            RFQItem item = items.get(i);
            Product product = products.get(i);
            int qty = Math.max(item.getQuantity(), 1);
            BigDecimal lineTotal;
            if (i == items.size() - 1) {
                lineTotal = quote.subtract(allocated);
            } else {
                lineTotal = totalWeight.signum() > 0
                        ? quote.multiply(weights.get(i)).divide(totalWeight, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
            }
            BigDecimal unitPrice = lineTotal.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP);
            // Keep the per-line total exact where the unit price rounds: the
            // last unit is priced with the remainder only when qty is 1;
            // otherwise the invoice round-off line carries the paise.
            allocated = allocated.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            String description = item.getDescription() != null && !item.getDescription().isBlank()
                    ? item.getDescription().trim()
                    : product != null ? product.getName() : "Custom piece (" + rfq.getRfqNumber() + ")";
            lines.add(new ManualOrderService.Line(product, description, qty, unitPrice));
        }
        return lines;
    }

    @Transactional(rollbackFor = Exception.class)
    public void rejectQuote(UUID id, String reason) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("REJECTED");
        // Could log reason to a history table or update additionalNotes
        if (reason != null && !reason.isEmpty()) {
            rfq.setAdditionalNotes(rfq.getAdditionalNotes() + "\nRejection Reason: " + reason);
        }
        rfqRepository.save(rfq);
    }

    @Transactional(rollbackFor = Exception.class)
    public void negotiate(UUID id, NegotiationRequestDTO request) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("NEGOTIATING");
        if (request.getNotes() != null) {
            rfq.setAdditionalNotes(rfq.getAdditionalNotes() + "\nNegotiation: " + request.getNotes());
        }
        rfqRepository.save(rfq);
    }

    public long getTotalCount() {
        return rfqRepository.count();
    }

    public long getCountByStatus(String status) {
        return rfqRepository.countByStatus(status);
    }
}
