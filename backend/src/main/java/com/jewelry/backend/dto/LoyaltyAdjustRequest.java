package com.jewelry.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** POST /api/v1/admin/customers/{id}/loyalty/adjust */
@Data
public class LoyaltyAdjustRequest {
    @NotNull(message = "points is required")
    private Integer points; // signed, non-zero
    @NotBlank(message = "note is required")
    private String note;
}
