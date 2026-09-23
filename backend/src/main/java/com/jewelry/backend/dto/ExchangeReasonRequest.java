package com.jewelry.backend.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/** Body for the admin reject / cancel / receive actions: an optional free-text reason or note. */
@Data
public class ExchangeReasonRequest {

    @Size(max = 2000, message = "reason may not exceed 2000 characters")
    private String reason;

    @Size(max = 2000, message = "note may not exceed 2000 characters")
    private String note;
}
