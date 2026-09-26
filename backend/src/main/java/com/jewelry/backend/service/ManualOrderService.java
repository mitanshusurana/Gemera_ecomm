package com.jewelry.backend.service;

import com.jewelry.backend.dto.CreateRazorpayOrderRequest;
import com.jewelry.backend.dto.RazorpayOrderResponse;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.OrderItemRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Orders that do not come from the cart: an accepted RFQ quote and the
 * replacement order of an exchange. Lines are given explicitly (a product,
 * or a custom description), tax follows the category rules and shipping the
 * cart rules, a gift card may pay part or all of the total, and the rest is
 * collected through Razorpay against {@link #ensureGatewayOrder}.
 */
@Service
public class ManualOrderService {

    private static final Logger LOGGER = Logger.getLogger(ManualOrderService.class.getName());

    /** One line of a manual order. {@code product} is null for a custom (made-to-order) piece. */
    public record Line(Product product, String description, int quantity, BigDecimal unitPrice) {
    }

    /** What the storefront needs to open Razorpay for an order awaiting payment. */
    public record PaymentOrder(UUID orderId, String orderNumber, String status,
                               String razorpayOrderId, Integer amount, String currency, BigDecimal amountInr) {
    }

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    OrderItemRepository orderItemRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    CartService cartService;

    @Autowired
    GiftCardService giftCardService;

    @Autowired
    PaymentService paymentService;

    @Autowired
    InvoiceService invoiceService;

    @Autowired
    OrderNotificationService orderNotificationService;

    @Autowired
    LoyaltyService loyaltyService;

    /**
     * Creates the order in PENDING_PAYMENT (or PAID when a gift card covers
     * the whole total). Stock is reserved for product lines that track it.
     */
    @Transactional(rollbackFor = Exception.class)
    public Order create(User user, List<Line> lines, RFQ rfq, String giftCardCode,
                        String shippingAddressJson, String billingAddressJson, String internalNote) {
        if (user == null) {
            throw new IllegalArgumentException("The order needs a customer.");
        }
        if (lines == null || lines.isEmpty()) {
            throw new IllegalArgumentException("The order needs at least one line.");
        }
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;
        for (Line line : lines) {
            if (line.quantity() <= 0) {
                throw new IllegalArgumentException("Quantities must be at least 1.");
            }
            BigDecimal value = money(line.unitPrice()).multiply(BigDecimal.valueOf(line.quantity()));
            subtotal = subtotal.add(value);
            String category = line.product() == null ? null : line.product().getCategory();
            tax = tax.add(value.multiply(cartService.taxRateFor(category)));
        }
        subtotal = money(subtotal);
        tax = money(tax);
        BigDecimal shipping = money(cartService.shippingCharge(subtotal));
        BigDecimal total = subtotal.add(tax).add(shipping);

        Order order = new Order();
        order.setUser(user);
        order.setOrderNumber("ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        order.setStatus("PENDING_PAYMENT");
        order.setSubtotal(subtotal);
        order.setTax(tax);
        order.setShipping(shipping);
        order.setDiscount(BigDecimal.ZERO.setScale(2));
        order.setLoyaltyPointsRedeemed(0);
        order.setLoyaltyDiscount(BigDecimal.ZERO.setScale(2));
        order.setTreasureAmount(BigDecimal.ZERO.setScale(2));
        order.setRfq(rfq);
        order.setShippingAddress(shippingAddressJson);
        order.setBillingAddress(billingAddressJson);
        order.setPaymentMethod("RAZORPAY");
        order.setInternalNotes(internalNote);
        order.setEstimatedDelivery(LocalDate.now().plusDays(14));

        BigDecimal giftAmount = BigDecimal.ZERO;
        GiftCard card = null;
        if (giftCardCode != null && !giftCardCode.isBlank()) {
            card = giftCardService.requireRedeemable(giftCardCode);
            giftAmount = money(card.getBalance()).min(total).max(BigDecimal.ZERO);
        }
        order.setAppliedGiftCard(giftAmount.signum() > 0 ? card.getCode() : null);
        order.setGiftCardAmount(giftAmount);
        total = total.subtract(giftAmount);
        order.setTotal(total);
        if (giftAmount.signum() > 0 && total.signum() <= 0) {
            order.setPaymentMethod("GIFT_CARD");
            order.setStatus("PAID");
        }

        Order saved = orderRepository.save(order);
        for (Line line : lines) {
            Product product = null;
            if (line.product() != null && line.product().getId() != null) {
                product = productRepository.findByIdWithPessimisticWrite(line.product().getId())
                        .orElseThrow(() -> new EntityNotFoundException("Product not found"));
                if (product.getStock() != null) {
                    if (product.getStock() < line.quantity()) {
                        throw new IllegalArgumentException("Only " + product.getStock() + " of " + product.getName()
                                + " in stock; the order asks for " + line.quantity() + ".");
                    }
                    product.setStock(product.getStock() - line.quantity());
                    productRepository.save(product);
                }
            }
            OrderItem item = new OrderItem();
            item.setOrder(saved);
            item.setProduct(product);
            item.setDescription(line.description() != null && !line.description().isBlank()
                    ? line.description().trim()
                    : (product == null ? "Custom piece" : product.getName()));
            item.setQuantity(line.quantity());
            item.setPrice(money(line.unitPrice()));
            item.setUnitCost(product == null ? null : product.getCostPrice());
            orderItemRepository.save(item);
            saved.getItems().add(item);
        }

        if (giftAmount.signum() > 0) {
            giftCardService.redeem(card.getCode(), giftAmount);
        }
        if ("PAID".equals(saved.getStatus())) {
            loyaltyService.earnForOrder(saved);
            orderNotificationService.sendOrderConfirmation(saved);
            invoiceService.issueAfterCommit(saved);
        }
        LOGGER.info("Manual order " + saved.getOrderNumber() + " created (" + saved.getStatus() + ", total " + saved.getTotal() + ")");
        return saved;
    }

    /**
     * The Razorpay order for an order awaiting payment, created on first
     * call and reused afterwards. Payment then completes through
     * PaymentService.verifyPayment or the webhook (markPaidIfPending).
     * IllegalStateException (503) when the gateway is not configured.
     */
    @Transactional(rollbackFor = Exception.class)
    public PaymentOrder ensureGatewayOrder(Order order) {
        String status = order.getStatus() == null ? "" : order.getStatus().trim().toUpperCase();
        if (!"PENDING_PAYMENT".equals(status)) {
            throw new IllegalArgumentException("Order " + order.getOrderNumber() + " is not awaiting payment (" + status + ").");
        }
        BigDecimal amountInr = money(order.getTotal());
        if (amountInr.signum() <= 0) {
            throw new IllegalArgumentException("There is nothing left to pay on order " + order.getOrderNumber() + ".");
        }
        int paise = amountInr.movePointRight(2).intValueExact();
        if (order.getRazorpayOrderId() == null || order.getRazorpayOrderId().isBlank()) {
            CreateRazorpayOrderRequest request = new CreateRazorpayOrderRequest();
            request.setAmount(paise);
            request.setCurrency("INR");
            RazorpayOrderResponse created = paymentService.createRazorpayOrder(request);
            order.setRazorpayOrderId(created.getId());
            orderRepository.save(order);
        }
        return new PaymentOrder(order.getId(), order.getOrderNumber(), order.getStatus(),
                order.getRazorpayOrderId(), paise, "INR", amountInr);
    }

    static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
