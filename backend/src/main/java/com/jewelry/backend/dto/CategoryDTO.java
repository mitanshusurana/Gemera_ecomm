package com.jewelry.backend.dto;

import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class CategoryDTO {
    private UUID id;
    private String name;
    private String displayName;
    private String image;
    private List<CategoryDTO> subcategories;
}
