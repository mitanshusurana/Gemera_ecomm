package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.dto.AddressDTO;
import com.jewelry.backend.entity.CartItem;
import com.jewelry.backend.entity.Invoice;
import com.jewelry.backend.entity.InvoiceLine;
import com.jewelry.backend.entity.InvoiceSequence;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.RepairJob;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.InvoiceRepository;
import com.jewelry.backend.repository.InvoiceSequenceRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.RepairJobRepository;
import com.jewelry.backend.util.GstStateCodes;
import com.jewelry.backend.util.IndianMoney;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Issues and renders GST tax invoices: for an order (kind GOODS) and for a
 * repair or service job (kind SERVICE).
 *
 * An invoice exists once, is never edited, and is issued only when the sale
 * is final: paid online (PAID and every later status) or, for cash on
 * delivery, once the parcel has left (SHIPPED and later). A service invoice
 * is issued when the job is DELIVERED or fully paid, whichever comes first.
 * Issuing happens after the originating transaction commits so that a
 * problem here can never undo a payment; the download endpoints issue
 * lazily as a fallback.
 *
 * ERP bridge: only order invoices are posted to the ERP (enqueueSale below).
 * Service invoices are not synced in this wave; the ERP has no service
 * sales endpoint yet, so they live in the store's books only.
 */
@Service
public class InvoiceService {

    private static final Logger LOGGER = Logger.getLogger(InvoiceService.class.getName());

    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    // SAC for the shipping line. It carries no tax because checkout did not
    // charge any; the code only tells the reader what the line is.
    static final String SHIPPING_SAC = "9965";

    // Defaults for the service series; every one is overridable in settings.
    static final String DEFAULT_SERVICE_PREFIX = "SRV";
    static final String DEFAULT_REPAIR_SAC = "998722";
    static final String DEFAULT_REPAIR_RATE = "0.18";

    private static final Set<String> ONLINE_ELIGIBLE = Set.of("PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED");
    private static final Set<String> COD_ELIGIBLE = Set.of("SHIPPED", "DELIVERED", "COMPLETED");

    @Autowired
    InvoiceRepository invoiceRepository;

    @Autowired
    InvoiceSequenceRepository invoiceSequenceRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    RepairJobRepository repairJobRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    ErpSyncService erpSyncService;

    @Autowired
    InvoicePdfRenderer pdfRenderer;

    @Autowired
    PlatformTransactionManager transactionManager;

    // ------------------------------------------------------------------
    // Eligibility and lookup
    // ------------------------------------------------------------------

    public Optional<Invoice> findForOrder(UUID orderId) {
        return orderId == null ? Optional.empty() : invoiceRepository.findByOrderId(orderId);
    }

    public Optional<Invoice> findForRepairJob(UUID jobId) {
        return jobId == null ? Optional.empty() : invoiceRepository.findByRepairJobId(jobId);
    }

    /** Cash on delivery that has not been settled through the gateway. */
    public static boolean isCashOnDelivery(Order order) {
        String method = order.getPaymentMethod();
        boolean codMethod = method != null
                && ("COD".equalsIgnoreCase(method.trim()) || "CASH_ON_DELIVERY".equalsIgnoreCase(method.trim()));
        boolean paidOnline = order.getRazorpayPaymentId() != null && !order.getRazorpayPaymentId().isBlank();
        return codMethod && !paidOnline;
    }

    public boolean isEligible(Order order) {
        if (order == null || order.getStatus() == null) {
            return false;
        }
        String status = order.getStatus().trim().toUpperCase();
        return isCashOnDelivery(order) ? COD_ELIGIBLE.contains(status) : ONLINE_ELIGIBLE.contains(status);
    }

    // ------------------------------------------------------------------
    // Issuing
    // ------------------------------------------------------------------

