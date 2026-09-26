package com.jewelry.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day of {@code GET /api/v1/metal-prices/history}. */
public record MetalRateHistoryPointDTO(LocalDate date, BigDecimal ratePerGram, String source) {
}
