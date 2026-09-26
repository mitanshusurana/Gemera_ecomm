package com.jewelry.backend.service;

import com.jewelry.backend.entity.Category;
import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.StoneDetail;
import com.jewelry.backend.repository.CategoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Per-type required fields and price derivation. The category repository is a
 * Mockito mock that maps a category name onto an item type; nothing else is
 * needed because every rule is a pure function of the Product.
 */
class ProductRulesServiceTest {

    private ProductRulesService service;
    private CategoryRepository categoryRepository;

    @BeforeEach
    void setUp() {
        categoryRepository = mock(CategoryRepository.class);
        when(categoryRepository.findByNameIgnoreCase(anyString())).thenReturn(List.of());
        when(categoryRepository.findByDisplayNameIgnoreCase(anyString())).thenReturn(List.of());
        service = new ProductRulesService();
        service.categoryRepository = categoryRepository;
    }

    private void categoryOfType(String name, String itemType) {
        Category category = new Category();
        category.setName(name);
        category.setItemType(itemType);
        when(categoryRepository.findByNameIgnoreCase(name)).thenReturn(List.of(category));
    }

    /** A product as the API receives it: no sale mode yet, so the per-type default applies. */
    private static Product product(String category, String name) {
        Product p = new Product();
        p.setName(name);
        p.setCategory(category);
        p.setSaleMode(null);
        return p;
    }

    @Test
    void entityDefaultSaleModeIsRejectedForLotOnlyTypes() {
        // Product initialises saleMode to PER_PIECE; a GEMSTONE_LOT sells per lot or per carat only.
        categoryOfType("Lots", ProductRulesService.GEMSTONE_LOT);
        Product p = new Product();
        p.setName("Parcel");
        p.setCategory("Lots");
        assertThat(p.getSaleMode()).isEqualTo("PER_PIECE");
        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Sale mode PER_PIECE is not allowed for item type GEMSTONE_LOT");
    }

    // ---- static tables -------------------------------------------------

    @Test
    void defaultSaleModeIsTheFirstAllowedOne() {
        assertThat(ProductRulesService.defaultSaleMode(ProductRulesService.JEWELLERY)).isEqualTo("PER_PIECE");
        assertThat(ProductRulesService.defaultSaleMode(ProductRulesService.GEMSTONE_LOT)).isEqualTo("PER_LOT");
        assertThat(ProductRulesService.defaultSaleMode(ProductRulesService.STRAND_BEADS)).isEqualTo("PER_STRAND");
        assertThat(ProductRulesService.defaultSaleMode("UNKNOWN")).isEqualTo("PER_PIECE");
    }

    @Test
    void skuPrefixPerTypeWithJewelleryFallback() {
        assertThat(ProductRulesService.skuPrefix(ProductRulesService.LOOSE_GEMSTONE)).isEqualTo("ST");
        assertThat(ProductRulesService.skuPrefix(ProductRulesService.COMPONENT)).isEqualTo("CP");
        // The Javadoc promises JW for a null type too, but Map.of rejects null
        // keys and skuPrefix(null) throws; only the unknown-type fallback is asserted.
        assertThat(ProductRulesService.skuPrefix("UNKNOWN")).isEqualTo("JW");
    }

    // ---- item type resolution -------------------------------------------

    @Test
    void itemTypeComesFromTheCategoryOrItsAncestor() {
        Category root = new Category();
        root.setName("Gemstones");
        root.setItemType("loose_gemstone");
        Category leaf = new Category();
        leaf.setName("Sapphire");
        leaf.setParent(root);
        when(categoryRepository.findByNameIgnoreCase("Sapphire")).thenReturn(List.of(leaf));

        assertThat(service.resolveItemType("Sapphire")).isEqualTo("LOOSE_GEMSTONE");
        assertThat(service.resolveItemType("Nowhere")).isNull();
        assertThat(service.resolveItemType("  ")).isNull();
    }

    // ---- required fields per type ----------------------------------------

