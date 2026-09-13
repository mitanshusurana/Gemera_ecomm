package com.jewelry.backend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class GiftCardPurchaseRequest {
    @NotNull(message = "amount is required")
    @DecimalMin(value = "500", message = "amount must be at least 500")
    @DecimalMax(value = "100000", message = "amount may not exceed 100000")
    @Digits(integer = 6, fraction = 0, message = "amount must be a whole number of rupees")
    private BigDecimal amount;

    @NotBlank(message = "purchaserEmail is required")
    @Email(message = "purchaserEmail must be a valid email address")
    @Size(max = 255)
    private String purchaserEmail;

    @NotBlank(message = "recipientName is required")
    @Size(max = 120, message = "recipientName may not exceed 120 characters")
    private String recipientName;

    @NotBlank(message = "recipientEmail is required")
    @Email(message = "recipientEmail must be a valid email address")
    @Size(max = 255)
    private String recipientEmail;

    @Size(max = 500, message = "message may not exceed 500 characters")
    private String message;

    @NotBlank(message = "theme is required")
    @Pattern(regexp = "classic|gold|ruby", message = "theme must be one of classic, gold, ruby")
    private String theme;
}