    /**
     * Returns the order's invoice, creating it on first call. Throws
     * EntityNotFoundException (404) when the order is not yet eligible, so
     * the download endpoint can answer with a JSON message.
     */
    @Transactional(rollbackFor = Exception.class)
    public Invoice ensureInvoice(Order order) {
        Optional<Invoice> existing = invoiceRepository.findByOrderId(order.getId());
        if (existing.isPresent()) {
            return existing.get();
        }
        if (!isEligible(order)) {
            throw new EntityNotFoundException(isCashOnDelivery(order)
                    ? "The tax invoice for a cash-on-delivery order is issued when it ships."
                    : "The tax invoice is issued once the order is paid.");
        }
        Invoice invoice = invoiceRepository.save(build(order));
        LOGGER.info("Issued invoice " + invoice.getInvoiceNumber() + " for order " + order.getOrderNumber());
        erpSyncService.enqueueSale(order, invoice);
        return invoice;
    }

    /**
     * Issues the invoice for {@code order} once the surrounding transaction
     * has committed (or immediately when there is none). Every failure is
     * logged and swallowed: the payment has already happened and the GET
     * endpoint issues lazily.
     */
    public void issueAfterCommit(Order order) {
        if (order == null || order.getId() == null) {
            return;
        }
        final UUID orderId = order.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    issueQuietly(orderId);
                }
            });
        } else {
            issueQuietly(orderId);
        }
    }

    private void issueQuietly(UUID orderId) {
        try {
            // REQUIRES_NEW: inside afterCommit the original resources are
            // still bound to the thread but can no longer commit, so the
            // invoice needs a transaction of its own.
            TransactionTemplate fresh = new TransactionTemplate(transactionManager);
            fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            fresh.execute(status -> {
                Order reloaded = orderRepository.findById(orderId).orElse(null);
                if (reloaded == null || !isEligible(reloaded)) {
                    return null;
                }
                return ensureInvoice(reloaded);
            });
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Invoice could not be issued for order " + orderId
                    + "; it will be generated on first download", e);
        }
    }

    public byte[] renderPdf(Invoice invoice) {
        return pdfRenderer.render(invoice);
    }

    // ------------------------------------------------------------------
    // Service invoices (repair jobs)
    // ------------------------------------------------------------------

    /**
     * The amount the customer is billed for a job: the final bill when staff
     * entered one, else the approved estimate. Null while neither exists.
     */
    public static BigDecimal billableAmount(RepairJob job) {
        if (job == null) return null;
        BigDecimal amount = job.getFinalAmount() != null ? job.getFinalAmount() : job.getEstimateAmount();
        return amount == null ? null : money(amount);
    }

    public static boolean isFullyPaid(RepairJob job) {
        BigDecimal billable = billableAmount(job);
        if (billable == null || billable.signum() <= 0) return false;
        return money(job.getPaidAmount()).compareTo(billable) >= 0;
    }

    /** DELIVERED, or fully paid, whichever comes first; never for a cancelled or zero-value job. */
    public boolean isServiceEligible(RepairJob job) {
        if (job == null || job.getStatus() == null || job.getStatus() == RepairJob.Status.CANCELLED) {
            return false;
        }
        BigDecimal billable = billableAmount(job);
        if (billable == null || billable.signum() <= 0) {
            return false;
        }
        return job.getStatus() == RepairJob.Status.DELIVERED || isFullyPaid(job);
    }

    /**
     * Returns the job's service invoice, creating it on first call. Throws
     * EntityNotFoundException (404) while the job is not yet eligible.
     */
    @Transactional(rollbackFor = Exception.class)
    public Invoice ensureServiceInvoice(RepairJob job) {
        Optional<Invoice> existing = invoiceRepository.findByRepairJobId(job.getId());
        if (existing.isPresent()) {
            return existing.get();
        }
        if (!isServiceEligible(job)) {
            throw new EntityNotFoundException("The tax invoice is issued once the job is paid or delivered.");
        }
        Invoice invoice = invoiceRepository.save(buildService(job));
        LOGGER.info("Issued service invoice " + invoice.getInvoiceNumber() + " for repair job " + job.getJobNumber());
        erpSyncService.enqueueServiceInvoice(invoice);
        return invoice;
    }

    /** Service twin of {@link #issueAfterCommit(Order)}: logged and swallowed on failure. */
    public void issueServiceAfterCommit(RepairJob job) {
        if (job == null || job.getId() == null) {
            return;
        }
        final UUID jobId = job.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    issueServiceQuietly(jobId);
                }
            });
        } else {
            issueServiceQuietly(jobId);
        }
    }

    private void issueServiceQuietly(UUID jobId) {
        try {
            TransactionTemplate fresh = new TransactionTemplate(transactionManager);
            fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            fresh.execute(status -> {
                RepairJob reloaded = repairJobRepository.findById(jobId).orElse(null);
                if (reloaded == null || !isServiceEligible(reloaded)) {
                    return null;
                }
                Invoice invoice = ensureServiceInvoice(reloaded);
                // Called again on payment completion: a job delivered before it
                // was paid already has its invoice, and the outbox row (if not
                // yet sent) picks up the payment that has just been recorded.
                erpSyncService.enqueueServiceInvoice(invoice);
                return invoice;
            });
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Service invoice could not be issued for repair job " + jobId
                    + "; it will be generated on first download", e);
        }
    }

    /**
     * Repair estimates and final bills are quoted to the customer GST
     * inclusive, so the taxable value is amount / (1 + rate) and the tax is
     * the remainder. The job collects no address, so the place of supply is
     * the seller's state and the split is CGST + SGST.
     */
    private Invoice buildService(RepairJob job) {
        Invoice invoice = new Invoice();
        invoice.setRepairJob(job);
        invoice.setInvoiceKind(Invoice.Kind.SERVICE);

        LocalDate today = LocalDate.now(INDIA);
        String fy = financialYear(today);
        invoice.setInvoiceDate(today);
        invoice.setFinancialYear(fy);
        String prefix = cleanPrefix(setting("serviceInvoiceSeriesPrefix", DEFAULT_SERVICE_PREFIX), DEFAULT_SERVICE_PREFIX);
        // Own counter per prefix so the goods series keeps its plain FY key.
        invoice.setInvoiceNumber(allocateNumber(prefix, fy, prefix + ":" + fy));

        String sellerState = applySeller(invoice);

        invoice.setBuyerName(blankToNull(job.getCustomerName()) == null ? "Customer" : job.getCustomerName().trim());
        List<String> contact = new ArrayList<>();
        if (notBlank(job.getPhone())) contact.add("Phone: " + job.getPhone().trim());
        if (notBlank(job.getEmail())) contact.add("Email: " + job.getEmail().trim());
        invoice.setBuyerAddress(contact.isEmpty() ? null : String.join("\n", contact));
        invoice.setBuyerGstin(null);
        invoice.setBuyerPan(null);
        // No buyer address is collected for a repair: supply at the counter.
        invoice.setBuyerStateCode(sellerState);
        invoice.setPlaceOfSupply(sellerState);
        invoice.setInterState(false);

        BigDecimal rate = new BigDecimal(setting("taxRateRepairService", DEFAULT_REPAIR_RATE));
        BigDecimal amount = billableAmount(job);
        BigDecimal taxable = amount.divide(BigDecimal.ONE.add(rate), 2, RoundingMode.HALF_UP);
        BigDecimal tax = amount.subtract(taxable);
        BigDecimal half = tax.divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
        BigDecimal otherHalf = tax.subtract(half);

        InvoiceLine line = new InvoiceLine();
        line.setInvoice(invoice);
        line.setLineNo(1);
        line.setDescription(describeService(job));
        line.setSku(null);
        line.setErpMaterialCode(null);
        line.setHsnCode(setting("repairServiceSac", DEFAULT_REPAIR_SAC));
        line.setQuantity(1);
        line.setUnitPrice(taxable);
        line.setDiscount(BigDecimal.ZERO.setScale(2));
        line.setTaxableValue(taxable);
        line.setGstRate(rate.movePointRight(2).setScale(2, RoundingMode.HALF_UP));
        line.setCgst(half);
        line.setSgst(otherHalf);
        line.setIgst(BigDecimal.ZERO.setScale(2));
        line.setLineTotal(amount);
        invoice.getLines().add(line);

        invoice.setTaxableValue(taxable);
        invoice.setCgst(half);
        invoice.setSgst(otherHalf);
        invoice.setIgst(BigDecimal.ZERO.setScale(2));
        invoice.setShipping(BigDecimal.ZERO.setScale(2));
        invoice.setRoundOff(BigDecimal.ZERO.setScale(2));
        invoice.setGrandTotal(amount);
        invoice.setPaymentSummary(servicePaymentSummary(job, amount));
        return invoice;
    }

    private static String describeService(RepairJob job) {
        String service = RepairNotificationService.serviceLabel(job.getServiceType());
        String item = job.getItemDescription() == null ? "" : job.getItemDescription().trim();
        String itemType = RepairNotificationService.itemLabel(job.getItemType());
        StringBuilder sb = new StringBuilder(service.isEmpty() ? "Repair service" : service);
        if (!item.isEmpty() || !itemType.isEmpty()) {
            sb.append(" - ");
            if (!itemType.isEmpty()) sb.append(itemType);
            if (!itemType.isEmpty() && !item.isEmpty()) sb.append(": ");
            sb.append(item);
        }
        sb.append(" (job ").append(job.getJobNumber()).append(')');
        return sb.toString();
    }

    private static String servicePaymentSummary(RepairJob job, BigDecimal amount) {
        BigDecimal paid = money(job.getPaidAmount());
        if (paid.signum() <= 0) {
            return "Balance due " + IndianMoney.rs(amount);
        }
        StringBuilder sb = new StringBuilder("Paid " + IndianMoney.rs(paid));
        if (job.getPaymentMode() != null) {
            sb.append(" by ").append(job.getPaymentMode() == RepairJob.PaymentMode.RAZORPAY ? "Razorpay" : job.getPaymentMode().name());
        }
        if (notBlank(job.getPaymentReference())) {
            sb.append(" (").append(job.getPaymentReference().trim()).append(')');
        }
        BigDecimal due = amount.subtract(paid);
        if (due.signum() > 0) {
            sb.append("; balance due ").append(IndianMoney.rs(due));
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    private Invoice build(Order order) {
        Invoice invoice = new Invoice();
        invoice.setOrder(order);

        LocalDate today = LocalDate.now(INDIA);
        String fy = financialYear(today);
        invoice.setInvoiceDate(today);
        invoice.setFinancialYear(fy);
        // The goods series keeps its original counter key (the bare FY) so
        // numbering continues where it was before service invoices existed.
        invoice.setInvoiceNumber(allocateNumber(cleanPrefix(setting("invoiceSeriesPrefix", "WEB"), "WEB"), fy, fy));
        invoice.setInvoiceKind(Invoice.Kind.GOODS);

        String sellerState = applySeller(invoice);

        // Buyer snapshot: billing address, else shipping, else the account.
        AddressDTO billing = parseAddress(order.getBillingAddress());
        AddressDTO shipping = parseAddress(order.getShippingAddress());
        AddressDTO buyer = billing != null ? billing : shipping;
        invoice.setBuyerName(buyerName(order, buyer));
        invoice.setBuyerAddress(addressText(buyer));
        invoice.setBuyerGstin(blankToNull(order.getBuyerGstin()));
        invoice.setBuyerPan(blankToNull(order.getBuyerPan()));

        String buyerState = buyer == null ? null : GstStateCodes.codeFor(buyer.getState());
        if (buyerState == null && shipping != null) {
            buyerState = GstStateCodes.codeFor(shipping.getState());
        }
        invoice.setBuyerStateCode(buyerState);
        String placeOfSupply = buyerState != null ? buyerState : sellerState;
        invoice.setPlaceOfSupply(placeOfSupply);
        boolean interState = !placeOfSupply.equals(sellerState);
        invoice.setInterState(interState);

        // Tax rates exactly as CartService reads them (fractions, e.g. 0.03).
        BigDecimal rateJewelry = new BigDecimal(setting("taxRateJewelry", "0.03"));
        BigDecimal rateGemstones = new BigDecimal(setting("taxRateGemstones", "0.0025"));
        BigDecimal rateDefault = new BigDecimal(setting("taxRateDefault", "0.03"));

        List<OrderItem> items = order.getItems() == null ? List.of() : order.getItems();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (OrderItem item : items) {
            subtotal = subtotal.add(lineValue(item));
        }
        BigDecimal discount = money(order.getDiscount());

        BigDecimal taxable = BigDecimal.ZERO;
        BigDecimal cgst = BigDecimal.ZERO;
        BigDecimal sgst = BigDecimal.ZERO;
        BigDecimal igst = BigDecimal.ZERO;
        int lineNo = 0;

        for (OrderItem item : items) {
            Product product = item.getProduct();
            BigDecimal value = lineValue(item);
            // Same proportional split as CartService.recalculateCart, so the
            // invoice reproduces the tax the customer saw at checkout.
            BigDecimal proportion = subtotal.signum() > 0
                    ? value.divide(subtotal, 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            BigDecimal lineDiscount = discount.multiply(proportion).setScale(2, RoundingMode.HALF_UP);
            BigDecimal lineTaxable = value.subtract(lineDiscount).max(BigDecimal.ZERO);

            String category = product == null ? null : product.getCategory();
            BigDecimal rate;
            if ("Jewelry".equalsIgnoreCase(category)) {
                rate = rateJewelry;
            } else if ("Gemstones".equalsIgnoreCase(category)) {
                rate = rateGemstones;
            } else {
                rate = rateDefault;
            }

            InvoiceLine line = new InvoiceLine();
            line.setInvoice(invoice);
            line.setLineNo(++lineNo);
            line.setDescription(describe(item));
            line.setSku(product == null ? null : blankToNull(product.getSku()));
            line.setErpMaterialCode(product == null ? null : blankToNull(product.getErpMaterialCode()));
            line.setHsnCode(hsnFor(product));
            line.setQuantity(item.getQuantity());
            line.setUnitPrice(money(item.getPrice() != null ? item.getPrice()
                    : (product == null ? null : product.getPrice())));
            line.setDiscount(lineDiscount);
            line.setTaxableValue(lineTaxable);
            line.setGstRate(rate.movePointRight(2).setScale(2, RoundingMode.HALF_UP));

            if (interState) {
                BigDecimal tax = lineTaxable.multiply(rate).setScale(2, RoundingMode.HALF_UP);
                line.setIgst(tax);
                line.setCgst(BigDecimal.ZERO.setScale(2));
                line.setSgst(BigDecimal.ZERO.setScale(2));
            } else {
                BigDecimal half = lineTaxable.multiply(rate).divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
                line.setCgst(half);
                line.setSgst(half);
                line.setIgst(BigDecimal.ZERO.setScale(2));
            }
            line.setLineTotal(lineTaxable.add(line.getCgst()).add(line.getSgst()).add(line.getIgst()));
            invoice.getLines().add(line);

            taxable = taxable.add(lineTaxable);
            cgst = cgst.add(line.getCgst());
            sgst = sgst.add(line.getSgst());
            igst = igst.add(line.getIgst());
        }

        BigDecimal shippingCharge = money(order.getShipping());
        if (shippingCharge.signum() > 0) {
            InvoiceLine line = new InvoiceLine();
            line.setInvoice(invoice);
            line.setLineNo(++lineNo);
            line.setDescription("Shipping");
            line.setHsnCode(SHIPPING_SAC);
            line.setQuantity(1);
            line.setUnitPrice(shippingCharge);
            line.setDiscount(BigDecimal.ZERO.setScale(2));
            line.setTaxableValue(shippingCharge);
            line.setGstRate(BigDecimal.ZERO.setScale(2));
            line.setCgst(BigDecimal.ZERO.setScale(2));
            line.setSgst(BigDecimal.ZERO.setScale(2));
            line.setIgst(BigDecimal.ZERO.setScale(2));
            line.setLineTotal(shippingCharge);
            invoice.getLines().add(line);
        }

        invoice.setTaxableValue(taxable);
        invoice.setCgst(cgst);
        invoice.setSgst(sgst);
        invoice.setIgst(igst);
        invoice.setShipping(shippingCharge);

        // The customer was charged order.total after the gift card and any
        // Treasure plan balance; the invoice value is the full amount, both
        // prepayments included.
        BigDecimal charged = money(order.getTotal()).add(money(order.getGiftCardAmount())).add(money(order.getTreasureAmount()));
        BigDecimal computed = taxable.add(cgst).add(sgst).add(igst).add(shippingCharge);
        BigDecimal roundOff = charged.subtract(computed);
        if (roundOff.abs().compareTo(BigDecimal.ONE) > 0) {
            LOGGER.warning("Invoice for order " + order.getOrderNumber() + ": recomputed value "
                    + computed + " differs from the amount charged " + charged + " by " + roundOff
                    + "; issuing with that round-off");
        }
        invoice.setRoundOff(roundOff);
        invoice.setGrandTotal(charged);
        invoice.setPaymentSummary(paymentSummary(order));
        return invoice;
    }

    /** Shipping is stored as a line for the printout but is not a product line. */
    public static boolean isShippingLine(InvoiceLine line) {
        return line.getSku() == null && SHIPPING_SAC.equals(line.getHsnCode());
    }

    /** Seller snapshot from settings; returns the seller's GST state code. */
    private String applySeller(Invoice invoice) {
        String sellerGstin = blankToNull(setting("companyGstin", null));
        String sellerPan = blankToNull(setting("companyPan", null));
        if (sellerPan == null && sellerGstin != null && sellerGstin.length() == 15) {
            // Characters 3 to 12 of a GSTIN are the holder's PAN.
            sellerPan = sellerGstin.substring(2, 12);
        }
        String sellerState = GstStateCodes.codeFor(setting("companyStateCode", "08"));
        if (sellerState == null && sellerGstin != null && sellerGstin.length() >= 2) {
            sellerState = GstStateCodes.codeFor(sellerGstin.substring(0, 2));
        }
        if (sellerState == null) {
            sellerState = "08";
        }
        invoice.setSellerLegalName(setting("companyLegalName", "Caratloop"));
        invoice.setSellerGstin(sellerGstin);
        invoice.setSellerPan(sellerPan);
        invoice.setSellerAddress(blankToNull(setting("companyAddress", null)));
        invoice.setSellerStateCode(sellerState);
        return sellerState;
    }

    /**
     * Next number in the series identified by {@code sequenceKey} (the
     * InvoiceSequence primary key: the bare financial year for the goods
     * series, "PREFIX:FY" for the service series), formatted PREFIX/FY/00001.
     */
    private String allocateNumber(String prefix, String fy, String sequenceKey) {
        invoiceSequenceRepository.ensureRow(sequenceKey);
        InvoiceSequence sequence = invoiceSequenceRepository.lockByFinancialYear(sequenceKey)
                .orElseThrow(() -> new IllegalStateException("Invoice sequence row missing for " + sequenceKey));
        long next = sequence.getLastNumber() + 1;
        sequence.setLastNumber(next);
        invoiceSequenceRepository.save(sequence);
        return prefix + "/" + fy + "/" + String.format("%05d", next);
    }

    private static String cleanPrefix(String prefix, String fallback) {
        return prefix == null || prefix.isBlank() ? fallback : prefix.trim().toUpperCase();
    }

    /** Indian financial year: April to March, written "2026-27". */
    static String financialYear(LocalDate date) {
        int startYear = date.getMonthValue() >= 4 ? date.getYear() : date.getYear() - 1;
        return startYear + "-" + String.format("%02d", (startYear + 1) % 100);
    }

    private static String hsnFor(Product product) {
        if (product != null && product.getHsnCode() != null && !product.getHsnCode().isBlank()) {
            return product.getHsnCode().trim();
        }
        String category = product == null ? null : product.getCategory();
        if ("Gemstones".equalsIgnoreCase(category)) {
            return "7103";
        }
        return "7113";
    }

    private static String describe(OrderItem item) {
        Product product = item.getProduct();
        // Custom lines (accepted quotes) carry their text on the item; product
        // lines fall back to the product name when the snapshot is empty.
        String name = notBlank(item.getDescription()) ? item.getDescription().trim()
                : (product == null || product.getName() == null ? "Item" : product.getName().trim());
        CartItem.CartItemOptions options = item.getOptions();
        if (options == null) {
            return name;
        }
        List<String> parts = new ArrayList<>();
        if (notBlank(options.getMetal())) parts.add("Metal: " + options.getMetal().trim());
        if (notBlank(options.getDiamond())) parts.add("Diamond: " + options.getDiamond().trim());
        if (notBlank(options.getStoneName())) parts.add("Stone: " + options.getStoneName().trim());
        if (notBlank(options.getCustomization())) parts.add(options.getCustomization().trim());
        return parts.isEmpty() ? name : name + " (" + String.join(", ", parts) + ")";
    }

    private static String paymentSummary(Order order) {
        List<String> parts = new ArrayList<>();
        if (notBlank(order.getRazorpayPaymentId())) {
            parts.add("Razorpay payment " + order.getRazorpayPaymentId().trim() + " " + IndianMoney.rs(order.getTotal()));
        }
        if (order.getGiftCardAmount() != null && order.getGiftCardAmount().signum() > 0) {
            String code = notBlank(order.getAppliedGiftCard()) ? " " + order.getAppliedGiftCard().trim() : "";
            parts.add("Gift card" + code + " " + IndianMoney.rs(order.getGiftCardAmount()));
        }
        if (order.getTreasureAmount() != null && order.getTreasureAmount().signum() > 0) {
            parts.add("Treasure plan " + IndianMoney.rs(order.getTreasureAmount()));
        }
        if (parts.isEmpty()) {
            return isCashOnDelivery(order) ? "Cash on delivery" : "Paid " + IndianMoney.rs(order.getTotal());
        }
        return String.join("; ", parts);
    }

    private static String buyerName(Order order, AddressDTO address) {
        if (address != null) {
            String name = (nz(address.getFirstName()) + " " + nz(address.getLastName())).trim();
            if (!name.isEmpty()) {
                return name;
            }
        }
        if (order.getUser() != null) {
            String name = (nz(order.getUser().getFirstName()) + " " + nz(order.getUser().getLastName())).trim();
            if (!name.isEmpty()) {
                return name;
            }
            return order.getUser().getEmail();
        }
        return "Customer";
    }

    private static String addressText(AddressDTO address) {
        if (address == null) {
            return null;
        }
        List<String> lines = new ArrayList<>();
        if (notBlank(address.getStreet())) lines.add(address.getStreet().trim());
        String cityLine = (nz(address.getCity()) + " " + nz(address.getZipCode())).trim();
        if (!cityLine.isEmpty()) lines.add(cityLine);
        String stateLine = (nz(address.getState()) + (notBlank(address.getCountry()) ? ", " + address.getCountry().trim() : "")).trim();
        if (!stateLine.isEmpty() && !stateLine.startsWith(",")) lines.add(stateLine);
        if (notBlank(address.getPhone())) lines.add("Phone: " + address.getPhone().trim());
        return lines.isEmpty() ? null : String.join("\n", lines);
    }

    AddressDTO parseAddress(String json) {
        if (json == null || json.isBlank() || "null".equals(json.trim())) {
            return null;
        }
        try {
            return objectMapper.readValue(json, AddressDTO.class);
        } catch (Exception e) {
            LOGGER.warning("Unreadable address JSON on order: " + e.getMessage());
            return null;
        }
    }

    private String setting(String key, String fallback) {
        return globalSettingRepository.findBySettingKey(key)
                .map(s -> s.getSettingValue())
                .filter(v -> v != null && !v.isBlank())
                .map(String::trim)
                .orElse(fallback);
    }

    private static BigDecimal lineValue(OrderItem item) {
        BigDecimal price = item.getPrice() != null ? item.getPrice()
                : (item.getProduct() != null ? item.getProduct().getPrice() : null);
        return money(price).multiply(BigDecimal.valueOf(item.getQuantity())).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
