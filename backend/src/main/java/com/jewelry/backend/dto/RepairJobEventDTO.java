package com.jewelry.backend.dto;

import java.time.LocalDateTime;

public record RepairJobEventDTO(
        String id,
        String status,
        String note,
        String actor,
        boolean visibleToCustomer,
        LocalDateTime createdAt) {
}
