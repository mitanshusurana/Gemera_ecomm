package com.jewelry.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Public tracking view ({@code GET /api/v1/repairs/track/{jobNumber}?phone=}).
 * Deliberately narrower than RepairJobDTO: no contact details beyond the
 * first name, no internal fields, only customer-visible events.
 */
public record RepairTrackingDTO(
        String jobNumber,
        String customerFirstName,
        String itemType,
        String itemDescription,
        String serviceType,
        String status,
        BigDecimal estimateAmount,
        String estimateNote,
        LocalDateTime estimateApprovedAt,
        boolean estimateAwaitingApproval,
        LocalDate promisedDate,
        BigDecimal finalAmount,
        BigDecimal paidAmount,
        LocalDateTime createdAt,
        List<RepairJobEventDTO> events) {
}
