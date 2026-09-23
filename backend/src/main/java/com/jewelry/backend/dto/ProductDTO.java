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
    private Boolean isVerified;

    @Min(value = 0, message = "Stock cannot be negative")
    private Integer stock;
    private String videoUrl;
    private Boolean featured;

    // Drafts and feeds (GROWTH-CONTRACT.md sections 1 and 2). published is
    // null on a create request when the client did not say; the service
    // defaults it to true.
    private Boolean published;
    private Boolean excludeFromFeeds;

    // Admin-only: the mapper never fills this, ProductController adds it for
    // ADMIN callers and the create/update paths read it. Hidden when null so
    // public responses do not carry the key at all.
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String internalNotes;

    private String seoTitle;
    private String seoDescription;
    private String ogImage;

    private String inventoryOwnership;
    private String supplierName;
    private String returnDueDate;
    private BigDecimal commissionPercentage;

    private List<String> seoQualifiers;
    private List<String> occasionKeywords;

    private List<String> images;
    private Map<String, String> specifications;
    private List<CustomizationOptionDTO> customizationOptions;
    private List<String> occasions;
    private List<String> styles;

    // ----- SPECIFIC FIELDS FOR CATEGORIES -----

    private BigDecimal grossWeight;
    private BigDecimal totalCaratWeight;
    private String dimensions;
    private String currentLocation;
    private String hsnCode;
    // ERP item-master code (Product.erpMaterialCode); null when the SKU is not mapped.
    private String erpMaterialCode;
    private String huid;
    private Boolean bisHallmark;
    private String hallmarkingDate;
    private String designStyle;
    private String metalColor;
    private String manufacturingTerminology;

    private MetalDetailDTO metalDetails;
    private List<StoneDetailDTO> stoneDetails;

    private List<String> stoneDetailIds; // legacy

    private String stoneSku;
    private String species;
    private String variety;
    private String shape;
    private String cut;
    private BigDecimal caratWeight;
    private String colorHue;
    private String colorTone;
    private String colorSaturation;
    private String colorTradeTerm;
    private String clarity;
    private String measurements;
    private String treatmentStatus;
    private String labReportNumber;
    private String certificateLab;
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

    // Sale mode, lots, strands, carvings (INVENTORY-CONTRACT.md section 3)
    private String saleMode;
    private BigDecimal unitPrice;
    private Integer pieceCount;
    private BigDecimal lotTotalCaratWeight;
    private BigDecimal averagePieceWeight;
    private String sizeRange;
    private Boolean calibrated;
    private BigDecimal beadSizeMm;
    private BigDecimal strandLengthInches;
    private Integer strandCount;
    private BigDecimal heightInches;
    private String craft;
    private String plainOrStudded;
    private String gemGrade;

    @Data
    public static class CustomizationOptionDTO {
        private String type;
        private String name;
        private BigDecimal priceModifier;
    }

    @Data
    public static class PriceBreakupDTO {
        private BigDecimal metal;
        private BigDecimal gemstone;
        private BigDecimal makingCharges;
        private BigDecimal tax;
        private BigDecimal total;
        private BigDecimal discount;
        private BigDecimal grandTotal;
    }

    private PriceBreakupDTO priceBreakup;
}
