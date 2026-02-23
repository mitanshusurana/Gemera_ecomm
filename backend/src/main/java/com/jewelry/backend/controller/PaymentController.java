package com.jewelry.backend.controller;

import com.jewelry.backend.dto.*;
import com.jewelry.backend.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "*")
@Tag(name = "Payments", description = "Payment processing APIs")
public class PaymentController {

    @Autowired
    PaymentService paymentService;

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
