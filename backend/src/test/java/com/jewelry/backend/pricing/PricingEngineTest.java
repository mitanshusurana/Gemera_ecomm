package com.jewelry.backend.pricing;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** rate x weight (+ wastage) + making + stones + other, rounded to the rupee. */
class PricingEngineTest {

    private static final LocalDateTime AT = LocalDateTime.of(2026, 9, 26, 10, 0);

    private static PricingEngine.Inputs inputs(String rate, String weight, String wastage, String makingType,
                                               String makingValue, String stones, String other) {
        return new PricingEngine.Inputs("GOLD", "22K", dec(rate), dec(weight), dec(wastage), makingType,
                dec(makingValue), dec(stones), dec(other));
    }

    private static BigDecimal dec(String value) {
        return value == null ? null : new BigDecimal(value);
    }

    @Test
    void perGramMakingIsChargedOnTheNetWeight() {
        PriceBreakdown b = PricingEngine.price(inputs("12824", "8.5", null, "PER_GRAM", "600", null, null), AT);
        assertThat(b.metalValue()).isEqualByComparingTo("109004.00");
        assertThat(b.makingCharges()).isEqualByComparingTo("5100.00");
        assertThat(b.stoneValue()).isEqualByComparingTo("0");
        assertThat(b.otherCharges()).isEqualByComparingTo("0");
        assertThat(b.price()).isEqualByComparingTo("114104.00");
        assertThat(b.makingChargeType()).isEqualTo("PER_GRAM");
        assertThat(b.metal()).isEqualTo("GOLD");
        assertThat(b.purity()).isEqualTo("22K");
        assertThat(b.ratePerGram()).isEqualByComparingTo("12824");
        assertThat(b.netWeightGrams()).isEqualByComparingTo("8.500");
        assertThat(b.pricedAt()).isEqualTo(AT);
    }

    @Test
    void percentMakingIsOnTheMetalValueIncludingWastage() {
        PriceBreakdown b = PricingEngine.price(inputs("12824", "8.5", "5", "PERCENT", "12", "2000", "150"), AT);
        assertThat(b.metalValue()).isEqualByComparingTo("114454.20");   // 12824 x 8.5 x 1.05
        assertThat(b.makingCharges()).isEqualByComparingTo("13734.50"); // 12 % of that
        assertThat(b.wastagePct()).isEqualByComparingTo("5.00");
        assertThat(b.price()).isEqualByComparingTo("130339.00");        // 114454.20 + 13734.50 + 2000 + 150 = 130338.70
    }

    @Test
    void fixedMakingIsAddedAsIs() {
        PriceBreakdown b = PricingEngine.price(inputs("12824", "8.5", "0", "FIXED", "3500", null, null), AT);
        assertThat(b.makingCharges()).isEqualByComparingTo("3500.00");
        assertThat(b.price()).isEqualByComparingTo("112504.00");
    }

    @Test
    void priceIsRoundedToTheRupeeHalfUp() {
        PriceBreakdown b = PricingEngine.price(inputs("10001", "1.5", null, "FIXED", "0.50", null, null), AT);
        assertThat(b.metalValue()).isEqualByComparingTo("15001.50");
        assertThat(b.price()).isEqualByComparingTo("15002.00");
        assertThat(b.price().scale()).isEqualTo(2);

        PriceBreakdown c = PricingEngine.price(inputs("10000", "2.345", "2.5", "PER_GRAM", "450.75", null, null), AT);
        assertThat(c.metalValue()).isEqualByComparingTo("24036.25");
        assertThat(c.makingCharges()).isEqualByComparingTo("1057.01");
        assertThat(c.price()).isEqualByComparingTo("25093.00");
    }

    @Test
    void makingTypeIsCaseInsensitiveAndDefaultsToPerGram() {
        assertThat(PricingEngine.normalizeMakingType(null)).isEqualTo("PER_GRAM");
        assertThat(PricingEngine.normalizeMakingType(" per-gram ")).isEqualTo("PER_GRAM");
        assertThat(PricingEngine.normalizeMakingType("percent")).isEqualTo("PERCENT");
        assertThat(PricingEngine.normalizeMakingType("Fixed")).isEqualTo("FIXED");
        assertThatThrownBy(() -> PricingEngine.normalizeMakingType("hourly"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("makingChargeType");
        PriceBreakdown b = PricingEngine.price(inputs("100", "2", null, null, "10", null, null), AT);
        assertThat(b.makingCharges()).isEqualByComparingTo("20.00");
    }

    @Test
    void pricingModeNormalises() {
        assertThat(PricingEngine.normalizeMode(null)).isEqualTo("FIXED");
        assertThat(PricingEngine.normalizeMode("  ")).isEqualTo("FIXED");
        assertThat(PricingEngine.normalizeMode("metal-rate")).isEqualTo("METAL_RATE");
        assertThat(PricingEngine.isMetalRate("Metal_Rate")).isTrue();
        assertThat(PricingEngine.isMetalRate("FIXED")).isFalse();
        assertThatThrownBy(() -> PricingEngine.normalizeMode("DYNAMIC")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidInputsAreRejected() {
        assertThatThrownBy(() -> PricingEngine.price(inputs(null, "1", null, "FIXED", "0", null, null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("rate");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "0", null, "FIXED", "0", null, null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("net weight");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "1", "-1", "FIXED", "0", null, null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("wastagePct");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "1", "101", "FIXED", "0", null, null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("wastagePct");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "1", null, "FIXED", "-5", null, null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("makingChargeValue");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "1", null, "FIXED", "0", "-1", null), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("stoneValue");
        assertThatThrownBy(() -> PricingEngine.price(inputs("100", "1", null, "FIXED", "0", null, "-1"), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("otherCharges");
        assertThatThrownBy(() -> PricingEngine.price(null, AT)).isInstanceOf(IllegalArgumentException.class);
    }
}
