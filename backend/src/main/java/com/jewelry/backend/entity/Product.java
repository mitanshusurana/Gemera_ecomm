package com.jewelry.backend.entity;

import jakarta.persistence.Column;
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
    private Boolean isVerified; // Added for Admin Verification Step
    private Integer stock;
    private String videoUrl;

    // Home-page "Curated Masterworks" flag. The column default lets
    // ddl-auto=update back-fill existing rows without a migration tool.
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean featured;

    // Drafts (GROWTH-CONTRACT.md section 1). Null (rows created before the
    // column existed) means published; only an explicit false hides a product
    // from the storefront, sitemap and feeds.
    @Column(columnDefinition = "boolean default true")
    private Boolean published;

    // Multi-channel feeds (GROWTH-CONTRACT.md section 2): admin opt-out per product.
    private Boolean excludeFromFeeds;

    // Returns and exchanges: null (rows that pre-date the column) means
    // returnable; only an explicit false blocks an RMA on this product.
    @Column(columnDefinition = "boolean default true")
    private Boolean returnable;

    // Counter notes from quick capture; admin-only, never on the public DTO.
    @Column(columnDefinition = "TEXT")
    private String internalNotes;

    // SEO Metadata
    private String seoTitle;
    private String seoDescription;
    private String ogImage;

    // Global e-commerce / inventory ownership
    private String inventoryOwnership; // "Owned Stock" vs "Consignment/Memo"
    private String supplierName; // Consignment Supplier
    private String returnDueDate; // Consignment Return Date
    private BigDecimal commissionPercentage; // Consignment Commission

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> seoQualifiers; // e.g., "Ethically Sourced", "Handmade"

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> occasionKeywords;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> images;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private Map<String, String> specifications;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<CustomizationOption> customizationOptions;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> occasions;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> styles;

    // ----- SPECIFIC FIELDS FOR CATEGORIES -----

    // 1. Finished Jewelry
    private BigDecimal grossWeight;
    private BigDecimal totalCaratWeight;
    private String dimensions;
    private String currentLocation;
    // HSN code for GST invoicing: 7113 jewellery, 7103 gemstones, 7102 rough
    // diamonds. Required per line item under CGST Rule 46; the catalogue had
    // nowhere to record it.
    private String hsnCode;

    // Code of this SKU in the ERP item master (docs/BUSINESS_GAPS.md, roadmap
    // item 4). Stored trimmed and upper-cased; null when not mapped. The ERP
    // bridge reads it so web sales relieve ERP stock and post COGS.
    private String erpMaterialCode;

    public void setErpMaterialCode(String erpMaterialCode) {
        String cleaned = erpMaterialCode == null ? null : erpMaterialCode.trim().toUpperCase();
        this.erpMaterialCode = cleaned == null || cleaned.isEmpty() ? null : cleaned;
    }

    // Landed cost per unit including making (docs/BUSINESS_GAPS.md: margin
    // and dead-stock value). Staff-only: EntityMapper never copies it to the
    // DTO, ProductController adds it for products.write callers. costUpdatedAt
    // is stamped by ProductService whenever the cost changes.
    private BigDecimal costPrice;
    private java.time.LocalDateTime costUpdatedAt;

    private String huid; // HUID (India)
    private Boolean bisHallmark;
    private String hallmarkingDate;
    private String designStyle; // Modern/Vintage
    private String metalColor; // Yellow, White, Rose, etc.
    private String manufacturingTerminology; // Jadau, Kundan, Meenakari

    @jakarta.persistence.OneToOne(cascade = jakarta.persistence.CascadeType.ALL)
    @jakarta.persistence.JoinColumn(name = "metal_detail_id")
    private MetalDetail metalDetails;

    @jakarta.persistence.OneToMany(fetch = jakarta.persistence.FetchType.EAGER, cascade = jakarta.persistence.CascadeType.ALL, orphanRemoval = true)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    @jakarta.persistence.JoinColumn(name = "product_id")
    private List<StoneDetail> stoneDetails;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @org.hibernate.annotations.Fetch(org.hibernate.annotations.FetchMode.SUBSELECT)
    private List<String> stoneDetailIds; // BOM linking to specific loose stones (legacy)

    // 2. Loose Gemstones
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
    private String measurements; // LxWxD
    private String treatmentStatus;
    private String labReportNumber; // e.g., GIA report number
    private String certificateLab; // GIA, IGI, GRS, SSEF, Gubelin, GII, IGL, Other
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

    // 6. Sale mode, lots, strands, carvings (INVENTORY-CONTRACT.md section 3).
    // All nullable so ddl-auto=update can add the columns without a migration.
    private String saleMode = "PER_PIECE"; // PER_PIECE, PER_CARAT, PER_GRAM, PER_LOT, PER_STRAND
    private BigDecimal unitPrice; // price per ct / g / piece for derived pricing
    private Integer pieceCount; // stones/beads/pieces in a lot, strand or pack
    private BigDecimal lotTotalCaratWeight;
    private BigDecimal averagePieceWeight; // ct, derived = lotTotalCaratWeight / pieceCount
    private String sizeRange; // e.g. "3-4 mm", "6x4 mm"
    private Boolean calibrated;
    private BigDecimal beadSizeMm;
    private BigDecimal strandLengthInches;
    private Integer strandCount; // strands per item (multi-line necklaces)
    private BigDecimal heightInches;
    private String craft; // Polki, Kundan, Meenakari, Jadau, Filigree, Temple, Antique, Plain, Other
    private String plainOrStudded; // PLAIN, STUDDED (JEWELLERY only)
    private String gemGrade; // PRECIOUS, SEMI_PRECIOUS, ORGANIC, LAB_GROWN

    // 7. Pricing from the metal rate (pricing/PricingEngine). pricingMode is
    // FIXED (default; null on rows that pre-date the column) or METAL_RATE.
    // For METAL_RATE, pricingMetal/pricingPurity/pricingNetWeightGrams fall
    // back to metalDetails, price is recomputed from the day's board on save,
    // on every lock and by the reprice endpoint; metalRateUsed and pricedAt
    // are server-stamped. Order, cart and invoice paths keep snapshotting
    // price, so a reprice never touches past documents.
    private String pricingMode; // FIXED | METAL_RATE
    private String pricingMetal; // GOLD | SILVER | PLATINUM
    private String pricingPurity; // 24K, 22K, 18K, 14K, 999, 925, 950
    private BigDecimal pricingNetWeightGrams;
    private String makingChargeType; // PER_GRAM | PERCENT | FIXED
    private BigDecimal makingChargeValue;
    private BigDecimal wastagePct;
    private BigDecimal stoneValue;
    private BigDecimal otherCharges;
    private BigDecimal metalRateUsed;
    private java.time.LocalDateTime pricedAt;

    @Embeddable
    @Data
    public static class CustomizationOption {
        private String type; // e.g. "METAL", "SIZE"
        private String name; // e.g. "Gold", "6"
        private BigDecimal priceModifier;
    }

    @Embeddable
    @Data
    public static class PriceBreakup {
        private BigDecimal metal;
        private BigDecimal gemstone;
        private BigDecimal makingCharges;
        private BigDecimal tax;
        private BigDecimal total;
        private BigDecimal discount;
        private BigDecimal grandTotal;
    }

    @jakarta.persistence.Embedded
    private PriceBreakup priceBreakup;
}
