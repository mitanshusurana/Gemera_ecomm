package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.AddressDTO;
import com.jewelry.backend.entity.ErpSyncEvent;
import com.jewelry.backend.entity.ExchangeRequest;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.TreasureInstallment;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.ErpSyncEventRepository;
import com.jewelry.backend.repository.ExchangeRequestRepository;
import com.jewelry.backend.repository.GiftCardRepository;
import com.jewelry.backend.repository.InvoiceRepository;
import com.jewelry.backend.repository.OrderRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Outbox that pushes store invoices (sales), refunds (credit notes), old
 * gold purchases and Treasure plan installments (advances) to the ERP's
 * e-commerce integration endpoints.
 *
 * Writing the event is part of the order flow; delivering it is not. The
 * scheduler retries failed deliveries every five minutes, except after a
 * 409 (the ERP disagrees with our totals), which needs a human: those rows
 * wait for the admin's "sync now". With no ERP_BASE_URL / ERP_API_KEY the
 * rows simply accumulate as PENDING until the integration is switched on.
 */
@Service
public class ErpSyncService {

    private static final Logger LOGGER = Logger.getLogger(ErpSyncService.class.getName());

    static final int MAX_ATTEMPTS = 30;
    static final String NOT_CONFIGURED = "ERP integration is not configured";
    static final String SALES_PATH = "/api/v1/integrations/ecommerce/sales";
    static final String CREDIT_NOTES_PATH = "/api/v1/integrations/ecommerce/credit-notes";
    static final String OLD_GOLD_PATH = "/api/v1/integrations/ecommerce/old-gold-purchases";
    static final String ADVANCES_PATH = "/api/v1/integrations/ecommerce/advances";
    // lastError prefix that marks a totals mismatch (HTTP 409); flush() skips these.
    private static final String CONFLICT_PREFIX = "HTTP 409";

    @Value("${erp.base-url:}")
    private String baseUrl;

    @Value("${erp.api-key:}")
    private String apiKey;

    @Autowired
    ErpSyncEventRepository eventRepository;

    @Autowired
    InvoiceRepository invoiceRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    GiftCardRepository giftCardRepository;

    @Autowired
    ExchangeRequestRepository exchangeRequestRepository;

    @Autowired
    ObjectMapper objectMapper;

    private volatile RestClient restClient;
    private final AtomicBoolean unconfiguredLogged = new AtomicBoolean(false);

    public boolean isConfigured() {
        return baseUrl != null && !baseUrl.isBlank() && apiKey != null && !apiKey.isBlank();
    }

    // ------------------------------------------------------------------
    // Enqueue
    // ------------------------------------------------------------------

    /** Records the sale for the ERP; called once, right after the invoice is created. Idempotent. */
    @Transactional(rollbackFor = Exception.class)
    public ErpSyncEvent enqueueSale(Order order, Invoice invoice) {
        Optional<ErpSyncEvent> existing = eventRepository.findByOrderIdAndEventType(order.getId(), ErpSyncEvent.TYPE_SALE);
        if (existing.isPresent()) {
            return existing.get();
        }
        ErpSyncEvent event = newEvent(order, ErpSyncEvent.TYPE_SALE, salePayload(order, invoice));
        return eventRepository.save(event);
    }

