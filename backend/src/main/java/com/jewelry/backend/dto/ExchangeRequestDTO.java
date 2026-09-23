package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Exchange request as the storefront and admin see it. The customer view
 * hides the PAN and ID proof (masked) and the admin-only notes; the admin
 * view carries everything plus the event timeline and ERP sync state.
 */
@Data
public class ExchangeRequestDTO {
    private UUID id;
    private String requestNumber;
    private UUID userId;
    private String customerName;
    private String email;
    private String phone;
    private String metal;
    private String declaredPurity;
    private BigDecimal declaredPurityFraction;
    private BigDecimal declaredWeightGrams;
    private BigDecimal quotedRatePerGram;
    private BigDecimal quotedDeductionPct;
    private BigDecimal quotedValue;
    private boolean quoteIndicative;
    private String status;
    private BigDecimal assayedPurityFraction;
    private BigDecimal assayedNetWeightGrams;
    private BigDecimal assayedRatePerGram;
    private BigDecimal deductionPct;
    private BigDecimal finalValue;
    private String rejectionReason;
    /** Masked for the customer (ABCDE****F), full for the admin. */
    private String pan;
    private boolean panRequired;
    private String idProofType;
    private String idProofNumber;
    private String stateCode;
    private String creditGiftCardCode;
    private String erpPurchaseRef;
    private String erpSyncStatus;
    private String erpSyncError;
    private String itemDescription;
    private String notes;
    private LocalDateTime receivedAt;
    private LocalDateTime assayedAt;
    private LocalDateTime creditedAt;
    private LocalDateTime closedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<Event> events;

    @Data
    public static class Event {
        private String status;
        private String note;
        private String actor;
        private LocalDateTime at;
    }
}
