package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class MetalDetailDTO {
    private UUID id;
    private String metalType;
    private String metalPurity;
    private BigDecimal netWeight;
}
