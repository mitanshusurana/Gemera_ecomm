package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class NegotiationRequestDTO {
    private List<NegotiationItem> items;
    private BigDecimal requestedPrice;
    private String notes;

    @Data
    public static class NegotiationItem {
        private UUID productId;
        private int quantity;
    }
}
