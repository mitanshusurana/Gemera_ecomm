package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RFQQuoteDTO {
    private BigDecimal price;
    private LocalDate validUntil;
    private String notes;
    private String status;
}
