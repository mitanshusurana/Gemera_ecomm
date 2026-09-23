package com.jewelry.backend.service;

import com.jewelry.backend.entity.Order;
import com.jewelry.backend.repository.OrderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.logging.Logger;

/**
 * Completes a Razorpay-paid order from whichever signal arrives first: the
 * checkout page's signature verification or the gateway webhook. Kept apart
 * from OrderService so PaymentService can depend on it without a cycle.
 */
@Service
public class OrderCompletionService {

    private static final Logger LOGGER = Logger.getLogger(OrderCompletionService.class.getName());

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    OrderNotificationService orderNotificationService;

    @Autowired
    InvoiceService invoiceService;

    /**
     * If an order exists for {@code razorpayOrderId} and is still
     * PENDING_PAYMENT, marks it PAID, records the payment id and sends the
     * confirmation e-mail. Idempotent: an order that is already past
     * PENDING_PAYMENT is returned unchanged. Empty when no order matches.
     */
    @Transactional(rollbackFor = Exception.class)
    public Optional<Order> markPaidIfPending(String razorpayOrderId, String razorpayPaymentId) {
        if (razorpayOrderId == null || razorpayOrderId.isBlank()) {
            return Optional.empty();
        }
        Optional<Order> found = orderRepository.findByRazorpayOrderId(razorpayOrderId);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        Order order = found.get();
        String status = order.getStatus() == null ? "PENDING_PAYMENT" : order.getStatus().trim().toUpperCase();
        if (!"PENDING_PAYMENT".equals(status)) {
            return Optional.of(order);
        }

        order.setStatus("PAID");
        if (razorpayPaymentId != null && !razorpayPaymentId.isBlank()
                && (order.getRazorpayPaymentId() == null || order.getRazorpayPaymentId().isBlank())) {
            order.setRazorpayPaymentId(razorpayPaymentId);
        }
        Order saved = orderRepository.save(order);
        LOGGER.info("Order " + saved.getOrderNumber() + " marked PAID for Razorpay order " + razorpayOrderId);

        orderNotificationService.sendOrderConfirmation(saved);
        // The GST invoice is issued after this transaction commits and can
        // never fail the payment (InvoiceService logs and the download
        // endpoint regenerates lazily).
        invoiceService.issueAfterCommit(saved);
        return Optional.of(saved);
    }
}
