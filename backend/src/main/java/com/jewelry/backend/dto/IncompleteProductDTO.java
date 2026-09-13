package com.jewelry.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * One row of the admin "needs attention" list: a product that no longer
 * passes the required-field rules of its item type, with the human labels of
 * what is missing (FINISH-CONTRACT.md section 1).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class IncompleteProductDTO {
    private UUID id;
    private String sku;
    private String name;
    private String category;
    private String itemType;
    private List<String> missingFields;
}
