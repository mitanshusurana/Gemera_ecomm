package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.entity.ErpSyncEvent;
import com.jewelry.backend.entity.ExchangeRequest;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.ErpSyncEventRepository;
import com.jewelry.backend.repository.ExchangeRequestRepository;
import com.jewelry.backend.repository.GiftCardRepository;
import com.jewelry.backend.repository.InvoiceRepository;
import com.jewelry.backend.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Shape of the JSON the outbox stores for the ERP. The payload builders are
 * private, so each test goes through the public enqueue method with the
 * repositories mocked and reads the event's payload back as JSON.
 */
class ErpSyncServiceTest {

    private final ObjectMapper json = new ObjectMapper();

    private ErpSyncService service;
    private ErpSyncEventRepository eventRepository;
    private GiftCardRepository giftCardRepository;
    private ExchangeRequestRepository exchangeRequestRepository;
    private InvoiceRepository invoiceRepository;

    @BeforeEach
    void setUp() {
        eventRepository = mock(ErpSyncEventRepository.class);
        giftCardRepository = mock(GiftCardRepository.class);
        exchangeRequestRepository = mock(ExchangeRequestRepository.class);
        invoiceRepository = mock(InvoiceRepository.class);
        when(eventRepository.findByOrderIdAndEventType(any(), anyString())).thenReturn(Optional.empty());
        when(eventRepository.findByExchangeRequestIdAndEventType(any(), anyString())).thenReturn(Optional.empty());
        when(eventRepository.findByInvoiceIdAndEventType(any(), anyString())).thenReturn(Optional.empty());
        when(eventRepository.save(any(ErpSyncEvent.class))).thenAnswer(inv -> inv.getArgument(0));
        when(giftCardRepository.findByCodeIgnoreCase(anyString())).thenReturn(Optional.empty());

        service = new ErpSyncService();
        service.eventRepository = eventRepository;
        service.invoiceRepository = invoiceRepository;
        service.orderRepository = mock(OrderRepository.class);
        service.giftCardRepository = giftCardRepository;
        service.exchangeRequestRepository = exchangeRequestRepository;
        service.objectMapper = json;
    }

    // ---- fixtures --------------------------------------------------------

    private static Order order() {
        Order order = new Order();
        order.setId(UUID.randomUUID());
        order.setOrderNumber("ORD-77");
        order.setStatus("PAID");
        order.setPaymentMethod("RAZORPAY");
        order.setRazorpayPaymentId("pay_abc");
        order.setBillingAddress("{\"firstName\":\"Asha\",\"lastName\":\"Rao\",\"street\":\"1 MG Road\",\"city\":\"Jaipur\","
                + "\"state\":\"Rajasthan\",\"zipCode\":\"302001\",\"country\":\"India\",\"phone\":\"9999999999\"}");
        User user = new User();
        user.setEmail("asha@example.com");
        user.setPhone("8888888888");
        order.setUser(user);
        return order;
    }

    private static InvoiceLine line(Invoice invoice, int no, String sku, String materialCode, String taxable, String rate) {
        InvoiceLine l = new InvoiceLine();
        l.setInvoice(invoice);
        l.setLineNo(no);
        l.setDescription("Line " + no);
        l.setSku(sku);
        l.setErpMaterialCode(materialCode);
        l.setHsnCode("7113");
        l.setQuantity(1);
        l.setTaxableValue(new BigDecimal(taxable));
        l.setGstRate(new BigDecimal(rate));
        return l;
    }