    @Test
    void jewelleryNeedsMetalTypePurityAndGrossWeight() {
        categoryOfType("Rings", ProductRulesService.JEWELLERY);
        Product p = product("Rings", "Plain band");
        p.setPrice(new BigDecimal("1000"));

        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("for JEWELLERY")
                .hasMessageContaining("metalDetails.metalType")
                .hasMessageContaining("metalDetails.metalPurity")
                .hasMessageContaining("grossWeight");

        MetalDetail metal = new MetalDetail();
        metal.setMetalType("Gold");
        metal.setMetalPurity("22K");
        p.setMetalDetails(metal);
        p.setGrossWeight(new BigDecimal("4.2"));
        assertThat(service.applyRules(p)).isEqualTo(ProductRulesService.JEWELLERY);
        assertThat(p.getSaleMode()).isEqualTo("PER_PIECE");
    }

    @Test
    void studdedJewelleryNeedsAtLeastOneStone() {
        categoryOfType("Rings", ProductRulesService.JEWELLERY);
        Product p = product("Rings", "Solitaire");
        p.setPrice(new BigDecimal("50000"));
        MetalDetail metal = new MetalDetail();
        metal.setMetalType("Gold");
        metal.setMetalPurity("18K");
        p.setMetalDetails(metal);
        p.setGrossWeight(new BigDecimal("3.1"));
        p.setPlainOrStudded("studded");

        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("stoneDetails");

        p.setStoneDetails(List.of(new StoneDetail()));
        service.applyRules(p);
        assertThat(p.getPlainOrStudded()).isEqualTo("STUDDED");
    }

    @Test
    void plainOrStuddedIsRejectedOutsideJewellery() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Ruby");
        p.setPlainOrStudded("PLAIN");
        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("plainOrStudded applies only to JEWELLERY");

