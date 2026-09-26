package com.jewelry.backend.dto;

import java.math.BigDecimal;

/**
 * {@code POST /api/v1/repairs/{jobNumber}/payments/order}: the Razorpay order
 * the storefront opens the checkout modal with. {@code amount} is in paise,
 * as Razorpay expects; {@code amountInr} is the same value in rupees for
 * display. The public key is not sent: the storefront carries it in its
 * environment, as checkout does.
 */
public record RepairPaymentOrderDTO(
        String jobNumber,
        String razorpayOrderId,
        int amount,
        String currency,
        BigDecimal amountInr,
        String customerName,
        String email,
        String phone) {
}
