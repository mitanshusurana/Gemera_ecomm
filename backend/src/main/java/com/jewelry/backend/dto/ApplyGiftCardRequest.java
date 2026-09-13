package com.jewelry.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ApplyGiftCardRequest {
    @NotBlank(message = "code is required")
    private String code;
}
