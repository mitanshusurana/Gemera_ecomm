package com.jewelry.backend.service;

import com.jewelry.backend.dto.*;
import com.razorpay.RazorpayClient;
import com.razorpay.Order;
import com.razorpay.Utils;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.UUID;
import java.util.logging.Logger;

@Service
public class PaymentService {

    private static final Logger LOGGER = Logger.getLogger(PaymentService.class.getName());

    // No defaults. A mock secret here meant signatures verified against a
    // publicly known key, so anyone could forge a PAID order.
    @Value("${razorpay.key_id:}")
    private String razorpayKeyId;

    @Value("${razorpay.key_secret:}")
    private String razorpayKeySecret;

    private RazorpayClient razorpayClient;

    @org.springframework.beans.factory.annotation.Autowired
    OrderCompletionService orderCompletionService;

    @PostConstruct
    public void init() {
        try {
            if (razorpayKeyId != null && !razorpayKeyId.isBlank()
                    && razorpayKeySecret != null && !razorpayKeySecret.isBlank()) {
                this.razorpayClient = new RazorpayClient(razorpayKeyId, razorpayKeySecret);
            } else {
                LOGGER.severe("Razorpay is not configured: set razorpay.key_id and "
                        + "razorpay.key_secret. Payment endpoints will fail closed.");
            }
        } catch (Exception e) {
            LOGGER.warning("Failed to initialize Razorpay client: " + e.getMessage());
        }
    }

    public RazorpayOrderResponse createRazorpayOrder(CreateRazorpayOrderRequest request) {
        if (razorpayClient != null) {
            try {
                JSONObject orderRequest = new JSONObject();
                // Frontend explicitly sends amount in subunits (paise)
                orderRequest.put("amount", request.getAmount());
                orderRequest.put("currency", request.getCurrency());
                orderRequest.put("receipt", "txn_" + UUID.randomUUID().toString().substring(0, 8));

                Order order = razorpayClient.orders.create(orderRequest);
                // Razorpay returns amount in subunits.
                return new RazorpayOrderResponse(order.get("id"), ((Integer)order.get("amount")), request.getCurrency(), order.get("status"));
            } catch (Exception e) {
                LOGGER.severe("Razorpay create order failed: " + e.getMessage());
                throw new IllegalStateException("Payment gateway error. Order was not created.", e);
            }
        }

        // Previously this fabricated an order id and reported "created", so the
        // caller could not distinguish a real gateway order from a mock one.
        throw new IllegalStateException(
                "Payment gateway is not configured. Order was not created.");
    }

    public Object initializePayment(InitializePaymentRequest request) {
        // Generic payment initialization
        // For Razorpay, it maps to creating an order
        if ("RAZORPAY".equalsIgnoreCase(request.getPaymentMethod())) {
             CreateRazorpayOrderRequest r = new CreateRazorpayOrderRequest();
             // Convert BigDecimal to Integer (subunits?)
             // Assuming InitializeRequest amount is in Base Unit (e.g. 10.50 INR)
             // Razorpay needs paisa (1050).
             // Multiply by 100.
             r.setAmount(request.getAmount().multiply(new java.math.BigDecimal("100")).intValue());
             r.setCurrency(request.getCurrency());
             return createRazorpayOrder(r);
        }
        // Handle other methods
        return "Payment initialized for " + request.getPaymentMethod();
    }

    public boolean verifyPayment(VerifyPaymentRequest request) {
        // Verify signature
        try {
            String signature = request.getPaymentToken();
            String paymentId = request.getPaymentId();
            String orderId = request.getOrderId();

            JSONObject options = new JSONObject();
            options.put("razorpay_order_id", orderId);
            options.put("razorpay_payment_id", paymentId);
            options.put("razorpay_signature", signature);

            boolean status = Utils.verifyPaymentSignature(options, razorpayKeySecret);
            if (!status) {
                throw new RuntimeException("Invalid Razorpay signature");
            }
        } catch (Exception e) {
             LOGGER.severe("Payment verification failed: " + e.getMessage());
             throw new RuntimeException("Payment verification failed", e);
        }

        // The signature is good: if the order for this gateway order id is
        // still waiting for payment, complete it here so the checkout page and
        // the webhook are interchangeable. A completion problem is logged, not
        // reported as a verification failure -- the payment itself is valid.
        try {
            orderCompletionService.markPaidIfPending(request.getOrderId(), request.getPaymentId());
        } catch (Exception e) {
            LOGGER.severe("Payment verified but order completion failed for "
                    + request.getOrderId() + ": " + e.getMessage());
        }
        return true;
    }

    public void logFailure(TransactionFailureRequest request) {
        LOGGER.severe("Transaction Failed: " + request.toString());
    }

    /**
     * Refunds {@code amountInr} of a captured payment through Razorpay and
     * returns the refund id. IllegalStateException (503 with the message)
     * when the gateway is not configured or declines: the caller is a status
     * transition that must not complete if the money did not move.
     */
    public String refund(String paymentId, java.math.BigDecimal amountInr, String note) {
        if (paymentId == null || paymentId.isBlank()) {
            throw new IllegalStateException("No Razorpay payment is recorded on this order, so nothing can be refunded.");
        }
        if (amountInr == null || amountInr.signum() <= 0) {
            throw new IllegalStateException("Refund amount must be greater than zero.");
        }
        if (razorpayClient == null) {
            throw new IllegalStateException("Payment gateway is not configured; the refund could not be issued.");
        }
        try {
            JSONObject request = new JSONObject();
            // Razorpay takes paise; scale 2 then shift keeps it exact.
            request.put("amount", amountInr.setScale(2, java.math.RoundingMode.HALF_UP).movePointRight(2).longValueExact());
            request.put("speed", "normal");
            if (note != null && !note.isBlank()) {
                JSONObject notes = new JSONObject();
                notes.put("reason", note.length() > 250 ? note.substring(0, 250) : note);
                request.put("notes", notes);
            }
            com.razorpay.Refund refund = razorpayClient.payments.refund(paymentId, request);
            String refundId = refund.get("id");
            LOGGER.info("Razorpay refund " + refundId + " issued for payment " + paymentId + " (" + amountInr + " INR)");
            return refundId;
        } catch (com.razorpay.RazorpayException e) {
            LOGGER.severe("Razorpay refund failed for payment " + paymentId + ": " + e.getMessage());
            throw new IllegalStateException("Razorpay refused the refund: " + e.getMessage(), e);
        } catch (Exception e) {
            LOGGER.severe("Razorpay refund failed for payment " + paymentId + ": " + e.getMessage());
            throw new IllegalStateException("Payment gateway error while refunding: " + e.getMessage(), e);
        }
    }
}
