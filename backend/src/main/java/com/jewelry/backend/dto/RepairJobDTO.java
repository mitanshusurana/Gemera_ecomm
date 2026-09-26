package com.jewelry.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * A repair job as the storefront (customer view) and the admin see it.
 * {@code internalNotes} and {@code assignedTo} are null in the customer
 * view; {@code events} holds only customer-visible events there.
 */
public record RepairJobDTO(
        String id,
        String jobNumber,
        String customerName,
        String phone,
        String email,
        String itemType,
        String itemDescription,
        String serviceType,
        String problemDescription,
        BigDecimal declaredValue,
        List<String> photoUrls,
        String ringSize,
        String targetSize,
        String status,
        BigDecimal estimateAmount,
        String estimateNote,
        LocalDateTime estimateApprovedAt,
        LocalDate promisedDate,
        BigDecimal finalAmount,
        BigDecimal paidAmount,
        String paymentMode,
        String paymentReference,
        /** Open Razorpay order for the amount due, admin view only; null once settled. */
        String razorpayOrderId,
        BigDecimal paymentDueAmount,
        /** Rupees still owed on the bill (final amount, else the estimate); null before an estimate exists. */
        BigDecimal amountDue,
        /** Service tax invoice, once issued. */
        String invoiceNumber,
        LocalDate invoiceDate,
        String assignedTo,
        String internalNotes,
        LocalDateTime receivedAt,
        LocalDateTime readyAt,
        LocalDateTime deliveredAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<String> allowedTransitions,
        List<RepairJobEventDTO> events) {
}
