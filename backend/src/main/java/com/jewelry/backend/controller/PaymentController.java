package com.jewelry.backend.controller;

import com.jewelry.backend.dto.*;
import com.jewelry.backend.service.PaymentService;
import com.jewelry.backend.service.PaymentWebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")

@Tag(name = "Payments", description = "Payment processing APIs")
public class PaymentController {

    @Autowired
    PaymentService paymentService;

    @Autowired
    PaymentWebhookService paymentWebhookService;

    /**
     * Razorpay server-to-server webhook (permitAll in SecurityConfig). The raw
     * body is needed verbatim for the HMAC check, hence {@code String}.
     * 401 when the secret is unset or the signature is wrong; otherwise 200,
     * whatever happens during processing, so Razorpay does not retry.
     */
    @PostMapping("/payments/webhook")
    @Operation(summary = "Razorpay webhook: payment.captured / order.paid complete orders and gift cards; payment.failed is logged")
    public ResponseEntity<Void> razorpayWebhook(
            @RequestBody String body,
            @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        if (!paymentWebhookService.verify(body, signature)) {
            return ResponseEntity.status(401).build();
        }
        paymentWebhookService.process(body);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/payments/razorpay-order")
    @Operation(summary = "Create Razorpay Order ID")
    public ResponseEntity<RazorpayOrderResponse> createRazorpayOrder(@RequestBody CreateRazorpayOrderRequest request) {
        return ResponseEntity.ok(paymentService.createRazorpayOrder(request));
    }

    @PostMapping("/transactions/failure")
    @Operation(summary = "Log failed transaction")
    public ResponseEntity<Void> logTransactionFailure(@RequestBody TransactionFailureRequest request) {
        paymentService.logFailure(request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/payments/initialize")
    @Operation(summary = "Initialize Generic Payment")
    public ResponseEntity<Object> initializePayment(@RequestBody InitializePaymentRequest request) {
        return ResponseEntity.ok(paymentService.initializePayment(request));
    }

    @PostMapping("/payments/verify")
    @Operation(summary = "Verify Payment")
    public ResponseEntity<Object> verifyPayment(@RequestBody VerifyPaymentRequest request) {
        return ResponseEntity.ok(paymentService.verifyPayment(request));
    }
}
