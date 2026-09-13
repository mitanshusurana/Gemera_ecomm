package com.jewelry.backend.service;

import com.jewelry.backend.entity.Category;
import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.repository.CategoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Item-type driven derivation and validation for products
 * (INVENTORY-CONTRACT.md sections 1, 3 and 4).
 *
 * The item type comes from the product's category (system name first, then
 * display name, case-insensitive, resolved through parent categories). An
 * unknown category is treated as JEWELLERY for defaults and SKU prefix, but
 * the per-type required-field checks are skipped for it.
 *
 * Every violation is an {@link IllegalArgumentException}; the global handler
 * turns it into a 400 whose "message" is the text passed here.
 */
@Service
public class ProductRulesService {

    public static final String JEWELLERY = "JEWELLERY";
    public static final String LOOSE_GEMSTONE = "LOOSE_GEMSTONE";
    public static final String GEMSTONE_LOT = "GEMSTONE_LOT";
    public static final String ROUGH = "ROUGH";
    public static final String IDOL_CARVING = "IDOL_CARVING";
    public static final String STRAND_BEADS = "STRAND_BEADS";
    public static final String COMPONENT = "COMPONENT";
    public static final String SET = "SET";

    public static final String PER_PIECE = "PER_PIECE";
    public static final String PER_CARAT = "PER_CARAT";
    public static final String PER_GRAM = "PER_GRAM";
    public static final String PER_LOT = "PER_LOT";
    public static final String PER_STRAND = "PER_STRAND";

    public static final String PLAIN = "PLAIN";
    public static final String STUDDED = "STUDDED";

    private static final List<String> ALL_SALE_MODES = List.of(PER_PIECE, PER_CARAT, PER_GRAM, PER_LOT, PER_STRAND);

    /** Allowed sale modes per item type; the first entry is the default (contract section 1). */
    private static final Map<String, List<String>> ALLOWED_SALE_MODES = Map.of(
            JEWELLERY, List.of(PER_PIECE),
            LOOSE_GEMSTONE, List.of(PER_PIECE, PER_CARAT),
            GEMSTONE_LOT, List.of(PER_LOT, PER_CARAT),
            ROUGH, List.of(PER_PIECE, PER_CARAT, PER_GRAM, PER_LOT),
            IDOL_CARVING, List.of(PER_PIECE),
            STRAND_BEADS, List.of(PER_STRAND, PER_PIECE),
            COMPONENT, List.of(PER_PIECE, PER_GRAM, PER_LOT),
            SET, List.of(PER_PIECE));

    /** SKU prefix per item type (contract section 4). */
    private static final Map<String, String> SKU_PREFIXES = Map.of(
            JEWELLERY, "JW",
            LOOSE_GEMSTONE, "ST",
            GEMSTONE_LOT, "LT",
            ROUGH, "RG",
            IDOL_CARVING, "ID",
            STRAND_BEADS, "SB",
            COMPONENT, "CP",
            SET, "SE");

    /**
     * Human labels for the field keys used in the "missing" lists below; the
     * save-path error message keeps the API field names, the dry run
     * ({@link #missingFields}) shows these instead.
     */
    private static final Map<String, String> FIELD_LABELS = Map.ofEntries(
            Map.entry("name", "Name"),
            Map.entry("category", "Category"),
            Map.entry("price", "Price"),
            Map.entry("price (or unitPrice to derive it)", "Price (or unit price to derive it)"),
            Map.entry("saleMode", "Sale mode"),
            Map.entry("plainOrStudded", "Plain or studded"),
            Map.entry("metalDetails.metalType", "Metal type"),
            Map.entry("metalDetails.metalPurity", "Metal purity"),
            Map.entry("grossWeight", "Gross weight (g)"),
            Map.entry("stoneDetails (at least one stone for STUDDED)", "Stone details (at least one stone for a studded piece)"),
            Map.entry("caratWeight", "Carat weight"),
            Map.entry("species or variety", "Species or variety"),
            Map.entry("shape", "Shape"),
            Map.entry("pieceCount", "Piece count"),
            Map.entry("lotTotalCaratWeight", "Lot total carat weight"),
            Map.entry("roughWeight", "Rough weight"),
            Map.entry("roughMaterial", "Rough material"),
            Map.entry("gemstoneMaterial", "Gemstone material"),
            Map.entry("heightInches or dimensions", "Height (in) or dimensions"),
            Map.entry("material", "Material"),
            Map.entry("beadSizeMm", "Bead size (mm)"),
            Map.entry("strandLengthInches", "Strand length (in)"),
            Map.entry("componentType", "Component type"),
            Map.entry("pieceCount or quantityPcs", "Piece count or quantity (pcs)"));

