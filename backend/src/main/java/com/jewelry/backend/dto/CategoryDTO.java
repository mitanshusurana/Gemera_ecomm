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

    /**
     * On read: the effective item type (own value or inherited from the nearest
     * ancestor). On write (admin create/update): the category's own value; null
     * means inherit from the parent.
     */
    private String itemType;

    // Legacy flags, derived from itemType when it resolves. Frontends should
    // switch on itemType instead.
    private boolean showJewelryFields;
    private boolean showGemstoneFields;
    private boolean showComponentFields;
    private boolean showIdolFields;
    private boolean showRoughFields;
    private UUID parentId;

    private List<CategoryDTO> subcategories;
}
