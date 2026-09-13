package com.jewelry.backend.dto;

import lombok.Data;

/** Optional body of the admin POST /api/v1/treasure/accounts/{id}/payment. */
@Data
public class TreasurePaymentNoteRequest {
    private String note;
}
