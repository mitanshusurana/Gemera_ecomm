package com.jewelry.backend.dto;

import lombok.Data;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.List;
import java.util.Map;

@Data
public class ProductDTO {
    private UUID id;

    @NotBlank(message = "Name is required")
    private String name;
    private String description;

    @DecimalMin(value = "0.0", inclusive = false, message = "Price must be positive")
    private BigDecimal price;
    private String category;
    private String subCategory;
    private String sku;

    @Min(value = 0, message = "Stock cannot be negative")
    private Integer stock;
    private String videoUrl;

    private String inventoryOwnership;
    private List<String> seoQualifiers;
    private List<String> occasionKeywords;

    private List<String> images;
    private Map<String, String> specifications;
    private List<CustomizationOptionDTO> customizationOptions;
    private List<String> occasions;
    private List<String> styles;

    // ----- SPECIFIC FIELDS FOR CATEGORIES -----

    private String metalType;
    private String metalPurity;
    private BigDecimal grossWeight;
    private BigDecimal netWeight;
    private BigDecimal totalCaratWeight;
    private String dimensions;
    private String currentLocation;
    private String huid;
    private Boolean bisHallmark;
    private String hallmarkingDate;
    private String designStyle;
    private String metalColor;
    private String manufacturingTerminology;

    private String stoneSku;
    private String variety;
    private String shapeCut;
    private BigDecimal caratWeight;
    private String colorHue;
    private String colorTone;
    private String colorSaturation;
    private String clarity;
    private String measurements;
    private String treatmentStatus;
    private String labReportNumber;
    private String certificateImage;
    private String polish;
    private String symmetry;
    private String fluorescence;
    private String girdle;
    private String culet;
    private BigDecimal tablePercentage;
    private BigDecimal depthPercentage;
    private String originProvenance;
    private String stockStatus;

    private String subjectDeityName;
    private String gemstoneMaterial;
    private String carvingStyle;
    private String qualityDescription;
    private String asana;
    private String mudra;
    private String ayudha;
    private String vahana;
    private String artistName;
    private String historicalContext;
    private String carvingTechnique;

    private String lotNumber;
    private String mineOrigin;
    private String roughMaterial;
    private BigDecimal roughWeight;
    private String purchaseDate;
    private String supplierCode;
    private BigDecimal acquisitionCost;
    private String matrixParentRock;
    private String crystalMorphology;
    private BigDecimal yieldEstimate;
    private String wastageLog;
    private String manufacturingStage;

    private String componentType;
    private String material;
    private String purity;
    private Integer quantityPcs;
    private BigDecimal weightPerPiece;
    private BigDecimal totalWeight;
    private Integer reorderPointAlert;
    private String beadStyle;
    private String layoutPattern;
    private String vendorInformation;
    private Integer minOrderQuantity;

    @Data
    public static class CustomizationOptionDTO {
        private String type;
        private String name;
        private BigDecimal priceModifier;
    }
}
