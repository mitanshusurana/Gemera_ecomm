package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.AddressDTO;
import com.jewelry.backend.entity.ErpSyncEvent;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.repository.ErpSyncEventRepository;
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
 * Outbox that pushes store invoices (sales) and refunds (credit notes) to
 * the ERP's e-commerce integration endpoints.
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
        ErpSyncEvent event = newEvent(order, ErpSyncEvent.TYPE_CREDIT_NOTE, toJson(body));
        return Optional.of(eventRepository.save(event));
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
        boolean sale = ErpSyncEvent.TYPE_SALE.equals(event.getEventType());
        String path = sale ? SALES_PATH : CREDIT_NOTES_PATH;
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
                String reference = node.path(sale ? "invoice_id" : "voucher_no").asText(null);
                event.setStatus(ErpSyncEvent.STATUS_SENT);
                event.setErpReference(reference == null || reference.isBlank() ? null : reference);
                event.setSentAt(LocalDateTime.now());
                event.setLastError(null);
                LOGGER.info("ERP accepted " + event.getEventType() + " for order "
                        + (event.getOrder() == null ? "?" : event.getOrder().getOrderNumber())
                        + " as " + reference);
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
        LOGGER.warning("ERP sync " + event.getEventType() + " for order "
                + (event.getOrder() == null ? "?" : event.getOrder().getOrderNumber())
                + " failed (attempt " + event.getAttempts() + "): " + error);
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

        Map<String, Object> payment = null;
        if (!InvoiceService.isCashOnDelivery(order)) {
            payment = new LinkedHashMap<>();
            boolean gateway = notBlank(order.getRazorpayPaymentId());
            payment.put("mode", gateway ? "Razorpay" : "Gift card");
            payment.put("reference", gateway ? order.getRazorpayPaymentId().trim() : order.getAppliedGiftCard());
            payment.put("amount", money(invoice.getGrandTotal()));
            payment.put("date", invoice.getInvoiceDate() == null ? LocalDate.now(InvoiceService.INDIA).toString()
                    : invoice.getInvoiceDate().toString());
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
        body.put("payment", payment);
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
