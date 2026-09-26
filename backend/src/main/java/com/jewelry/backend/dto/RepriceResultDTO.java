package com.jewelry.backend.dto;

import java.time.LocalDateTime;

/** Result of repricing every METAL_RATE product from a board. */
public record RepriceResultDTO(int repriced, int skipped, LocalDateTime asOf) {
}
