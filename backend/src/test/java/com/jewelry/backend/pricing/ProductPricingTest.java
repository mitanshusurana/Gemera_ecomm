package com.jewelry.backend.pricing;

import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Product fields to pricing inputs: pricing fields first, MetalDetail as the fallback, rate from the board. */
class ProductPricingTest {

    private static final LocalDateTime AT = LocalDateTime.of(2026, 9, 26, 10, 0);

    private static MetalRateBoardDTO board() {
        MetalRateBoardDTO board = new MetalRateBoardDTO();
        board.setSource("LOCKED");
        board.setRates(List.of(
                new MetalRateBoardDTO.RateDTO("GOLD", "24K", new BigDecimal("0.999"), new BigDecimal("13986"), "MANUAL"),
                new MetalRateBoardDTO.RateDTO("GOLD", "22K", new BigDecimal("0.916"), new BigDecimal("12824"), "MANUAL"),
                new MetalRateBoardDTO.RateDTO("SILVER", "925", new BigDecimal("0.925"), new BigDecimal("139"), "LIVE")));
        return board;
    }

    private static Product metalRateProduct() {
        Product p = new Product();
        p.setPricingMode("METAL_RATE");
        MetalDetail metal = new MetalDetail();
        metal.setMetalType("Gold");
        metal.setMetalPurity("916");
        metal.setNetWeight(new BigDecimal("8.5"));
        p.setMetalDetails(metal);
        p.setMakingChargeType("per_gram");
        p.setMakingChargeValue(new BigDecimal("600"));
        return p;
    }

    @Test
    void metalDetailsSupplyMetalPurityAndWeightWhenThePricingFieldsAreBlank() {
        Product p = metalRateProduct();
        PriceBreakdown b = ProductPricing.apply(p, board(), AT);
        assertThat(b.metal()).isEqualTo("GOLD");
        assertThat(b.purity()).isEqualTo("22K");
        assertThat(b.ratePerGram()).isEqualByComparingTo("12824");
        assertThat(b.price()).isEqualByComparingTo("114104.00");
        // normalised and stamped on the entity
        assertThat(p.getPricingMetal()).isEqualTo("GOLD");
        assertThat(p.getPricingPurity()).isEqualTo("22K");
        assertThat(p.getMakingChargeType()).isEqualTo("PER_GRAM");
        assertThat(p.getPrice()).isEqualByComparingTo("114104.00");
        assertThat(p.getMetalRateUsed()).isEqualByComparingTo("12824");
        assertThat(p.getPricedAt()).isEqualTo(AT);
    }

    @Test
    void pricingFieldsWinOverMetalDetails() {
        Product p = metalRateProduct();
        p.setPricingMetal("silver");
        p.setPricingPurity("sterling");
        p.setPricingNetWeightGrams(new BigDecimal("20"));
        p.setMakingChargeType("FIXED");
        p.setMakingChargeValue(new BigDecimal("500"));
        PriceBreakdown b = ProductPricing.apply(p, board(), AT);
        assertThat(b.metal()).isEqualTo("SILVER");
        assertThat(b.purity()).isEqualTo("925");
        assertThat(b.netWeightGrams()).isEqualByComparingTo("20");
        assertThat(b.price()).isEqualByComparingTo("3280.00"); // 139 x 20 + 500
    }

    @Test
    void fixedProductsAreLeftAloneApartFromTheMode() {
        Product p = new Product();
        p.setPrice(new BigDecimal("999.00"));
        assertThat(ProductPricing.apply(p, board(), AT)).isNull();
        assertThat(p.getPricingMode()).isEqualTo("FIXED");
        assertThat(p.getPrice()).isEqualByComparingTo("999.00");
        assertThat(p.getMetalRateUsed()).isNull();
        assertThat(ProductPricing.stored(p)).isNull();
    }

    @Test
    void missingMetalPurityWeightOrBoardLineIsA400() {
        Product noMetal = new Product();
        noMetal.setPricingMode("METAL_RATE");
        assertThatThrownBy(() -> ProductPricing.apply(noMetal, board(), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("pricingMetal");

        Product noPurity = new Product();
        noPurity.setPricingMode("METAL_RATE");
        noPurity.setPricingMetal("GOLD");
        assertThatThrownBy(() -> ProductPricing.apply(noPurity, board(), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("pricingPurity");

        Product offBoard = metalRateProduct();
        offBoard.setPricingPurity("18K"); // not on this board
        assertThatThrownBy(() -> ProductPricing.apply(offBoard, board(), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("No rate on today's board");

        Product noWeight = metalRateProduct();
        noWeight.getMetalDetails().setNetWeight(null);
        assertThatThrownBy(() -> ProductPricing.apply(noWeight, board(), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("net weight");
    }

    @Test
    void storedBreakdownIsRebuiltFromTheProductsOwnFields() {
        Product p = metalRateProduct();
        ProductPricing.apply(p, board(), AT);
        PriceBreakdown stored = ProductPricing.stored(p);
        assertThat(stored).isNotNull();
        assertThat(stored.price()).isEqualByComparingTo("114104.00");
        assertThat(stored.ratePerGram()).isEqualByComparingTo("12824");
        assertThat(stored.pricedAt()).isEqualTo(AT);

        p.setMetalRateUsed(null); // never priced
        assertThat(ProductPricing.stored(p)).isNull();
        p.setMetalRateUsed(new BigDecimal("12824"));
        p.setPricingNetWeightGrams(new BigDecimal("-1")); // no longer adds up: null, never an exception
        assertThat(ProductPricing.stored(p)).isNull();
    }
}
