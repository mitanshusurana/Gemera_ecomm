package com.jewelry.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Request bodies of the repair endpoints, customer and admin. */
public final class RepairRequests {

    private RepairRequests() {
    }

    /**
     * {@code POST /api/v1/repairs/requests}. Signed-in customers may leave the
     * contact fields empty; they are filled from the account. Guests must send
     * name, phone and email.
     */
    public record Create(
            @Size(max = 120) String customerName,
            @Size(max = 32) String phone,
            @Size(max = 160) String email,
            @NotBlank @Size(max = 20) String itemType,
            @NotBlank @Size(max = 20) String serviceType,
            @NotBlank @Size(max = 1000) String itemDescription,
            @Size(max = 4000) String problemDescription,
            @DecimalMin(value = "0", inclusive = true) BigDecimal declaredValue,
            @Size(max = 10) List<@Size(max = 1000) String> photoUrls,
            @Size(max = 16) String ringSize,
            @Size(max = 16) String targetSize) {
    }

    /** {@code PUT /api/v1/admin/repairs/{id}/status}. */
    public record StatusUpdate(
            @NotBlank String status,
            @Size(max = 4000) String note,
            Boolean visibleToCustomer,
            LocalDate promisedDate) {
    }

    /** {@code PUT /api/v1/admin/repairs/{id}/estimate}. */
    public record Estimate(
            @NotNull @DecimalMin(value = "0", inclusive = true) BigDecimal estimateAmount,
            @Size(max = 4000) String estimateNote,
            LocalDate promisedDate) {
    }

    /** {@code PUT /api/v1/admin/repairs/{id}/assign}. Blank clears the assignment. */
    public record Assign(@Size(max = 120) String assignedTo) {
    }

    /** {@code PUT /api/v1/admin/repairs/{id}/payment}. */
    public record Payment(
            @DecimalMin(value = "0", inclusive = true) BigDecimal finalAmount,
            @DecimalMin(value = "0", inclusive = true) BigDecimal paidAmount,
            @Size(max = 20) String paymentMode,
            @Size(max = 120) String paymentReference) {
    }

    /** {@code PUT /api/v1/admin/repairs/{id}/notes}. */
    public record Notes(@Size(max = 8000) String internalNotes) {
    }
}
