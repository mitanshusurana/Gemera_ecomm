package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.entity.InvoiceSequence;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.InvoiceRepository;
import com.jewelry.backend.repository.InvoiceSequenceRepository;
import com.jewelry.backend.repository.OrderRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
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
 * GST arithmetic of the invoice builder, driven through {@code ensureInvoice}
 * with every repository mocked. The seller is in Rajasthan (08) unless a
 * companyStateCode setting says otherwise.
 */
class InvoiceServiceTest {

    private static final String RAJASTHAN_ADDRESS = address("Rajasthan");
    private static final String MAHARASHTRA_ADDRESS = address("Maharashtra");

    private InvoiceService service;
    private InvoiceRepository invoiceRepository;
    private InvoiceSequenceRepository sequenceRepository;
    private GlobalSettingRepository settings;
    private ErpSyncService erpSyncService;

    @BeforeEach
    void setUp() {
        invoiceRepository = mock(InvoiceRepository.class);
        sequenceRepository = mock(InvoiceSequenceRepository.class);
        settings = mock(GlobalSettingRepository.class);
        erpSyncService = mock(ErpSyncService.class);

        when(invoiceRepository.findByOrderId(any())).thenReturn(Optional.empty());
        when(invoiceRepository.save(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        InvoiceSequence sequence = new InvoiceSequence();
        sequence.setLastNumber(41);
        when(sequenceRepository.lockByFinancialYear(anyString())).thenReturn(Optional.of(sequence));

        service = new InvoiceService();
        service.invoiceRepository = invoiceRepository;
        service.invoiceSequenceRepository = sequenceRepository;
        service.globalSettingRepository = settings;
        service.orderRepository = mock(OrderRepository.class);
        service.objectMapper = new ObjectMapper();
        service.erpSyncService = erpSyncService;
        service.pdfRenderer = mock(InvoicePdfRenderer.class);
    }

    // ---- fixtures --------------------------------------------------------

    private static String address(String state) {
        return "{\"firstName\":\"Asha\",\"lastName\":\"Rao\",\"street\":\"1 MG Road\",\"city\":\"City\","
                + "\"state\":\"" + state + "\",\"zipCode\":\"302001\",\"country\":\"India\",\"phone\":\"9999999999\"}";
    }

    private static Product product(String category, String price) {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName(category + " item");
        p.setCategory(category);
        p.setSku("SKU-" + category.toUpperCase());
        p.setPrice(new BigDecimal(price));
        return p;
    }

    private static OrderItem item(Product product, int quantity, String price) {
        OrderItem item = new OrderItem();
        item.setProduct(product);
        item.setQuantity(quantity);
        item.setPrice(new BigDecimal(price));
        return item;
    }

    /** A paid online order with one Jewelry line of 10,000 and 50 shipping; total 10,350 (3% GST). */
    private static Order paidOrder(String billingAddress) {
        Order order = new Order();
        order.setId(UUID.randomUUID());
        order.setOrderNumber("ORD-1");
        order.setStatus("PAID");
        order.setPaymentMethod("RAZORPAY");
        order.setRazorpayPaymentId("pay_123");
        order.setBillingAddress(billingAddress);
        order.setShippingAddress(billingAddress);
        order.setItems(new ArrayList<>());
        order.getItems().add(item(product("Jewelry", "10000"), 1, "10000"));
        order.setSubtotal(new BigDecimal("10000"));
        order.setDiscount(BigDecimal.ZERO);
        order.setShipping(new BigDecimal("50"));
        order.setTax(new BigDecimal("300"));
        order.setTotal(new BigDecimal("10350"));
        return order;
    }

    private void setting(String key, String value) {
        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(key);
        s.setSettingValue(value);
        when(settings.findBySettingKey(key)).thenReturn(Optional.of(s));
    }

    private static InvoiceLine productLine(Invoice invoice, int index) {
        return invoice.getLines().stream().filter(l -> !InvoiceService.isShippingLine(l)).toList().get(index);
    }

    private static InvoiceLine shippingLine(Invoice invoice) {
        return invoice.getLines().stream().filter(InvoiceService::isShippingLine).findFirst().orElseThrow();
    }

    // ---- tax split -------------------------------------------------------

    @Test
    void intraStateSupplySplitsTaxIntoEqualCgstAndSgst() {
        Invoice invoice = service.ensureInvoice(paidOrder(RAJASTHAN_ADDRESS));

        assertThat(invoice.getSellerStateCode()).isEqualTo("08");
        assertThat(invoice.getBuyerStateCode()).isEqualTo("08");
        assertThat(invoice.getPlaceOfSupply()).isEqualTo("08");
        assertThat(invoice.isInterState()).isFalse();

        InvoiceLine line = productLine(invoice, 0);
        assertThat(line.getGstRate()).isEqualByComparingTo("3.00");
        assertThat(line.getTaxableValue()).isEqualByComparingTo("10000.00");
        assertThat(line.getCgst()).isEqualByComparingTo("150.00");
        assertThat(line.getSgst()).isEqualByComparingTo("150.00");
        assertThat(line.getIgst()).isEqualByComparingTo("0.00");
        assertThat(line.getLineTotal()).isEqualByComparingTo("10300.00");
        assertThat(line.getHsnCode()).isEqualTo("7113");

        assertThat(invoice.getTaxableValue()).isEqualByComparingTo("10000.00");
        assertThat(invoice.getCgst()).isEqualByComparingTo("150.00");
        assertThat(invoice.getSgst()).isEqualByComparingTo("150.00");
        assertThat(invoice.getIgst()).isEqualByComparingTo("0.00");
    }

    @Test
    void interStateSupplyChargesIgstOnly() {
        Invoice invoice = service.ensureInvoice(paidOrder(MAHARASHTRA_ADDRESS));

        assertThat(invoice.getBuyerStateCode()).isEqualTo("27");
        assertThat(invoice.getPlaceOfSupply()).isEqualTo("27");
        assertThat(invoice.isInterState()).isTrue();

        InvoiceLine line = productLine(invoice, 0);
        assertThat(line.getIgst()).isEqualByComparingTo("300.00");
        assertThat(line.getCgst()).isEqualByComparingTo("0.00");
        assertThat(line.getSgst()).isEqualByComparingTo("0.00");
        assertThat(invoice.getIgst()).isEqualByComparingTo("300.00");
        assertThat(invoice.getCgst()).isEqualByComparingTo("0.00");
        assertThat(invoice.getSgst()).isEqualByComparingTo("0.00");
    }

    @Test
    void sellerStateComesFromSettingsAndDecidesInterState() {
        setting("companyStateCode", "Maharashtra");
        Invoice invoice = service.ensureInvoice(paidOrder(MAHARASHTRA_ADDRESS));
        assertThat(invoice.getSellerStateCode()).isEqualTo("27");
        assertThat(invoice.isInterState()).isFalse();
    }

    @Test
    void unknownBuyerStateFallsBackToSellerStateSoTheSupplyIsIntraState() {
        Invoice invoice = service.ensureInvoice(paidOrder(address("Somewhere Else")));
        assertThat(invoice.getBuyerStateCode()).isNull();
        assertThat(invoice.getPlaceOfSupply()).isEqualTo("08");
        assertThat(invoice.isInterState()).isFalse();
        assertThat(productLine(invoice, 0).getCgst()).isEqualByComparingTo("150.00");
    }

    // ---- shipping and round-off ------------------------------------------

    @Test
    void shippingIsAnUntaxedLineWithTheServiceCode() {
        Invoice invoice = service.ensureInvoice(paidOrder(RAJASTHAN_ADDRESS));

        InvoiceLine shipping = shippingLine(invoice);
        assertThat(shipping.getDescription()).isEqualTo("Shipping");
        assertThat(shipping.getHsnCode()).isEqualTo(InvoiceService.SHIPPING_SAC);
        assertThat(shipping.getSku()).isNull();
        assertThat(shipping.getQuantity()).isEqualTo(1);
        assertThat(shipping.getTaxableValue()).isEqualByComparingTo("50.00");
        assertThat(shipping.getGstRate()).isEqualByComparingTo("0.00");
        assertThat(shipping.getCgst()).isEqualByComparingTo("0.00");
        assertThat(shipping.getSgst()).isEqualByComparingTo("0.00");
        assertThat(shipping.getIgst()).isEqualByComparingTo("0.00");
        assertThat(shipping.getLineTotal()).isEqualByComparingTo("50.00");
        assertThat(shipping.getLineNo()).isEqualTo(invoice.getLines().size());

        // Shipping is not part of taxable value, only of the total.
        assertThat(invoice.getShipping()).isEqualByComparingTo("50.00");
        assertThat(invoice.getTaxableValue()).isEqualByComparingTo("10000.00");
        assertThat(invoice.getRoundOff()).isEqualByComparingTo("0.00");
        assertThat(invoice.getGrandTotal()).isEqualByComparingTo("10350.00");
    }

    @Test
    void noShippingLineWhenNothingWasCharged() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setShipping(BigDecimal.ZERO);
        order.setTotal(new BigDecimal("10300"));
        Invoice invoice = service.ensureInvoice(order);
        assertThat(invoice.getLines()).hasSize(1);
        assertThat(invoice.getLines()).noneMatch(InvoiceService::isShippingLine);
        assertThat(invoice.getRoundOff()).isEqualByComparingTo("0.00");
    }

    @Test
    void roundOffIsChargedMinusComputedAndGrandTotalIsWhatWasCharged() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setTotal(new BigDecimal("10349.60"));
        Invoice invoice = service.ensureInvoice(order);

        BigDecimal computed = invoice.getTaxableValue().add(invoice.getCgst()).add(invoice.getSgst())
                .add(invoice.getIgst()).add(invoice.getShipping());
        assertThat(computed).isEqualByComparingTo("10350.00");
        assertThat(invoice.getRoundOff()).isEqualByComparingTo("-0.40");
        assertThat(invoice.getGrandTotal()).isEqualByComparingTo("10349.60");
        assertThat(computed.add(invoice.getRoundOff())).isEqualByComparingTo(invoice.getGrandTotal());
    }

