package com.jewelry.backend.entity;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "products")
@Data
@EqualsAndHashCode(callSuper = true)
public class Product extends BaseEntity {
    private String name;
    private String description;
    private BigDecimal price;
    private String category;
    private String subCategory; // Added for new hierarchy
    private String sku; // Added for Intelligent SKU Generation
    private Integer stock;
    private String videoUrl;

    // Global e-commerce / inventory ownership
    private String inventoryOwnership; // "Owned Stock" vs "Consignment/Memo"

    @ElementCollection
    private List<String> seoQualifiers; // e.g., "Ethically Sourced", "Handmade"

    @ElementCollection
    private List<String> occasionKeywords;

    @ElementCollection
    private List<String> images;

    @ElementCollection
    private Map<String, String> specifications;

    @ElementCollection
    private List<CustomizationOption> customizationOptions;

    @ElementCollection
    private List<String> occasions;

    @ElementCollection
    private List<String> styles;

    // ----- SPECIFIC FIELDS FOR CATEGORIES -----

    // 1. Finished Jewelry
    private String metalType;
    private String metalPurity; // Karat
    private BigDecimal grossWeight;
    private BigDecimal netWeight;
    private BigDecimal totalCaratWeight;
    private String dimensions;
    private String currentLocation;
    private String huid; // HUID (India)
    private Boolean bisHallmark;
    private String hallmarkingDate;
    private String designStyle; // Modern/Vintage
    private String metalColor; // Yellow, White, Rose, etc.
    private String manufacturingTerminology; // Jadau, Kundan, Meenakari

    // 2. Loose Gemstones
    private String stoneSku;
    private String variety; // Species
    private String shapeCut;
    private BigDecimal caratWeight;
    private String colorHue; // Hue
    private String colorTone; // Tone
    private String colorSaturation; // Saturation
    private String clarity;
    private String measurements; // LxWxD
    private String treatmentStatus;
    private String labReportNumber; // e.g., GIA report number
    private String certificateImage;
    private String polish; // "Abr", "Brn", etc.
    private String symmetry; // "T/oc", "OR", etc.
    private String fluorescence; // None, Faint, Strong
    private String girdle;
    private String culet;
    private BigDecimal tablePercentage;
    private BigDecimal depthPercentage;
    private String originProvenance;
    private String stockStatus; // "Real" vs "Virtual"

    // 3. Religious Idols & Gemstone Carvings
    private String subjectDeityName; // Deity Name
    private String gemstoneMaterial;
    private String carvingStyle; // Intaglio, Cameo, Relief Carving, Hardstone Carving
    private String qualityDescription;
    private String asana; // Posture
    private String mudra; // Hand Gesture
    private String ayudha; // Sacred Attributes
    private String vahana; // Vehicle
    private String artistName;
    private String historicalContext;
    private String carvingTechnique; // diamond-tipped vs. laser engraving

    // 4. Manufacturing & Rough Materials
    private String lotNumber;
    private String mineOrigin;
    private String roughMaterial;
    private BigDecimal roughWeight; // Carats/Grams
    private String purchaseDate;
    private String supplierCode;
    private BigDecimal acquisitionCost;
    private String matrixParentRock;
    private String crystalMorphology;
    private BigDecimal yieldEstimate;
    private String wastageLog;
    private String manufacturingStage; // Planning, Sawing, Bruting, Faceting, Polishing

    // 5. Components & Materials
    private String componentType;
    private String material;
    private String purity;
    private Integer quantityPcs;
    private BigDecimal weightPerPiece;
    private BigDecimal totalWeight;
    private Integer reorderPointAlert;
    private String beadStyle; // Faceted/Round
    private String layoutPattern;
    private String vendorInformation;
    private Integer minOrderQuantity;

    @Embeddable
    @Data
    public static class CustomizationOption {
        private String type; // e.g. "METAL", "SIZE"
        private String name; // e.g. "Gold", "6"
        private BigDecimal priceModifier;
    }
}
