package com.jewelry.backend.dto;

import lombok.Data;
import java.util.UUID;
import java.time.LocalDateTime;

@Data
public class ReviewDTO {
    private UUID id;
    private Integer rating;
    private String comment;
    private UUID productId;
    private UUID userId;
    private String userName;
    private LocalDateTime createdAt;
}
