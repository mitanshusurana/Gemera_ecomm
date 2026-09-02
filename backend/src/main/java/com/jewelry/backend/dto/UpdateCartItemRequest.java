package com.jewelry.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateCartItemRequest {
    @NotNull(message = "quantity is required")
    @Min(value = 0, message = "quantity may not be negative")
    @Max(value = 100, message = "quantity may not exceed 100")
    private Integer quantity;
}
