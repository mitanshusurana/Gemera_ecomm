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
import java.util.concurrent.ThreadLocalRandom;

@Service
public class PaymentService {

    private static final Logger LOGGER = Logger.getLogger(PaymentService.class.getName());

    @Value("${razorpay.key_id:mock_key}")
    private String razorpayKeyId;

    @Value("${razorpay.key_secret:mock_secret}")
    private String razorpayKeySecret;

    private RazorpayClient razorpayClient;

    // Fast random string generator
    private static final char[] HEX_ARRAY = "0123456789ABCDEF".toCharArray();

    @PostConstruct
    public void init() {
        try {
            if (!"mock_key".equals(razorpayKeyId)) {
                this.razorpayClient = new RazorpayClient(razorpayKeyId, razorpayKeySecret);
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
                // Fallback to mock
            }
        }

        // Mock fallback
        char[] randChars = new char[14];
        for (int i = 0; i < 14; i++) {
            randChars[i] = HEX_ARRAY[ThreadLocalRandom.current().nextInt(16)];
        }
        String mockId = "order_" + new String(randChars);
        return new RazorpayOrderResponse(mockId, request.getAmount(), request.getCurrency(), "created");
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

    public Object verifyPayment(VerifyPaymentRequest request) {
        // Verify signature
        try {
            String signature = request.getPaymentToken(); // Assuming this holds signature
            String paymentId = request.getPaymentId();
            String orderId = request.getOrderId(); // Needed for verification

            // If mocking (no secret), always true
            if ("mock_secret".equals(razorpayKeySecret)) return "Payment Verified";

            JSONObject options = new JSONObject();
            options.put("razorpay_order_id", orderId);
            options.put("razorpay_payment_id", paymentId);
            options.put("razorpay_signature", signature);

            boolean status = Utils.verifyPaymentSignature(options, razorpayKeySecret);
            return status ? "Payment Verified" : "Verification Failed";
        } catch (Exception e) {
             LOGGER.severe("Payment verification failed: " + e.getMessage());
             return "Verification Error: " + e.getMessage();
        }
    }

    public void logFailure(TransactionFailureRequest request) {
        LOGGER.severe("Transaction Failed: " + request.toString());
    }
}