    @Autowired
    CategoryRepository categoryRepository;

    // ------------------------------------------------------------------
    // Item type resolution
    // ------------------------------------------------------------------

    /**
     * Resolves the item type from the product's category, falling back to its
     * subCategory. Null when neither names a category with an effective type.
     */
    public String resolveItemType(Product product) {
        if (product == null) {
            return null;
        }
        String itemType = resolveItemType(product.getCategory());
        if (itemType == null) {
            itemType = resolveItemType(product.getSubCategory());
        }
        return itemType;
    }

    /**
     * Looks a category up by system name, then by display name (both
     * case-insensitive) and returns its effective item type (own value or the
     * nearest ancestor's). Null when nothing matches or no ancestor has a type.
     */
    public String resolveItemType(String categoryName) {
        if (isBlank(categoryName)) {
            return null;
        }
        String needle = categoryName.trim();
        String itemType = firstEffectiveType(categoryRepository.findByNameIgnoreCase(needle));
        if (itemType == null) {
            itemType = firstEffectiveType(categoryRepository.findByDisplayNameIgnoreCase(needle));
        }
        return itemType;
    }

    private static String firstEffectiveType(List<Category> matches) {
        if (matches == null) {
            return null;
        }
        for (Category category : matches) {
            String itemType = category.getEffectiveItemType();
            if (itemType != null) {
                return itemType;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Static rule tables
    // ------------------------------------------------------------------

    public static List<String> allowedSaleModes(String itemType) {
        return ALLOWED_SALE_MODES.getOrDefault(itemType, List.of(PER_PIECE));
    }

    public static String defaultSaleMode(String itemType) {
        return allowedSaleModes(itemType).get(0);
    }

    /** JW for unknown/null item types, matching the "treat as JEWELLERY" rule. */
    public static String skuPrefix(String itemType) {
        return SKU_PREFIXES.getOrDefault(itemType, "JW");
    }

    // ------------------------------------------------------------------
    // Derivation and validation
    // ------------------------------------------------------------------

    /**
     * Applies the contract's derivations and validations to the entity in place.
     * Call it once the incoming data has been merged onto the entity that will be
     * saved (create: the new entity; update: the existing entity after the copy),
     * so required-field checks see the full record.
     *
     * Order: sale mode (normalise, default, enforce) -> plainOrStudded ->
     * COMPONENT pieceCount/quantityPcs copy -> averagePieceWeight -> derived
     * price -> required fields.
     *
     * @return the resolved item type, or null when the category is unknown
     */
    public String applyRules(Product product) {
        String itemType = resolveItemType(product);
        boolean known = itemType != null;
        String effectiveType = known ? itemType : JEWELLERY;

        // 1. Sale mode
        String saleMode = normalizeUpper(product.getSaleMode());
        if (saleMode == null) {
            saleMode = defaultSaleMode(effectiveType);
        }
        if (!ALL_SALE_MODES.contains(saleMode)) {
            throw new IllegalArgumentException("Unknown saleMode '" + product.getSaleMode()
                    + "'. Allowed values: " + String.join(", ", ALL_SALE_MODES));
        }
        if (known && !allowedSaleModes(itemType).contains(saleMode)) {
            throw new IllegalArgumentException("Sale mode " + saleMode + " is not allowed for item type " + itemType
                    + " (allowed: " + String.join(", ", allowedSaleModes(itemType)) + ")");
        }
        product.setSaleMode(saleMode);

        // 2. plainOrStudded (JEWELLERY only)
        String plainOrStudded = normalizeUpper(product.getPlainOrStudded());
        if (plainOrStudded != null) {
            if (!PLAIN.equals(plainOrStudded) && !STUDDED.equals(plainOrStudded)) {
                throw new IllegalArgumentException("plainOrStudded must be PLAIN or STUDDED, got '" + product.getPlainOrStudded() + "'");
            }
            if (known && !JEWELLERY.equals(itemType)) {
                throw new IllegalArgumentException("plainOrStudded applies only to JEWELLERY items, not " + itemType);
            }
        }
        product.setPlainOrStudded(plainOrStudded);

        // 3. COMPONENT: pieceCount and the legacy quantityPcs mirror each other when only one is given
        if (COMPONENT.equals(itemType)) {
            if (product.getPieceCount() == null && product.getQuantityPcs() != null) {
                product.setPieceCount(product.getQuantityPcs());
            } else if (product.getQuantityPcs() == null && product.getPieceCount() != null) {
                product.setQuantityPcs(product.getPieceCount());
            }
        }

        // 4. averagePieceWeight = lotTotalCaratWeight / pieceCount whenever both exist
        if (product.getLotTotalCaratWeight() != null && product.getPieceCount() != null && product.getPieceCount() > 0) {
            product.setAveragePieceWeight(product.getLotTotalCaratWeight()
                    .divide(BigDecimal.valueOf(product.getPieceCount()), 3, RoundingMode.HALF_UP));
        }

        // 5. Derived price
        derivePrice(product, saleMode, effectiveType);

        // 6. Required fields
        List<String> missing = new ArrayList<>();
        if (isBlank(product.getName())) {
            missing.add("name");
        }
        if (isBlank(product.getCategory())) {
            missing.add("category");
        }
        if (product.getPrice() == null) {
            missing.add(PER_PIECE.equals(saleMode) ? "price" : "price (or unitPrice to derive it)");
        }
        if (known) {
            missing.addAll(missingTypeFields(product, itemType, plainOrStudded));
        }
        if (!missing.isEmpty()) {
            throw new IllegalArgumentException("Missing required fields" + (known ? " for " + itemType : "")
                    + ": " + String.join(", ", missing));
        }

        return itemType;
    }

    /**
     * Dry run of the checks in {@link #applyRules}: nothing is changed, nothing
     * is thrown, and the result lists the rules the product fails as human
     * labels ("Gross weight (g)", "Metal purity", ...). Empty when the product
     * would save. Resolves the item type itself; use the two-argument overload
     * when the caller already has it (bulk scans).
     */
    public List<String> missingFields(Product product) {
        return missingFields(product, resolveItemType(product));
    }

    /**
     * Same as {@link #missingFields(Product)} with the item type already
     * resolved (null for an unknown category, which skips the per-type rules
     * exactly as the save path does).
     */
    public List<String> missingFields(Product product, String itemType) {
        List<String> keys = new ArrayList<>();
        if (product == null) {
            return keys;
        }
        boolean known = itemType != null;
        String effectiveType = known ? itemType : JEWELLERY;

        String saleMode = normalizeUpper(product.getSaleMode());
        if (saleMode == null) {
            saleMode = defaultSaleMode(effectiveType);
        }
        boolean saleModeValid = ALL_SALE_MODES.contains(saleMode)
                && (!known || allowedSaleModes(itemType).contains(saleMode));
        if (!saleModeValid) {
            keys.add("saleMode");
        }

        String plainOrStudded = normalizeUpper(product.getPlainOrStudded());
        if (plainOrStudded != null
                && ((!PLAIN.equals(plainOrStudded) && !STUDDED.equals(plainOrStudded))
                    || (known && !JEWELLERY.equals(itemType)))) {
            keys.add("plainOrStudded");
        }

        if (isBlank(product.getName())) {
            keys.add("name");
        }
        if (isBlank(product.getCategory())) {
            keys.add("category");
        }
        if (product.getPrice() == null && !(saleModeValid && canDerivePrice(product, saleMode))) {
            keys.add(PER_PIECE.equals(saleMode) ? "price" : "price (or unitPrice to derive it)");
        }
        if (known) {
            keys.addAll(missingTypeFields(product, itemType, plainOrStudded));
        }

        List<String> labels = new ArrayList<>(keys.size());
        for (String key : keys) {
            labels.add(FIELD_LABELS.getOrDefault(key, key));
        }
        return labels;
    }

    /** True when {@link #derivePrice} would produce a price without throwing. */
    private static boolean canDerivePrice(Product product, String saleMode) {
        if (product.getUnitPrice() == null) {
            return false;
        }
        switch (saleMode) {
            case PER_CARAT:
                return firstNonNull(product.getLotTotalCaratWeight(), product.getCaratWeight(), product.getRoughWeight()) != null;
            case PER_GRAM: {
                MetalDetail metal = product.getMetalDetails();
                return firstNonNull(product.getTotalWeight(), product.getGrossWeight(),
                        metal != null ? metal.getNetWeight() : null) != null;
            }
            default:
                return true;
        }
    }

    /**
     * price from unitPrice, only when unitPrice is set:
     * PER_CARAT -> unitPrice * (lotTotalCaratWeight ?? caratWeight ?? roughWeight);
     * PER_GRAM  -> unitPrice * (totalWeight ?? grossWeight ?? metalDetails.netWeight);
     * PER_LOT, PER_STRAND, PER_PIECE -> unitPrice. Rounded HALF_UP to 2 dp.
     */
    private static void derivePrice(Product product, String saleMode, String itemType) {
        BigDecimal unitPrice = product.getUnitPrice();
        if (unitPrice == null) {
            return;
        }
        BigDecimal quantity;
        switch (saleMode) {
            case PER_CARAT -> quantity = requireQuantity(
                    firstNonNull(product.getLotTotalCaratWeight(), product.getCaratWeight(), product.getRoughWeight()),
                    caratFieldFor(itemType), saleMode);
            case PER_GRAM -> {
                MetalDetail metal = product.getMetalDetails();
                quantity = requireQuantity(
                        firstNonNull(product.getTotalWeight(), product.getGrossWeight(),
                                metal != null ? metal.getNetWeight() : null),
                        gramFieldFor(itemType), saleMode);
            }
            default -> quantity = BigDecimal.ONE; // PER_PIECE, PER_LOT, PER_STRAND: the unit is the item itself
        }
        product.setPrice(unitPrice.multiply(quantity).setScale(2, RoundingMode.HALF_UP));
    }

    private static BigDecimal requireQuantity(BigDecimal quantity, String fieldName, String saleMode) {
        if (quantity == null) {
            throw new IllegalArgumentException("Cannot derive price: " + fieldName + " is required for " + saleMode);
        }
        return quantity;
    }

    /** The carat field the message should name for this item type. */
    private static String caratFieldFor(String itemType) {
        return switch (itemType) {
            case GEMSTONE_LOT -> "lotTotalCaratWeight";
            case ROUGH -> "roughWeight (or lotTotalCaratWeight)";
            default -> "caratWeight";
        };
    }

    /** The gram field the message should name for this item type. */
    private static String gramFieldFor(String itemType) {
        return switch (itemType) {
            case COMPONENT -> "totalWeight";
            default -> "grossWeight (or totalWeight)";
        };
    }

    /** Required fields per item type (contract section 4). */
    private static List<String> missingTypeFields(Product product, String itemType, String plainOrStudded) {
        List<String> missing = new ArrayList<>();
        switch (itemType) {
            case JEWELLERY, SET -> {
                MetalDetail metal = product.getMetalDetails();
                if (metal == null || isBlank(metal.getMetalType())) {
                    missing.add("metalDetails.metalType");
                }
                if (metal == null || isBlank(metal.getMetalPurity())) {
                    missing.add("metalDetails.metalPurity");
                }
                if (product.getGrossWeight() == null) {
                    missing.add("grossWeight");
                }
                if (STUDDED.equals(plainOrStudded)
                        && (product.getStoneDetails() == null || product.getStoneDetails().isEmpty())) {
                    missing.add("stoneDetails (at least one stone for STUDDED)");
                }
            }
            case LOOSE_GEMSTONE -> {
                if (product.getCaratWeight() == null) {
                    missing.add("caratWeight");
                }
                if (isBlank(product.getSpecies()) && isBlank(product.getVariety())) {
                    missing.add("species or variety");
                }
                if (isBlank(product.getShape())) {
                    missing.add("shape");
                }
            }
            case GEMSTONE_LOT -> {
                if (product.getPieceCount() == null) {
                    missing.add("pieceCount");
                }
                if (product.getLotTotalCaratWeight() == null) {
                    missing.add("lotTotalCaratWeight");
                }
                if (isBlank(product.getSpecies()) && isBlank(product.getVariety())) {
                    missing.add("species or variety");
                }
            }
            case ROUGH -> {
                if (product.getRoughWeight() == null) {
                    missing.add("roughWeight");
                }
                if (isBlank(product.getRoughMaterial())) {
                    missing.add("roughMaterial");
                }
            }
            case IDOL_CARVING -> {
                if (isBlank(product.getGemstoneMaterial())) {
                    missing.add("gemstoneMaterial");
                }
                if (product.getHeightInches() == null && isBlank(product.getDimensions())) {
                    missing.add("heightInches or dimensions");
                }
            }
            case STRAND_BEADS -> {
                if (isBlank(product.getMaterial())) {
                    missing.add("material");
                }
                if (product.getBeadSizeMm() == null) {
                    missing.add("beadSizeMm");
                }
                if (product.getStrandLengthInches() == null) {
                    missing.add("strandLengthInches");
                }
            }
            case COMPONENT -> {
                if (isBlank(product.getComponentType())) {
                    missing.add("componentType");
                }
                if (product.getPieceCount() == null && product.getQuantityPcs() == null) {
                    missing.add("pieceCount or quantityPcs");
                }
            }
            default -> {
                // Unknown type: no per-type requirements
            }
        }
        return missing;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static BigDecimal firstNonNull(BigDecimal... values) {
        for (BigDecimal value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String normalizeUpper(String value) {
        if (isBlank(value)) {
            return null;
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
