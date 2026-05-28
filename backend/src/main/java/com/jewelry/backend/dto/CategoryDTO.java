package com.jewelry.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class CategoryDTO {
    private UUID id;
    private String name;
    private String displayName;
    private String image;

    @JsonProperty("isActive")
    private boolean isActive = true;
    private boolean showJewelryFields;
    private boolean showGemstoneFields;
    private boolean showComponentFields;
    private boolean showIdolFields;
    private boolean showRoughFields;
    private UUID parentId;

    private List<CategoryDTO> subcategories;
}
