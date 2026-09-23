package com.jewelry.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/** POST /api/v1/exchange/requests body. Guests must give name, phone and email; signed-in users may omit them. */
@Data
public class CreateExchangeRequest {

    @NotBlank(message = "metal is required")
    private String metal; // GOLD | SILVER

    @NotBlank(message = "purity is required")
    private String purity; // 24K, 22K, 18K, 14K, 999, 925 ...

    @NotNull(message = "weightGrams is required")
    @DecimalMin(value = "0.1", message = "weightGrams must be at least 0.1")
    @Digits(integer = 9, fraction = 3, message = "weightGrams may have at most 3 decimals")
    private BigDecimal weightGrams;

    @Size(max = 120)
    private String customerName;

    @Size(max = 255)
    private String email;

    @Size(max = 32)
    private String phone;

    @Size(max = 10)
    private String pan;

    @Size(max = 40)
    private String idProofType;

    @Size(max = 64)
    private String idProofNumber;

    /** GST state code or state name of the seller; optional. */
    @Size(max = 40)
    private String state;

    @Size(max = 2000)
    private String itemDescription;
}
