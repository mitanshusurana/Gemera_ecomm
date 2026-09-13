package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "categories")
@Data
@EqualsAndHashCode(callSuper = true)
public class Category extends BaseEntity {
    private String name; // System name
    private String displayName; // UI name
    private String image;

    @com.fasterxml.jackson.annotation.JsonProperty("isActive")
    @Column(columnDefinition = "boolean default true")
    private boolean isActive = true;

    /**
     * Inventory item type driving admin form sections, validation and SKU prefix:
     * JEWELLERY, LOOSE_GEMSTONE, GEMSTONE_LOT, ROUGH, IDOL_CARVING, STRAND_BEADS,
     * COMPONENT or SET. Null means "inherit from the nearest ancestor"; use
     * {@link #getEffectiveItemType()} to resolve it.
     */
    private String itemType;

    // Legacy section flags. Kept for compatibility; the DTO derives them from
    // the effective item type when one resolves.
    @Column(columnDefinition = "boolean default false")
    private boolean showJewelryFields;

    @Column(columnDefinition = "boolean default false")
    private boolean showGemstoneFields;

    @Column(columnDefinition = "boolean default false")
    private boolean showComponentFields;

    @Column(columnDefinition = "boolean default false")
    private boolean showIdolFields;

    @Column(columnDefinition = "boolean default false")
    private boolean showRoughFields;


    @ManyToOne
    @JoinColumn(name = "parent_id")
    @JsonBackReference
    @ToString.Exclude
    private Category parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL)
    @JsonManagedReference
    @ToString.Exclude
    private List<Category> subcategories = new ArrayList<>();

    /**
     * The item type that applies to this category: its own when set, otherwise
     * the nearest ancestor's. Null when no ancestor declares one. Bounded so a
     * cyclic parent chain cannot loop forever.
     */
    @Transient
    @com.fasterxml.jackson.annotation.JsonIgnore
    public String getEffectiveItemType() {
        Category current = this;
        int depth = 0;
        while (current != null && depth < 32) {
            String type = current.getItemType();
            if (type != null && !type.trim().isEmpty()) {
                return type.trim().toUpperCase(java.util.Locale.ROOT);
            }
            current = current.getParent();
            depth++;
        }
        return null;
    }
}
