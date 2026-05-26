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

    @Column(columnDefinition = "boolean default true")
    private boolean isActive = true;

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
}