    @Test
    void giftCardAmountIsPartOfTheInvoiceValue() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setAppliedGiftCard("GC-1");
        order.setGiftCardAmount(new BigDecimal("2000"));
        order.setTotal(new BigDecimal("8350"));
        Invoice invoice = service.ensureInvoice(order);
        assertThat(invoice.getGrandTotal()).isEqualByComparingTo("10350.00");
        assertThat(invoice.getRoundOff()).isEqualByComparingTo("0.00");
        assertThat(invoice.getPaymentSummary()).contains("Razorpay payment pay_123").contains("Gift card GC-1");
    }

    // ---- discounts and rates ---------------------------------------------

    @Test
    void discountIsSplitInProportionAndEachCategoryKeepsItsRate() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.getItems().clear();
        order.getItems().add(item(product("Jewelry", "6000"), 1, "6000"));
        order.getItems().add(item(product("Gemstones", "2000"), 2, "2000"));
        order.setDiscount(new BigDecimal("1000"));
        order.setShipping(BigDecimal.ZERO);
        // 5400 + 162 + 3600 + 9 = 9171
        order.setTotal(new BigDecimal("9171"));

        Invoice invoice = service.ensureInvoice(order);

        InvoiceLine jewelry = productLine(invoice, 0);
        assertThat(jewelry.getDiscount()).isEqualByComparingTo("600.00");
        assertThat(jewelry.getTaxableValue()).isEqualByComparingTo("5400.00");
        assertThat(jewelry.getCgst()).isEqualByComparingTo("81.00");
        assertThat(jewelry.getSgst()).isEqualByComparingTo("81.00");

        InvoiceLine gems = productLine(invoice, 1);
        assertThat(gems.getQuantity()).isEqualTo(2);
        assertThat(gems.getUnitPrice()).isEqualByComparingTo("2000.00");
        assertThat(gems.getDiscount()).isEqualByComparingTo("400.00");
        assertThat(gems.getTaxableValue()).isEqualByComparingTo("3600.00");
        assertThat(gems.getGstRate()).isEqualByComparingTo("0.25");
        assertThat(gems.getCgst()).isEqualByComparingTo("4.50");
        assertThat(gems.getSgst()).isEqualByComparingTo("4.50");
        assertThat(gems.getHsnCode()).isEqualTo("7103");

        assertThat(invoice.getTaxableValue()).isEqualByComparingTo("9000.00");
        assertThat(invoice.getCgst()).isEqualByComparingTo("85.50");
        assertThat(invoice.getSgst()).isEqualByComparingTo("85.50");
        assertThat(invoice.getRoundOff()).isEqualByComparingTo("0.00");
    }

    @Test
    void taxRatesAndHsnComeFromSettingsAndTheProduct() {
        setting("taxRateJewelry", "0.05");
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.getItems().get(0).getProduct().setHsnCode(" 71131910 ");
        order.getItems().get(0).getProduct().setErpMaterialCode("fg-ring-1");
        Invoice invoice = service.ensureInvoice(order);

        InvoiceLine line = productLine(invoice, 0);
        assertThat(line.getGstRate()).isEqualByComparingTo("5.00");
        assertThat(line.getCgst()).isEqualByComparingTo("250.00");
        assertThat(line.getHsnCode()).isEqualTo("71131910");
        assertThat(line.getErpMaterialCode()).isEqualTo("FG-RING-1");
    }

    // ---- numbering and seller snapshot -------------------------------------

    @Test
    void invoiceNumberUsesPrefixFinancialYearAndTheNextSequenceValue() {
        setting("invoiceSeriesPrefix", "cl");
        Invoice invoice = service.ensureInvoice(paidOrder(RAJASTHAN_ADDRESS));
        String fy = InvoiceService.financialYear(LocalDate.now(InvoiceService.INDIA));
        assertThat(invoice.getInvoiceNumber()).isEqualTo("CL/" + fy + "/00042");
        assertThat(invoice.getFinancialYear()).isEqualTo(fy);
        verify(sequenceRepository).ensureRow(fy);
        verify(erpSyncService).enqueueSale(any(Order.class), any(Invoice.class));
    }

    @Test
    void sellerPanIsDerivedFromTheGstinWhenNotConfigured() {
        setting("companyGstin", "08ABCDE1234F1Z5");
        Invoice invoice = service.ensureInvoice(paidOrder(RAJASTHAN_ADDRESS));
        assertThat(invoice.getSellerPan()).isEqualTo("ABCDE1234F");
        assertThat(invoice.getSellerLegalName()).isEqualTo("Caratloop");
        assertThat(invoice.getBuyerName()).isEqualTo("Asha Rao");
        assertThat(invoice.getBuyerAddress()).contains("1 MG Road").contains("Rajasthan, India");
    }

    @Test
    void financialYearRunsAprilToMarch() {
        assertThat(InvoiceService.financialYear(LocalDate.of(2026, 3, 31))).isEqualTo("2025-26");
        assertThat(InvoiceService.financialYear(LocalDate.of(2026, 4, 1))).isEqualTo("2026-27");
        assertThat(InvoiceService.financialYear(LocalDate.of(2099, 12, 1))).isEqualTo("2099-00");
    }

    // ---- eligibility -----------------------------------------------------

    @Test
    void existingInvoiceIsReturnedWithoutRebuilding() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        Invoice existing = new Invoice();
        existing.setInvoiceNumber("WEB/2026-27/00001");
        when(invoiceRepository.findByOrderId(order.getId())).thenReturn(Optional.of(existing));

        assertThat(service.ensureInvoice(order)).isSameAs(existing);
        verify(invoiceRepository, never()).save(any());
        verify(erpSyncService, never()).enqueueSale(any(), any());
    }

    @Test
    void unpaidOnlineOrderIsNotEligible() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setStatus("PENDING_PAYMENT");
        assertThat(service.isEligible(order)).isFalse();
        assertThatThrownBy(() -> service.ensureInvoice(order))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("once the order is paid");
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void cashOnDeliveryIsEligibleOnlyOnceShipped() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setPaymentMethod("COD");
        order.setRazorpayPaymentId(null);
        assertThat(InvoiceService.isCashOnDelivery(order)).isTrue();

        order.setStatus("PAID");
        assertThat(service.isEligible(order)).isFalse();
        assertThatThrownBy(() -> service.ensureInvoice(order))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("cash-on-delivery");

        order.setStatus("SHIPPED");
        assertThat(service.isEligible(order)).isTrue();
        Invoice invoice = service.ensureInvoice(order);
        assertThat(invoice.getPaymentSummary()).isEqualTo("Cash on delivery");
    }

    @Test
    void codSettledThroughTheGatewayIsNotCashOnDelivery() {
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setPaymentMethod("COD");
        order.setRazorpayPaymentId("pay_999");
        assertThat(InvoiceService.isCashOnDelivery(order)).isFalse();
        assertThat(service.isEligible(order)).isTrue();
    }

    @Test
    void nullOrderOrStatusIsNeverEligible() {
        assertThat(service.isEligible(null)).isFalse();
        Order order = paidOrder(RAJASTHAN_ADDRESS);
        order.setStatus(null);
        assertThat(service.isEligible(order)).isFalse();
    }
}
