package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;

@Data
public class RFQRequestDTO {
    private UUID id;
    private String rfqNumber;
    private String userId; // Usually returned, optional in request if using token
    private String email;
    private String companyName;
    private BigDecimal estimatedBudget;
    private String deliveryTimeline;
    private String additionalNotes;
    private String status;
    private LocalDateTime expiresAt;
    private List<RFQItemDTO> items;
    private List<RFQQuoteDTO> quotes;
}
