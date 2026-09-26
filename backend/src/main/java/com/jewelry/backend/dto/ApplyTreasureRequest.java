package com.jewelry.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/** POST /api/v1/cart/apply-treasure */
@Data
public class ApplyTreasureRequest {
    @NotNull(message = "accountId is required")
    private UUID accountId;
}