    /**
     * Records a credit note against the order's invoice. Nothing is queued
     * when the order has no invoice (nothing to reverse in the ERP).
     * {@code refund_paid} is the money actually returned through Razorpay
     * (order.refundedAmount, 0 for COD / gift-card / Treasure settlements),
     * so the ERP posts a refund voucher only for what really went back.
     */
    @Transactional(rollbackFor = Exception.class)
    public Optional<ErpSyncEvent> enqueueCreditNote(Order order, BigDecimal amount, String reason) {
        Optional<Invoice> invoice = invoiceRepository.findByOrderId(order.getId());
        if (invoice.isEmpty()) {
            return Optional.empty();
        }
        Optional<ErpSyncEvent> existing = eventRepository.findByOrderIdAndEventType(order.getId(), ErpSyncEvent.TYPE_CREDIT_NOTE);
        if (existing.isPresent()) {
            return existing;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("external_ref", order.getOrderNumber());
        body.put("invoice_no", invoice.get().getInvoiceNumber());
        body.put("amount", money(amount));
        body.put("reason", reason == null || reason.isBlank() ? "Refund" : reason.trim());
        body.put("date", LocalDate.now(InvoiceService.INDIA).toString());
        body.put("refund_paid", money(order.getRefundedAmount()));
        ErpSyncEvent event = newEvent(order, ErpSyncEvent.TYPE_CREDIT_NOTE, toJson(body));
        return Optional.of(eventRepository.save(event));
    }

    /**
     * Credit note for one return (RMA): keyed on the RMA number so an order
     * can carry several partial returns. {@code refundPaid} is what went back
     * through the gateway (0 for store credit and exchanges). Empty when the
     * order has no invoice.
     */
    @Transactional(rollbackFor = Exception.class)
    public Optional<ErpSyncEvent> enqueueReturnCreditNote(Order order, String rmaNumber, BigDecimal amount,
                                                          BigDecimal refundPaid, String reason) {
        Optional<Invoice> invoice = invoiceRepository.findByOrderId(order.getId());
        if (invoice.isEmpty() || rmaNumber == null || rmaNumber.isBlank()) {
            return Optional.empty();
        }
        Optional<ErpSyncEvent> existing = eventRepository.findByReferenceAndEventType(rmaNumber, ErpSyncEvent.TYPE_CREDIT_NOTE);
        if (existing.isPresent()) {
            return existing;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("external_ref", rmaNumber);
        body.put("invoice_no", invoice.get().getInvoiceNumber());
        body.put("amount", money(amount));
        body.put("reason", reason == null || reason.isBlank() ? "Return " + rmaNumber : reason.trim());
        body.put("date", LocalDate.now(InvoiceService.INDIA).toString());
        body.put("refund_paid", money(refundPaid));
        ErpSyncEvent event = newEvent(order, ErpSyncEvent.TYPE_CREDIT_NOTE, toJson(body));
        event.setReference(rmaNumber);
        return Optional.of(eventRepository.save(event));
    }

    /**
     * Records a PAID Treasure plan installment as an advance receipt for the
     * ERP; called from TreasurePlanService.applyPayment. Idempotent per
     * installment.
     */
    @Transactional(rollbackFor = Exception.class)
    public ErpSyncEvent enqueueAdvance(TreasureInstallment installment) {
        Optional<ErpSyncEvent> existing = eventRepository.findByTreasureInstallmentIdAndEventType(
                installment.getId(), ErpSyncEvent.TYPE_ADVANCE);
        if (existing.isPresent()) {
            return existing.get();
        }
        ErpSyncEvent event = newEvent(null, ErpSyncEvent.TYPE_ADVANCE, advancePayload(installment));
        event.setTreasureInstallment(installment);
        return eventRepository.save(event);
    }

    /**
     * Records the RCM purchase of a customer's old gold for the ERP; called
     * when the exchange request is credited. Idempotent per request.
     */
    @Transactional(rollbackFor = Exception.class)
    public ErpSyncEvent enqueueOldGoldPurchase(ExchangeRequest request) {
        Optional<ErpSyncEvent> existing = eventRepository.findByExchangeRequestIdAndEventType(
                request.getId(), ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE);
        if (existing.isPresent()) {
            return existing.get();
        }
        ErpSyncEvent event = newEvent(null, ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE, oldGoldPayload(request));
        event.setExchangeRequest(request);
        return eventRepository.save(event);
    }

    /** Admin action for one exchange request: send its OLD_GOLD_PURCHASE now, ignoring the attempt cap. */
    public void syncExchangeNow(UUID exchangeRequestId) {
        if (!isConfigured()) {
            throw new IllegalStateException(NOT_CONFIGURED + ". Set ERP_BASE_URL and ERP_API_KEY on the API.");
        }
        ExchangeRequest request = exchangeRequestRepository.findById(exchangeRequestId)
                .orElseThrow(() -> new EntityNotFoundException("Exchange request not found"));
        if (!ExchangeRequest.STATUS_CREDITED.equals(request.getStatus())) {
            throw new IllegalArgumentException("Only a credited exchange is posted to the ERP.");
        }
        ErpSyncEvent event = eventRepository.findByExchangeRequestIdAndEventType(
                        exchangeRequestId, ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE)
                .orElseGet(() -> enqueueOldGoldPurchase(request));
        if (!ErpSyncEvent.STATUS_SENT.equals(event.getStatus())) {
            deliver(event);
        }
    }

    /** The outbox row for an exchange request, if any (admin detail view). */
    @Transactional(readOnly = true)
    public Optional<ErpSyncEvent> findExchangeEvent(UUID exchangeRequestId) {
        return eventRepository.findByExchangeRequestIdAndEventType(exchangeRequestId, ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE);
    }

    private ErpSyncEvent newEvent(Order order, String type, String payload) {
        ErpSyncEvent event = new ErpSyncEvent();
        event.setOrder(order);
        event.setEventType(type);
        event.setStatus(ErpSyncEvent.STATUS_PENDING);
        event.setAttempts(0);
        event.setPayload(payload);
        if (!isConfigured()) {
            event.setLastError(NOT_CONFIGURED);
        }
        return event;
    }

    // ------------------------------------------------------------------
    // Delivery
    // ------------------------------------------------------------------

    /** Scheduled delivery of everything still owed to the ERP, oldest first. */
    @Scheduled(fixedDelay = 300000, initialDelay = 60000)
    public void flush() {
        if (!isConfigured()) {
            if (unconfiguredLogged.compareAndSet(false, true)) {
                LOGGER.info(NOT_CONFIGURED + " (ERP_BASE_URL / ERP_API_KEY); outbox events stay PENDING.");
            }
            return;
        }
        List<ErpSyncEvent> due = eventRepository.findDeliverable(
                List.of(ErpSyncEvent.STATUS_PENDING, ErpSyncEvent.STATUS_FAILED), MAX_ATTEMPTS);
        for (ErpSyncEvent event : due) {
            if (event.getLastError() != null && event.getLastError().startsWith(CONFLICT_PREFIX)) {
                continue; // a totals mismatch does not fix itself; wait for syncNow
            }
            try {
                deliver(event);
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "ERP sync of event " + event.getId() + " threw", e);
            }
        }
    }

    /**
     * Admin action: send the order's SALE (queuing it first if the invoice
     * exists but no event does) and then any outstanding CREDIT_NOTE,
     * ignoring the attempt cap and the 409 hold.
     */
    public void syncNow(UUID orderId) {
        if (!isConfigured()) {
            throw new IllegalStateException(NOT_CONFIGURED + ". Set ERP_BASE_URL and ERP_API_KEY on the API.");
        }
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new EntityNotFoundException("Order not found"));
        Invoice invoice = invoiceRepository.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "The order has no tax invoice yet; it is issued once the order is paid "
                                + "(or shipped, for cash on delivery)."));

        ErpSyncEvent sale = eventRepository.findByOrderIdAndEventType(orderId, ErpSyncEvent.TYPE_SALE)
                .orElseGet(() -> enqueueSale(order, invoice));
        if (!ErpSyncEvent.STATUS_SENT.equals(sale.getStatus())) {
            deliver(sale);
        }
        eventRepository.findByOrderIdAndEventType(orderId, ErpSyncEvent.TYPE_CREDIT_NOTE)
                .filter(e -> !ErpSyncEvent.STATUS_SENT.equals(e.getStatus()))
                .ifPresent(this::deliver);
    }

    /**
     * One HTTP round trip and the resulting state change. Not transactional
     * on purpose: the call may take seconds and must not hold a connection.
     */
    private void deliver(ErpSyncEvent event) {
        String type = event.getEventType();
        boolean oldGold = ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE.equals(type);
        boolean advance = ErpSyncEvent.TYPE_ADVANCE.equals(type);
        String path = ErpSyncEvent.TYPE_SALE.equals(type) ? SALES_PATH
                : oldGold ? OLD_GOLD_PATH
                : advance ? ADVANCES_PATH
                : CREDIT_NOTES_PATH;
        String referenceKey = ErpSyncEvent.TYPE_SALE.equals(type) ? "invoice_id"
                : oldGold ? "purchase_invoice_no"
                : "voucher_no";
        event.setAttempts(event.getAttempts() + 1);
        try {
            ResponseEntity<String> response = client().post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(event.getPayload() == null ? "{}" : event.getPayload())
                    .retrieve()
                    .toEntity(String.class);
            String body = response.getBody() == null ? "" : response.getBody();
            JsonNode node = body.isBlank() ? objectMapper.createObjectNode() : objectMapper.readTree(body);
            if (!"success".equalsIgnoreCase(node.path("status").asText())) {
                fail(event, "HTTP " + response.getStatusCode().value() + " without status=success: " + abbreviate(body));
            } else {
                String reference = node.path(referenceKey).asText(null);
                event.setStatus(ErpSyncEvent.STATUS_SENT);
                event.setErpReference(reference == null || reference.isBlank() ? null : reference);
                event.setSentAt(LocalDateTime.now());
                event.setLastError(null);
                if (oldGold && event.getExchangeRequest() != null) {
                    recordPurchaseRef(event.getExchangeRequest().getId(), event.getErpReference());
                }
                LOGGER.info("ERP accepted " + event.getEventType() + " for " + label(event) + " as " + reference);
            }
        } catch (RestClientResponseException e) {
            // 409 = totals mismatch: recorded with the ERP's detail and held
            // for manual retry; every other status retries on schedule.
            fail(event, "HTTP " + e.getStatusCode().value() + ": " + abbreviate(e.getResponseBodyAsString()));
        } catch (Exception e) {
            fail(event, e.getClass().getSimpleName() + ": " + abbreviate(e.getMessage()));
        }
        eventRepository.save(event);
    }

    private void fail(ErpSyncEvent event, String error) {
        event.setStatus(ErpSyncEvent.STATUS_FAILED);
        event.setLastError(error);
        LOGGER.warning("ERP sync " + event.getEventType() + " for " + label(event)
                + " failed (attempt " + event.getAttempts() + "): " + error);
    }

    private static String label(ErpSyncEvent event) {
        if (event.getOrder() != null) {
            return "order " + event.getOrder().getOrderNumber();
        }
        if (event.getExchangeRequest() != null) {
            return "exchange " + event.getExchangeRequest().getRequestNumber();
        }
        if (event.getTreasureInstallment() != null) {
            return "treasure installment " + event.getTreasureInstallment().getId();
        }
        return "?";
    }

    /** Stores the purchase invoice number the ERP issued on the exchange request (own transaction; deliver() has none). */
    private void recordPurchaseRef(UUID exchangeRequestId, String purchaseRef) {
        if (purchaseRef == null) {
            return;
        }
        try {
            exchangeRequestRepository.findById(exchangeRequestId).ifPresent(request -> {
                request.setErpPurchaseRef(purchaseRef);
                exchangeRequestRepository.save(request);
            });
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Could not store ERP purchase ref on exchange " + exchangeRequestId, e);
        }
    }

    private RestClient client() {
        RestClient current = restClient;
        if (current == null) {
            synchronized (this) {
                if (restClient == null) {
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
                    factory.setConnectTimeout(Duration.ofSeconds(10));
                    factory.setReadTimeout(Duration.ofSeconds(30));
                    String base = baseUrl.trim();
                    while (base.endsWith("/")) {
                        base = base.substring(0, base.length() - 1);
                    }
                    restClient = RestClient.builder()
                            .baseUrl(base)
                            .requestFactory(factory)
                            .defaultHeader("X-Api-Key", apiKey.trim())
                            .build();
                }
                current = restClient;
            }
        }
        return current;
    }

    // ------------------------------------------------------------------
    // Payloads
    // ------------------------------------------------------------------

    private String salePayload(Order order, Invoice invoice) {
        AddressDTO address = parseAddress(order.getBillingAddress());
        if (address == null) {
            address = parseAddress(order.getShippingAddress());
        }

        Map<String, Object> customer = new LinkedHashMap<>();
        customer.put("name", invoice.getBuyerName());
        customer.put("email", order.getUser() == null ? null : order.getUser().getEmail());
        String phone = address != null && notBlank(address.getPhone()) ? address.getPhone().trim()
                : (order.getUser() == null ? null : order.getUser().getPhone());
        customer.put("phone", phone);
        customer.put("gstin", invoice.getBuyerGstin());
        customer.put("pan", invoice.getBuyerPan());
        customer.put("state_code", invoice.getBuyerStateCode() != null ? invoice.getBuyerStateCode() : invoice.getPlaceOfSupply());
        customer.put("address_line1", address == null ? null : address.getStreet());
        customer.put("city", address == null ? null : address.getCity());
        customer.put("pincode", address == null ? null : address.getZipCode());

        List<Map<String, Object>> lines = new ArrayList<>();
        for (InvoiceLine line : invoice.getLines()) {
            if (InvoiceService.isShippingLine(line)) {
                continue; // travels as other_charges
            }
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("description", line.getDescription());
            l.put("sku", line.getSku());
            // Null when the product is not mapped; the ERP then books the sale without a stock movement.
            l.put("material_code", line.getErpMaterialCode());
            l.put("hsn_sac_code", line.getHsnCode());
            l.put("quantity", line.getQuantity());
            l.put("taxable_value", money(line.getTaxableValue()));
            l.put("gst_rate", money(line.getGstRate()));
            lines.add(l);
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("taxable", money(invoice.getTaxableValue()));
        totals.put("cgst", money(invoice.getCgst()));
        totals.put("sgst", money(invoice.getSgst()));
        totals.put("igst", money(invoice.getIgst()));
        totals.put("grand_total", money(invoice.getGrandTotal()));

        // A gift card issued for old gold is not money the customer paid; it
        // is metal the shop bought (already posted as an RCM purchase). The
        // ERP nets it against the invoice as exchange credit, so it leaves
        // the payment and travels in its own block.
        Map<String, Object> exchangeCredit = exchangeCredit(order);
        BigDecimal creditAmount = exchangeCredit == null ? BigDecimal.ZERO : (BigDecimal) exchangeCredit.get("amount");

        // Treasure plan money was received earlier as ADVANCE receipts, so
        // it is not part of this invoice's payment; the ERP sets the advance
        // off against the invoice from its own advance_applied block.
        BigDecimal treasureAmount = money(order.getTreasureAmount());
        Map<String, Object> advanceApplied = null;
        if (treasureAmount.signum() > 0 && order.getAppliedTreasureAccountId() != null) {
            advanceApplied = new LinkedHashMap<>();
            advanceApplied.put("amount", treasureAmount);
            advanceApplied.put("reference", "TRS-" + order.getAppliedTreasureAccountId());
        }

        Map<String, Object> payment = null;
        if (!InvoiceService.isCashOnDelivery(order)) {
            BigDecimal paid = money(invoice.getGrandTotal()).subtract(creditAmount).subtract(treasureAmount);
            if (paid.signum() > 0) {
                payment = new LinkedHashMap<>();
                boolean gateway = notBlank(order.getRazorpayPaymentId());
                payment.put("mode", gateway ? "Razorpay" : "Gift card");
                payment.put("reference", gateway ? order.getRazorpayPaymentId().trim() : order.getAppliedGiftCard());
                payment.put("amount", paid);
                payment.put("date", invoice.getInvoiceDate() == null ? LocalDate.now(InvoiceService.INDIA).toString()
                        : invoice.getInvoiceDate().toString());
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("external_ref", order.getOrderNumber());
        body.put("invoice_no", invoice.getInvoiceNumber());
        body.put("invoice_date", invoice.getInvoiceDate() == null ? null : invoice.getInvoiceDate().toString());
        body.put("customer", customer);
        body.put("place_of_supply", invoice.getPlaceOfSupply());
        body.put("lines", lines);
        // Untaxed charges: shipping plus any positive round-off. The round-off
        // is where a fee the order never itemised (gift wrap) ends up, and the
        // ERP recomputes the tax from the lines and refuses a total it cannot
        // explain, so that amount has to travel as a charge, not vanish.
        BigDecimal roundOff = money(invoice.getRoundOff());
        BigDecimal otherCharges = money(invoice.getShipping())
                .add(roundOff.signum() > 0 ? roundOff : BigDecimal.ZERO);
        body.put("other_charges", money(otherCharges));
        body.put("totals", totals);
        if (exchangeCredit != null || advanceApplied != null) {
            // Settled wholly by exchange credit / advance: no payment block at all.
            if (payment != null) {
                body.put("payment", payment);
            }
            if (exchangeCredit != null) {
                body.put("exchange_credit", exchangeCredit);
            }
            if (advanceApplied != null) {
                body.put("advance_applied", advanceApplied);
            }
        } else {
            body.put("payment", payment);
        }
        return toJson(body);
    }

    /**
     * Body for POST /api/v1/integrations/ecommerce/advances: one paid
     * Treasure installment. The customer block has the same shape as the
     * sale's; address fields are null because an installment carries none.
     */
    private String advancePayload(TreasureInstallment installment) {
        TreasureChestAccount account = installment.getAccount();
        User user = account == null ? null : account.getUser();

        Map<String, Object> customer = new LinkedHashMap<>();
        String first = user == null || user.getFirstName() == null ? "" : user.getFirstName().trim();
        String last = user == null || user.getLastName() == null ? "" : user.getLastName().trim();
        String name = (first + " " + last).trim();
        customer.put("name", name.isEmpty() ? (user == null ? null : user.getEmail()) : name);
        customer.put("email", user == null ? null : user.getEmail());
        customer.put("phone", user == null ? null : user.getPhone());
        customer.put("gstin", null);
        customer.put("pan", null);
        customer.put("state_code", null);
        customer.put("address_line1", null);
        customer.put("city", null);
        customer.put("pincode", null);

        boolean gateway = TreasureInstallment.METHOD_RAZORPAY.equals(installment.getMethod())
                && notBlank(installment.getRazorpayPaymentId());
        LocalDateTime paidAt = installment.getPaidAt() != null ? installment.getPaidAt() : LocalDateTime.now();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("external_ref", "TRS-" + (account == null ? "?" : account.getId()) + "-" + installment.getInstallmentNumber());
        body.put("customer", customer);
        body.put("amount", money(installment.getAmount()));
        body.put("date", paidAt.toLocalDate().toString());
        body.put("mode", gateway ? "Razorpay" : "Cash");
        body.put("reference", gateway ? installment.getRazorpayPaymentId().trim() : null);
        body.put("scheme", "Treasure plan " + (account == null ? "?" : account.getId()));
        return toJson(body);
    }

    /**
     * {amount, reference, purchase_ref} when the order was (partly) paid with
     * a gift card whose source is EXCHANGE; null for every other order.
     */
    private Map<String, Object> exchangeCredit(Order order) {
        if (!notBlank(order.getAppliedGiftCard()) || order.getGiftCardAmount() == null
                || order.getGiftCardAmount().signum() <= 0) {
            return null;
        }
        Optional<GiftCard> card = giftCardRepository.findByCodeIgnoreCase(order.getAppliedGiftCard().trim());
        if (card.isEmpty() || !GiftCard.SOURCE_EXCHANGE.equals(card.get().getSource())) {
            return null;
        }
        ExchangeRequest request = card.get().getExchangeRequestId() == null ? null
                : exchangeRequestRepository.findById(card.get().getExchangeRequestId()).orElse(null);
        Map<String, Object> credit = new LinkedHashMap<>();
        credit.put("amount", money(order.getGiftCardAmount()));
        credit.put("reference", request == null ? order.getAppliedGiftCard() : request.getRequestNumber());
        credit.put("purchase_ref", request == null ? null : request.getErpPurchaseRef());
        return credit;
    }

    /** Body for POST /api/v1/integrations/ecommerce/old-gold-purchases. */
    private String oldGoldPayload(ExchangeRequest request) {
        Map<String, Object> customer = new LinkedHashMap<>();
        customer.put("name", request.getCustomerName());
        customer.put("email", request.getEmail());
        customer.put("phone", request.getPhone());
        customer.put("pan", request.getPan());
        customer.put("state_code", request.getStateCode());
        customer.put("address_line1", null);
        customer.put("city", null);
        customer.put("pincode", null);

        BigDecimal purity = request.getAssayedPurityFraction() != null ? request.getAssayedPurityFraction()
                : request.getDeclaredPurityFraction();
        BigDecimal netWeight = request.getAssayedNetWeightGrams() != null ? request.getAssayedNetWeightGrams()
                : request.getDeclaredWeightGrams();
        BigDecimal grossWeight = request.getDeclaredWeightGrams() != null ? request.getDeclaredWeightGrams() : netWeight;
        BigDecimal rate = request.getAssayedRatePerGram() != null ? request.getAssayedRatePerGram()
                : request.getQuotedRatePerGram();
        BigDecimal value = request.getFinalValue() != null ? request.getFinalValue() : request.getQuotedValue();

        String description = "Old gold exchange " + request.getRequestNumber();
        if (notBlank(request.getItemDescription())) {
            description += ": " + abbreviate(request.getItemDescription().trim());
        } else if (notBlank(request.getDeclaredPurity())) {
            description += ": " + request.getDeclaredPurity() + " " + request.getMetal().toLowerCase();
        }

        LocalDateTime creditedAt = request.getCreditedAt() != null ? request.getCreditedAt() : LocalDateTime.now();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("external_ref", request.getRequestNumber());
        body.put("purchase_date", creditedAt.toLocalDate().toString());
        body.put("customer", customer);
        body.put("metal", request.getMetal());
        body.put("purity", purity == null ? null : purity.setScale(3, RoundingMode.HALF_UP));
        body.put("gross_weight", grossWeight == null ? null : grossWeight.setScale(3, RoundingMode.HALF_UP));
        body.put("net_weight", netWeight == null ? null : netWeight.setScale(3, RoundingMode.HALF_UP));
        body.put("rate_per_gram", money(rate));
        body.put("value", money(value));
        body.put("description", description);
        return toJson(body);
    }

    private String toJson(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise ERP payload", e);
        }
    }

    private AddressDTO parseAddress(String json) {
        if (json == null || json.isBlank() || "null".equals(json.trim())) {
            return null;
        }
        try {
            return objectMapper.readValue(json, AddressDTO.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String abbreviate(String s) {
        if (s == null) {
            return "";
        }
        String trimmed = s.trim();
        return trimmed.length() > 2000 ? trimmed.substring(0, 2000) + "..." : trimmed;
    }
}