    /** Intra-state invoice: 10,000 taxable, 150 + 150 tax, 50 shipping. */
    private static Invoice invoice(Order order, String roundOff, String grandTotal) {
        Invoice invoice = new Invoice();
        invoice.setOrder(order);
        invoice.setInvoiceNumber("WEB/2026-27/00007");
        invoice.setInvoiceDate(LocalDate.of(2026, 9, 1));
        invoice.setBuyerName("Asha Rao");
        invoice.setBuyerStateCode("08");
        invoice.setPlaceOfSupply("08");
        invoice.setTaxableValue(new BigDecimal("10000"));
        invoice.setCgst(new BigDecimal("150"));
        invoice.setSgst(new BigDecimal("150"));
        invoice.setIgst(BigDecimal.ZERO);
        invoice.setShipping(new BigDecimal("50"));
        invoice.setRoundOff(new BigDecimal(roundOff));
        invoice.setGrandTotal(new BigDecimal(grandTotal));
        invoice.getLines().add(line(invoice, 1, "JW-001", "FG-RING-1", "10000", "3"));
        InvoiceLine shipping = line(invoice, 2, null, null, "50", "0");
        shipping.setDescription("Shipping");
        shipping.setHsnCode(InvoiceService.SHIPPING_SAC);
        invoice.getLines().add(shipping);
        return invoice;
    }

    private JsonNode salePayload(Order order, Invoice invoice) throws Exception {
        ErpSyncEvent event = service.enqueueSale(order, invoice);
        assertThat(event.getEventType()).isEqualTo(ErpSyncEvent.TYPE_SALE);
        assertThat(event.getStatus()).isEqualTo(ErpSyncEvent.STATUS_PENDING);
        assertThat(event.getOrder()).isSameAs(order);
        return json.readTree(event.getPayload());
    }

    // ---- sale payload ------------------------------------------------------