        p.setPlainOrStudded("SHINY");
        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("PLAIN or STUDDED");
    }

    @Test
    void looseGemstoneNeedsCaratWeightSpeciesAndShape() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Ruby");
        p.setPrice(new BigDecimal("9000"));

        assertThatThrownBy(() -> service.applyRules(p))
                .hasMessageContaining("caratWeight")
                .hasMessageContaining("species or variety")
                .hasMessageContaining("shape");

        p.setCaratWeight(new BigDecimal("1.25"));
        p.setVariety("Ruby");
        p.setShape("Oval");
        assertThat(service.applyRules(p)).isEqualTo(ProductRulesService.LOOSE_GEMSTONE);
    }

    @Test
    void gemstoneLotNeedsPieceCountAndLotWeightAndDerivesAveragePieceWeight() {
        categoryOfType("Lots", ProductRulesService.GEMSTONE_LOT);
        Product p = product("Lots", "Sapphire parcel");
        p.setPrice(new BigDecimal("120000"));
        p.setSpecies("Corundum");

        assertThatThrownBy(() -> service.applyRules(p))
                .hasMessageContaining("pieceCount")
                .hasMessageContaining("lotTotalCaratWeight");

        p.setPieceCount(8);
        p.setLotTotalCaratWeight(new BigDecimal("10"));
        service.applyRules(p);
        assertThat(p.getSaleMode()).isEqualTo("PER_LOT");
        assertThat(p.getAveragePieceWeight()).isEqualByComparingTo("1.250");
    }

    @Test
    void roughIdolStrandAndComponentRequirements() {
        categoryOfType("Rough", ProductRulesService.ROUGH);
        Product rough = product("Rough", "Emerald rough");
        rough.setPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(rough))
                .hasMessageContaining("roughWeight").hasMessageContaining("roughMaterial");

        categoryOfType("Idols", ProductRulesService.IDOL_CARVING);
        Product idol = product("Idols", "Ganesha");
        idol.setPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(idol))
                .hasMessageContaining("gemstoneMaterial").hasMessageContaining("heightInches or dimensions");
        idol.setGemstoneMaterial("Rose quartz");
        idol.setDimensions("4x2x2 in");
        service.applyRules(idol);

        categoryOfType("Strands", ProductRulesService.STRAND_BEADS);
        Product strand = product("Strands", "Pearl strand");
        strand.setPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(strand))
                .hasMessageContaining("material").hasMessageContaining("beadSizeMm").hasMessageContaining("strandLengthInches");
        assertThat(strand.getSaleMode()).isEqualTo("PER_STRAND");

        categoryOfType("Findings", ProductRulesService.COMPONENT);
        Product component = product("Findings", "Clasp");
        component.setPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(component))
                .hasMessageContaining("componentType").hasMessageContaining("pieceCount or quantityPcs");
    }

    @Test
    void componentMirrorsPieceCountAndQuantityPcs() {
        categoryOfType("Findings", ProductRulesService.COMPONENT);
        Product p = product("Findings", "Jump rings");
        p.setPrice(BigDecimal.TEN);
        p.setComponentType("Jump ring");
        p.setQuantityPcs(50);
        service.applyRules(p);
        assertThat(p.getPieceCount()).isEqualTo(50);

        Product q = product("Findings", "Clasps");
        q.setPrice(BigDecimal.TEN);
        q.setComponentType("Clasp");
        q.setPieceCount(12);
        service.applyRules(q);
        assertThat(q.getQuantityPcs()).isEqualTo(12);
    }

    @Test
    void unknownCategorySkipsTypeRulesButStillNeedsNameCategoryAndPrice() {
        Product p = product("Mystery", "");
        assertThatThrownBy(() -> service.applyRules(p))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Missing required fields: name, price");

        p.setName("Thing");
        p.setPrice(BigDecimal.ONE);
        assertThat(service.applyRules(p)).isNull();
        assertThat(p.getSaleMode()).isEqualTo("PER_PIECE");
    }

    // ---- sale mode -------------------------------------------------------

    @Test
    void saleModeMustBeKnownAndAllowedForTheType() {
        categoryOfType("Rings", ProductRulesService.JEWELLERY);
        Product p = product("Rings", "Band");
        p.setSaleMode("PER_KILO");
        assertThatThrownBy(() -> service.applyRules(p)).hasMessageContaining("Unknown saleMode 'PER_KILO'");

        p.setSaleMode("per_carat");
        assertThatThrownBy(() -> service.applyRules(p))
                .hasMessageContaining("Sale mode PER_CARAT is not allowed for item type JEWELLERY");
    }

    // ---- price derivation --------------------------------------------------

    @Test
    void perCaratDerivesPriceFromUnitPriceTimesCaratWeight() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Sapphire");
        p.setSaleMode("PER_CARAT");
        p.setUnitPrice(new BigDecimal("12000"));
        p.setCaratWeight(new BigDecimal("2.345"));
        p.setVariety("Blue sapphire");
        p.setShape("Cushion");

        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("28140.00");
    }

    @Test
    void perCaratPrefersLotWeightOverCaratWeightOverRoughWeight() {
        categoryOfType("Rough", ProductRulesService.ROUGH);
        Product p = product("Rough", "Tourmaline rough");
        p.setSaleMode("PER_CARAT");
        p.setUnitPrice(new BigDecimal("100"));
        p.setRoughWeight(new BigDecimal("50"));
        p.setRoughMaterial("Tourmaline");
        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("5000.00");

        p.setLotTotalCaratWeight(new BigDecimal("20"));
        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("2000.00");
    }

    @Test
    void perGramDerivesPriceFromWeightWithMetalNetWeightAsLastResort() {
        categoryOfType("Findings", ProductRulesService.COMPONENT);
        Product p = product("Findings", "Gold wire");
        p.setSaleMode("PER_GRAM");
        p.setUnitPrice(new BigDecimal("6500.50"));
        p.setComponentType("Wire");
        p.setPieceCount(1);
        MetalDetail metal = new MetalDetail();
        metal.setNetWeight(new BigDecimal("2"));
        p.setMetalDetails(metal);

        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("13001.00");

        p.setGrossWeight(new BigDecimal("3"));
        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("19501.50");

        p.setTotalWeight(new BigDecimal("1.5"));
        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("9750.75");
    }

    @Test
    void derivationWithoutAQuantityFailsWithTheTypeSpecificFieldName() {
        categoryOfType("Lots", ProductRulesService.GEMSTONE_LOT);
        Product p = product("Lots", "Parcel");
        p.setSaleMode("PER_CARAT");
        p.setUnitPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(p))
                .hasMessage("Cannot derive price: lotTotalCaratWeight is required for PER_CARAT");

        categoryOfType("Findings", ProductRulesService.COMPONENT);
        Product c = product("Findings", "Wire");
        c.setSaleMode("PER_GRAM");
        c.setUnitPrice(BigDecimal.TEN);
        assertThatThrownBy(() -> service.applyRules(c))
                .hasMessage("Cannot derive price: totalWeight is required for PER_GRAM");
    }

    @ParameterizedTest(name = "{0}: unit price is the price")
    @CsvSource({"PER_PIECE", "PER_LOT", "PER_STRAND"})
    void unitModesTakeUnitPriceAsIs(String saleMode) {
        categoryOfType("Rough", ProductRulesService.ROUGH); // ROUGH allows PER_PIECE and PER_LOT
        categoryOfType("Strands", ProductRulesService.STRAND_BEADS); // and STRAND_BEADS allows PER_STRAND and PER_PIECE
        Product p = "PER_STRAND".equals(saleMode) ? product("Strands", "Strand") : product("Rough", "Rough");
        p.setSaleMode(saleMode);
        p.setUnitPrice(new BigDecimal("199.999"));
        p.setRoughWeight(BigDecimal.ONE);
        p.setRoughMaterial("Quartz");
        p.setMaterial("Pearl");
        p.setBeadSizeMm(new BigDecimal("6"));
        p.setStrandLengthInches(new BigDecimal("16"));

        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("200.00");
    }

    @Test
    void explicitPriceIsKeptWhenThereIsNoUnitPrice() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Garnet");
        p.setSaleMode("PER_CARAT");
        p.setPrice(new BigDecimal("777"));
        p.setCaratWeight(BigDecimal.ONE);
        p.setSpecies("Garnet");
        p.setShape("Round");
        service.applyRules(p);
        assertThat(p.getPrice()).isEqualByComparingTo("777");
    }

    @Test
    void missingPriceMessageMentionsUnitPriceForNonPieceModes() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Garnet");
        p.setSaleMode("PER_CARAT");
        p.setCaratWeight(BigDecimal.ONE);
        p.setSpecies("Garnet");
        p.setShape("Round");
        assertThatThrownBy(() -> service.applyRules(p))
                .hasMessageContaining("price (or unitPrice to derive it)");
    }

    // ---- dry run ---------------------------------------------------------

    @Test
    void missingFieldsIsANonThrowingDryRunWithHumanLabels() {
        categoryOfType("Rings", ProductRulesService.JEWELLERY);
        Product p = product("Rings", "Band");
        p.setSaleMode("PER_CARAT");

        List<String> missing = service.missingFields(p);
        assertThat(missing).containsExactly(
                "Sale mode", "Price (or unit price to derive it)", "Metal type", "Metal purity", "Gross weight (g)");
        // The dry run must not have changed the product.
        assertThat(p.getSaleMode()).isEqualTo("PER_CARAT");
        assertThat(p.getPrice()).isNull();
    }

    @Test
    void missingFieldsIsEmptyWhenPriceCanBeDerived() {
        categoryOfType("Loose", ProductRulesService.LOOSE_GEMSTONE);
        Product p = product("Loose", "Ruby");
        p.setSaleMode("PER_CARAT");
        p.setUnitPrice(BigDecimal.TEN);
        p.setCaratWeight(BigDecimal.ONE);
        p.setSpecies("Corundum");
        p.setShape("Oval");
        assertThat(service.missingFields(p)).isEmpty();
        assertThat(service.missingFields(null)).isEmpty();
    }
}
