package com.jewelry.backend.service;

import com.jewelry.backend.dto.TransactionFailureRequest;
import com.jewelry.backend.entity.GiftCard;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.repository.GiftCardRepository;
import com.razorpay.Utils;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Razorpay webhook (OPERATIONS-CONTRACT.md section 4).
 *
 * The controller verifies first ({@link #verify}) and answers 401 when the
 * secret is unset or the signature is wrong; once verified it always answers
 * 200 so Razorpay does not retry a message we have already seen. Processing
 * is idempotent: an order that is already PAID and a gift card that is
 * already ACTIVE are left alone.
 */
@Service
public class PaymentWebhookService {

    private static final Logger LOGGER = Logger.getLogger(PaymentWebhookService.class.getName());

    @Value("${razorpay.webhook_secret:}")
    private String webhookSecret;

    @Autowired
    OrderCompletionService orderCompletionService;

    @Autowired
    GiftCardRepository giftCardRepository;

    @Autowired
    GiftCardService giftCardService;

    @Autowired
    PaymentService paymentService;

    /** True only when a secret is configured and the HMAC in the header matches the raw body. */
    public boolean verify(String body, String signature) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            LOGGER.warning("Razorpay webhook received but razorpay.webhook_secret is not set; rejecting");
            return false;
        }
        if (body == null || signature == null || signature.isBlank()) {
            return false;
        }
        try {
            return Utils.verifyWebhookSignature(body, signature, webhookSecret);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Razorpay webhook signature check failed: " + e.getMessage());
            return false;
        }
    }

    /** Handles one verified event body. Never throws: failures are logged. */
    public void process(String body) {
        JSONObject event;
        try {
            event = new JSONObject(body);
        } catch (Exception e) {
            LOGGER.warning("Razorpay webhook body is not JSON; ignoring");
            return;
        }

        String name = event.optString("event", "");
        JSONObject payload = event.optJSONObject("payload");
        JSONObject payment = entity(payload, "payment");
        JSONObject order = entity(payload, "order");

        String razorpayOrderId = payment != null ? payment.optString("order_id", null) : null;
        if (razorpayOrderId == null && order != null) {
            razorpayOrderId = order.optString("id", null);
        }
        String razorpayPaymentId = payment != null ? payment.optString("id", null) : null;

        try {
            switch (name) {
                case "payment.captured", "order.paid" -> handlePaid(name, razorpayOrderId, razorpayPaymentId);
                case "payment.failed" -> handleFailed(payment, razorpayOrderId, razorpayPaymentId);
                default -> LOGGER.fine("Ignoring Razorpay event " + name);
            }
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Razorpay webhook " + name + " for order " + razorpayOrderId + " could not be processed", e);
        }
    }

    private void handlePaid(String eventName, String razorpayOrderId, String razorpayPaymentId) {
        if (razorpayOrderId == null || razorpayOrderId.isBlank()) {
            LOGGER.warning("Razorpay " + eventName + " without an order id; ignoring");
            return;
        }

        Optional<Order> order = orderCompletionService.markPaidIfPending(razorpayOrderId, razorpayPaymentId);
        if (order.isPresent()) {
            LOGGER.info("Razorpay " + eventName + ": order " + order.get().getOrderNumber()
                    + " is " + order.get().getStatus());
            return;
        }

        Optional<GiftCard> card = giftCardRepository.findByRazorpayOrderId(razorpayOrderId);
        if (card.isPresent()) {
            GiftCard activated = giftCardService.confirmPaid(card.get().getId(), razorpayPaymentId);
            LOGGER.info("Razorpay " + eventName + ": gift card " + activated.getId() + " is " + activated.getStatus());
            return;
        }

        // The checkout may not have created the order yet; createOrder will
        // verify the signature itself and mark the order PAID when it runs.
        LOGGER.info("Razorpay " + eventName + " for " + razorpayOrderId + " matched no order or gift card yet");
    }

    private void handleFailed(JSONObject payment, String razorpayOrderId, String razorpayPaymentId) {
        TransactionFailureRequest failure = new TransactionFailureRequest();
        failure.setRazorpay_order_id(razorpayOrderId);
        failure.setRazorpay_payment_id(razorpayPaymentId);
        if (payment != null) {
            failure.setError_code(payment.optString("error_code", null));
            failure.setError_description(payment.optString("error_description", null));
        }
        paymentService.logFailure(failure);
    }

    /** payload.<key>.entity, or null when any level is missing. */
    private static JSONObject entity(JSONObject payload, String key) {
        if (payload == null) return null;
        JSONObject wrapper = payload.optJSONObject(key);
        return wrapper == null ? null : wrapper.optJSONObject("entity");
    }
}