    @Test
    void salePayloadCarriesHeaderCustomerLinesAndTotals() throws Exception {
        Order order = order();
        JsonNode body = salePayload(order, invoice(order, "0", "10350"));

        assertThat(body.get("external_ref").asText()).isEqualTo("ORD-77");
        assertThat(body.get("invoice_no").asText()).isEqualTo("WEB/2026-27/00007");
        assertThat(body.get("invoice_date").asText()).isEqualTo("2026-09-01");
        assertThat(body.get("place_of_supply").asText()).isEqualTo("08");

        JsonNode customer = body.get("customer");
        assertThat(customer.get("name").asText()).isEqualTo("Asha Rao");
        assertThat(customer.get("email").asText()).isEqualTo("asha@example.com");
        assertThat(customer.get("phone").asText()).as("address phone wins over account phone").isEqualTo("9999999999");
        assertThat(customer.get("state_code").asText()).isEqualTo("08");
        assertThat(customer.get("city").asText()).isEqualTo("Jaipur");
        assertThat(customer.get("pincode").asText()).isEqualTo("302001");

        JsonNode totals = body.get("totals");
        assertThat(totals.get("taxable").decimalValue()).isEqualByComparingTo("10000.00");
        assertThat(totals.get("cgst").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(totals.get("sgst").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(totals.get("igst").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(totals.get("grand_total").decimalValue()).isEqualByComparingTo("10350.00");
    }

    @Test
    void linesCarryMaterialCodeAndExcludeShipping() throws Exception {
        Order order = order();
        JsonNode lines = salePayload(order, invoice(order, "0", "10350")).get("lines");

        assertThat(lines).hasSize(1);
        JsonNode line = lines.get(0);
        assertThat(line.has("material_code")).isTrue();
        assertThat(line.get("material_code").asText()).isEqualTo("FG-RING-1");
        assertThat(line.get("sku").asText()).isEqualTo("JW-001");
        assertThat(line.get("hsn_sac_code").asText()).isEqualTo("7113");
        assertThat(line.get("quantity").asInt()).isEqualTo(1);
        assertThat(line.get("taxable_value").decimalValue()).isEqualByComparingTo("10000.00");
        assertThat(line.get("gst_rate").decimalValue()).isEqualByComparingTo("3.00");
    }

    @Test
    void unmappedProductStillSendsTheMaterialCodeKeyAsNull() throws Exception {
        Order order = order();
        Invoice invoice = invoice(order, "0", "10350");
        invoice.getLines().get(0).setErpMaterialCode(null);
        JsonNode line = salePayload(order, invoice).get("lines").get(0);
        assertThat(line.has("material_code")).isTrue();
        assertThat(line.get("material_code").isNull()).isTrue();
    }

    @Test
    void shippingTravelsAsOtherChargesAndPositiveRoundOffIsAddedToIt() throws Exception {
        Order order = order();
        // 0.40 that the order charged but no line explains (a gift-wrap fee).
        JsonNode body = salePayload(order, invoice(order, "0.40", "10350.40"));
        assertThat(body.get("other_charges").decimalValue()).isEqualByComparingTo("50.40");
        assertThat(body.get("payment").get("amount").decimalValue()).isEqualByComparingTo("10350.40");
    }

    @Test
    void negativeRoundOffIsNotAnOtherCharge() throws Exception {
        Order order = order();
        JsonNode body = salePayload(order, invoice(order, "-0.40", "10349.60"));
        assertThat(body.get("other_charges").decimalValue()).isEqualByComparingTo("50.00");
    }

    @Test
    void gatewayPaymentCoversTheWholeInvoice() throws Exception {
        Order order = order();
        JsonNode payment = salePayload(order, invoice(order, "0", "10350")).get("payment");
        assertThat(payment.get("mode").asText()).isEqualTo("Razorpay");
        assertThat(payment.get("reference").asText()).isEqualTo("pay_abc");
        assertThat(payment.get("amount").decimalValue()).isEqualByComparingTo("10350.00");
        assertThat(payment.get("date").asText()).isEqualTo("2026-09-01");
    }

    @Test
    void cashOnDeliveryHasNoPaymentBlock() throws Exception {
        Order order = order();
        order.setPaymentMethod("COD");
        order.setRazorpayPaymentId(null);
        JsonNode body = salePayload(order, invoice(order, "0", "10350"));
        assertThat(body.has("payment")).isTrue();
        assertThat(body.get("payment").isNull()).isTrue();
        assertThat(body.has("exchange_credit")).isFalse();
    }

    @Test
    void purchasedGiftCardIsAPaymentNotExchangeCredit() throws Exception {
        Order order = order();
        order.setRazorpayPaymentId(null);
        order.setAppliedGiftCard("GC-PURCHASED");
        order.setGiftCardAmount(new BigDecimal("10350"));
        GiftCard card = new GiftCard();
        card.setCode("GC-PURCHASED");
        card.setSource(GiftCard.SOURCE_PURCHASE);
        when(giftCardRepository.findByCodeIgnoreCase("GC-PURCHASED")).thenReturn(Optional.of(card));

        JsonNode body = salePayload(order, invoice(order, "0", "10350"));
        assertThat(body.has("exchange_credit")).isFalse();
        JsonNode payment = body.get("payment");
        assertThat(payment.get("mode").asText()).isEqualTo("Gift card");
        assertThat(payment.get("reference").asText()).isEqualTo("GC-PURCHASED");
        assertThat(payment.get("amount").decimalValue()).isEqualByComparingTo("10350.00");
    }

    @Test
    void exchangeCreditSplitsThePaymentAndTravelsInItsOwnBlock() throws Exception {
        Order order = order();
        order.setAppliedGiftCard("GC-EXCH");
        order.setGiftCardAmount(new BigDecimal("4000"));

        UUID requestId = UUID.randomUUID();
        GiftCard card = new GiftCard();
        card.setCode("GC-EXCH");
        card.setSource(GiftCard.SOURCE_EXCHANGE);
        card.setExchangeRequestId(requestId);
        when(giftCardRepository.findByCodeIgnoreCase("GC-EXCH")).thenReturn(Optional.of(card));
        ExchangeRequest request = new ExchangeRequest();
        request.setRequestNumber("EX-2026-00003");
        request.setErpPurchaseRef("PUR/2026-27/00009");
        when(exchangeRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        JsonNode body = salePayload(order, invoice(order, "0", "10350"));

        JsonNode credit = body.get("exchange_credit");
        assertThat(credit.get("amount").decimalValue()).isEqualByComparingTo("4000.00");
        assertThat(credit.get("reference").asText()).isEqualTo("EX-2026-00003");
        assertThat(credit.get("purchase_ref").asText()).isEqualTo("PUR/2026-27/00009");

        JsonNode payment = body.get("payment");
        assertThat(payment.get("mode").asText()).isEqualTo("Razorpay");
        assertThat(payment.get("amount").decimalValue()).as("grand total minus the credit").isEqualByComparingTo("6350.00");
        assertThat(body.get("totals").get("grand_total").decimalValue()).isEqualByComparingTo("10350.00");
    }

    @Test
    void orderSettledEntirelyByExchangeCreditHasNoPaymentKeyAtAll() throws Exception {
        Order order = order();
        order.setRazorpayPaymentId(null);
        order.setAppliedGiftCard("GC-EXCH");
        order.setGiftCardAmount(new BigDecimal("10350"));
        GiftCard card = new GiftCard();
        card.setCode("GC-EXCH");
        card.setSource(GiftCard.SOURCE_EXCHANGE);
        when(giftCardRepository.findByCodeIgnoreCase("GC-EXCH")).thenReturn(Optional.of(card));

        JsonNode body = salePayload(order, invoice(order, "0", "10350"));
        assertThat(body.has("payment")).isFalse();
        JsonNode credit = body.get("exchange_credit");
        assertThat(credit.get("amount").decimalValue()).isEqualByComparingTo("10350.00");
        assertThat(credit.get("reference").asText()).as("falls back to the card code without a request").isEqualTo("GC-EXCH");
        assertThat(credit.get("purchase_ref").isNull()).isTrue();
    }

    // ---- queue behaviour ------------------------------------------------------

    @Test
    void unconfiguredIntegrationLeavesTheEventPendingWithAReason() {
        Order order = order();
        assertThat(service.isConfigured()).isFalse();
        ErpSyncEvent event = service.enqueueSale(order, invoice(order, "0", "10350"));
        assertThat(event.getStatus()).isEqualTo(ErpSyncEvent.STATUS_PENDING);
        assertThat(event.getAttempts()).isZero();
        assertThat(event.getLastError()).isEqualTo(ErpSyncService.NOT_CONFIGURED);
    }

    @Test
    void configuredIntegrationRecordsNoError() {
        ReflectionTestUtils.setField(service, "baseUrl", "http://erp.local/");
        ReflectionTestUtils.setField(service, "apiKey", "k");
        assertThat(service.isConfigured()).isTrue();
        Order order = order();
        ErpSyncEvent event = service.enqueueSale(order, invoice(order, "0", "10350"));
        assertThat(event.getLastError()).isNull();
    }

    @Test
    void enqueueSaleIsIdempotentPerOrder() {
        Order order = order();
        ErpSyncEvent existing = new ErpSyncEvent();
        existing.setEventType(ErpSyncEvent.TYPE_SALE);
        when(eventRepository.findByOrderIdAndEventType(order.getId(), ErpSyncEvent.TYPE_SALE)).thenReturn(Optional.of(existing));

        assertThat(service.enqueueSale(order, invoice(order, "0", "10350"))).isSameAs(existing);
        verify(eventRepository, never()).save(any());
    }

    @Test
    void creditNoteNeedsAnInvoiceAndReferencesIt() throws Exception {
        Order order = order();
        when(invoiceRepository.findByOrderId(order.getId())).thenReturn(Optional.empty());
        assertThat(service.enqueueCreditNote(order, new BigDecimal("500"), "Damaged")).isEmpty();

        when(invoiceRepository.findByOrderId(order.getId())).thenReturn(Optional.of(invoice(order, "0", "10350")));
        ErpSyncEvent event = service.enqueueCreditNote(order, new BigDecimal("500"), "  ").orElseThrow();
        assertThat(event.getEventType()).isEqualTo(ErpSyncEvent.TYPE_CREDIT_NOTE);
        JsonNode body = json.readTree(event.getPayload());
        assertThat(body.get("external_ref").asText()).isEqualTo("ORD-77");
        assertThat(body.get("invoice_no").asText()).isEqualTo("WEB/2026-27/00007");
        assertThat(body.get("amount").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(body.get("reason").asText()).as("blank reason defaults").isEqualTo("Refund");
    }

    @Test
    void oldGoldPurchasePrefersAssayedFiguresAndRoundsWeightsToMilligrams() throws Exception {
        ExchangeRequest request = new ExchangeRequest();
        request.setId(UUID.randomUUID());
        request.setRequestNumber("EX-2026-00012");
        request.setCustomerName("Ravi");
        request.setPhone("7777777777");
        request.setMetal(ExchangeRequest.METAL_GOLD);
        request.setDeclaredPurity("22K");
        request.setDeclaredPurityFraction(new BigDecimal("0.9160"));
        request.setDeclaredWeightGrams(new BigDecimal("10.5"));
        request.setQuotedRatePerGram(new BigDecimal("6000"));
        request.setQuotedValue(new BigDecimal("56000"));
        request.setAssayedPurityFraction(new BigDecimal("0.9050"));
        request.setAssayedNetWeightGrams(new BigDecimal("10.2345"));
        request.setAssayedRatePerGram(new BigDecimal("6100"));
        request.setFinalValue(new BigDecimal("55370"));
        request.setCreditedAt(LocalDateTime.of(2026, 9, 2, 12, 0));
        request.setStatus(ExchangeRequest.STATUS_CREDITED);

        ErpSyncEvent event = service.enqueueOldGoldPurchase(request);
        assertThat(event.getEventType()).isEqualTo(ErpSyncEvent.TYPE_OLD_GOLD_PURCHASE);
        assertThat(event.getExchangeRequest()).isSameAs(request);
        assertThat(event.getOrder()).isNull();

        JsonNode body = json.readTree(event.getPayload());
        assertThat(body.get("external_ref").asText()).isEqualTo("EX-2026-00012");
        assertThat(body.get("purchase_date").asText()).isEqualTo("2026-09-02");
        assertThat(body.get("metal").asText()).isEqualTo("GOLD");
        assertThat(body.get("purity").decimalValue()).isEqualByComparingTo("0.905");
        assertThat(body.get("gross_weight").decimalValue()).isEqualByComparingTo("10.500");
        assertThat(body.get("net_weight").decimalValue()).isEqualByComparingTo("10.235");
        assertThat(body.get("rate_per_gram").decimalValue()).isEqualByComparingTo("6100.00");
        assertThat(body.get("value").decimalValue()).isEqualByComparingTo("55370.00");
        assertThat(body.get("description").asText()).isEqualTo("Old gold exchange EX-2026-00012: 22K gold");
        assertThat(body.get("customer").get("name").asText()).isEqualTo("Ravi");
    }

    @Test
    void syncNowRefusesWhenTheIntegrationIsOff() {
        assertThatThrownBy(() -> service.syncNow(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(ErpSyncService.NOT_CONFIGURED);
        assertThatThrownBy(() -> service.syncExchangeNow(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class);
    }

    // ---- repair service invoices ------------------------------------------

    private static RepairJob repairJob(BigDecimal paid, RepairJob.PaymentMode mode, String reference) {
        RepairJob job = new RepairJob();
        job.setId(UUID.randomUUID());
        job.setJobNumber("RJ-2026-00042");
        job.setCustomerName("Meera Shah");
        job.setPhone("9876543210");
        job.setEmail("meera@example.com");
        job.setStatus(RepairJob.Status.DELIVERED);
        job.setFinalAmount(new BigDecimal("1180"));
        job.setPaidAmount(paid);
        job.setPaymentMode(mode);
        job.setPaymentReference(reference);
        return job;
    }

    /** Tax-inclusive 1,180 repair bill: 1,000 taxable, 90 + 90 GST at 18%, SAC 998722. */
    private static Invoice serviceInvoice(RepairJob job) {
        Invoice invoice = new Invoice();
        invoice.setId(UUID.randomUUID());
        invoice.setRepairJob(job);
        invoice.setInvoiceKind(Invoice.Kind.SERVICE);
        invoice.setInvoiceNumber("SRV/2026-27/00003");
        invoice.setInvoiceDate(LocalDate.of(2026, 9, 20));
        invoice.setBuyerName("Meera Shah");
        invoice.setSellerStateCode("08");
        invoice.setBuyerStateCode("08");
        invoice.setPlaceOfSupply("08");
        invoice.setTaxableValue(new BigDecimal("1000.00"));
        invoice.setCgst(new BigDecimal("90.00"));
        invoice.setSgst(new BigDecimal("90.00"));
        invoice.setIgst(BigDecimal.ZERO);
        invoice.setShipping(BigDecimal.ZERO);
        invoice.setRoundOff(BigDecimal.ZERO);
        invoice.setGrandTotal(new BigDecimal("1180.00"));
        InvoiceLine line = line(invoice, 1, null, null, "1000", "18");
        line.setDescription("Resizing - Ring: 22K band (job RJ-2026-00042)");
        line.setHsnCode("998722");
        invoice.getLines().add(line);
        return invoice;
    }

    @Test
    void serviceInvoicePostsAsAServiceSaleUnderTheJobNumber() throws Exception {
        RepairJob job = repairJob(new BigDecimal("1180"), RepairJob.PaymentMode.RAZORPAY, "pay_rep_1");
        Invoice invoice = serviceInvoice(job);

        ErpSyncEvent event = service.enqueueServiceInvoice(invoice).orElseThrow();
        assertThat(event.getEventType()).isEqualTo(ErpSyncEvent.TYPE_SALE);
        assertThat(event.getStatus()).isEqualTo(ErpSyncEvent.STATUS_PENDING);
        assertThat(event.getOrder()).isNull();
        assertThat(event.getInvoice()).isSameAs(invoice);

        JsonNode body = json.readTree(event.getPayload());
        assertThat(body.get("external_ref").asText()).isEqualTo("RJ-2026-00042");
        assertThat(body.get("invoice_no").asText()).isEqualTo("SRV/2026-27/00003");
        assertThat(body.get("invoice_date").asText()).isEqualTo("2026-09-20");
        assertThat(body.get("place_of_supply").asText()).as("repairs collect no address: seller state").isEqualTo("08");

        JsonNode customer = body.get("customer");
        assertThat(customer.get("name").asText()).isEqualTo("Meera Shah");
        assertThat(customer.get("email").asText()).isEqualTo("meera@example.com");
        assertThat(customer.get("phone").asText()).isEqualTo("9876543210");
        assertThat(customer.get("state_code").asText()).isEqualTo("08");
        assertThat(customer.get("gstin").isNull()).isTrue();
        assertThat(customer.get("address_line1").isNull()).isTrue();

        assertThat(body.get("lines")).hasSize(1);
        JsonNode line = body.get("lines").get(0);
        assertThat(line.get("description").asText()).isEqualTo("Service - Resizing - Ring: 22K band (job RJ-2026-00042)");
        assertThat(line.get("sku").isNull()).isTrue();
        assertThat(line.get("material_code").isNull()).isTrue();
        assertThat(line.get("hsn_sac_code").asText()).isEqualTo("998722");
        assertThat(line.get("quantity").asInt()).isEqualTo(1);
        assertThat(line.get("taxable_value").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(line.get("gst_rate").decimalValue()).isEqualByComparingTo("18.00");
        assertThat(line.get("is_service").asBoolean()).isTrue();

        JsonNode totals = body.get("totals");
        assertThat(totals.get("taxable").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(totals.get("cgst").decimalValue()).isEqualByComparingTo("90.00");
        assertThat(totals.get("sgst").decimalValue()).isEqualByComparingTo("90.00");
        assertThat(totals.get("igst").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(totals.get("grand_total").decimalValue()).isEqualByComparingTo("1180.00");
        assertThat(body.get("other_charges").decimalValue()).isEqualByComparingTo("0.00");

        JsonNode payment = body.get("payment");
        assertThat(payment.get("mode").asText()).isEqualTo("Razorpay");
        assertThat(payment.get("reference").asText()).isEqualTo("pay_rep_1");
        assertThat(payment.get("amount").decimalValue()).isEqualByComparingTo("1180.00");
        assertThat(payment.get("date").asText()).isEqualTo("2026-09-20");
    }

    @Test
    void unpaidServiceInvoiceCarriesNoPaymentAndCashIsLabelledAsRecorded() throws Exception {
        RepairJob unpaid = repairJob(BigDecimal.ZERO, null, null);
        JsonNode body = json.readTree(service.enqueueServiceInvoice(serviceInvoice(unpaid)).orElseThrow().getPayload());
        assertThat(body.has("payment")).as("partly or unpaid: no payment block").isFalse();

        RepairJob partly = repairJob(new BigDecimal("500"), RepairJob.PaymentMode.UPI, "upi-1");
        body = json.readTree(service.enqueueServiceInvoice(serviceInvoice(partly)).orElseThrow().getPayload());
        assertThat(body.has("payment")).isFalse();

        RepairJob cash = repairJob(new BigDecimal("1180"), RepairJob.PaymentMode.CASH, null);
        body = json.readTree(service.enqueueServiceInvoice(serviceInvoice(cash)).orElseThrow().getPayload());
        assertThat(body.get("payment").get("mode").asText()).isEqualTo("Cash");
        assertThat(body.get("payment").get("reference").isNull()).isTrue();

        assertThat(ErpSyncService.paymentModeLabel(RepairJob.PaymentMode.CARD)).isEqualTo("Card");
        assertThat(ErpSyncService.paymentModeLabel(RepairJob.PaymentMode.OTHER)).isEqualTo("Other");
        assertThat(ErpSyncService.paymentModeLabel(null)).isEqualTo("Cash");
    }

    @Test
    void serviceInvoiceEventIsRefreshedWithThePaymentUntilSent() throws Exception {
        RepairJob job = repairJob(BigDecimal.ZERO, null, null);
        Invoice invoice = serviceInvoice(job);
        ErpSyncEvent pending = service.enqueueServiceInvoice(invoice).orElseThrow();
        assertThat(json.readTree(pending.getPayload()).has("payment")).isFalse();
        when(eventRepository.findByInvoiceIdAndEventType(invoice.getId(), ErpSyncEvent.TYPE_SALE)).thenReturn(Optional.of(pending));

        // The job is paid after delivery: the pending row now carries the payment.
        job.setPaidAmount(new BigDecimal("1180"));
        job.setPaymentMode(RepairJob.PaymentMode.RAZORPAY);
        job.setPaymentReference("pay_late");
        ErpSyncEvent refreshed = service.enqueueServiceInvoice(invoice).orElseThrow();
        assertThat(refreshed).isSameAs(pending);
        assertThat(json.readTree(refreshed.getPayload()).get("payment").get("reference").asText()).isEqualTo("pay_late");

        // Once sent, the ERP has the invoice; the snapshot is left alone.
        pending.setStatus(ErpSyncEvent.STATUS_SENT);
        String sentPayload = pending.getPayload();
        job.setPaymentReference("pay_changed");
        assertThat(service.enqueueServiceInvoice(invoice).orElseThrow().getPayload()).isEqualTo(sentPayload);
    }

    @Test
    void onlyServiceInvoicesWithAJobAreEnqueuedThisWay() {
        Order order = order();
        assertThat(service.enqueueServiceInvoice(invoice(order, "0", "10350"))).isEmpty();

        Invoice orphan = serviceInvoice(repairJob(BigDecimal.ZERO, null, null));
        orphan.setRepairJob(null);
        assertThat(service.enqueueServiceInvoice(orphan)).isEmpty();
        assertThat(service.enqueueServiceInvoice(null)).isEmpty();
        verify(eventRepository, never()).save(any());
    }

    @Test
    void syncServiceInvoiceNowRefusesWhenTheIntegrationIsOff() {
        assertThatThrownBy(() -> service.syncServiceInvoiceNow(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(ErpSyncService.NOT_CONFIGURED);
    }
}
