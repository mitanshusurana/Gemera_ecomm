package com.jewelry.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** POST /api/v1/cart/apply-points */
@Data
public class ApplyPointsRequest {
    @NotNull(message = "points is required")
    @Min(value = 1, message = "points must be at least 1")
    private Integer points;
}
