package com.jewelry.backend.pricing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** The purity table and its label normalisation. */
class MetalPuritiesTest {

    @Test
    void tableHasSevenRowsInBoardOrderWithTheContractFractions() {
        assertThat(MetalPurities.ALL).extracting(p -> p.metal() + " " + p.label() + " " + p.fraction().toPlainString())
                .containsExactly(
                        "GOLD 24K 0.999", "GOLD 22K 0.916", "GOLD 18K 0.750", "GOLD 14K 0.585",
                        "SILVER 999 0.999", "SILVER 925 0.925",
                        "PLATINUM 950 0.950");
        assertThat(MetalPurities.fineLabel("GOLD")).isEqualTo("24K");
        assertThat(MetalPurities.fineLabel("SILVER")).isEqualTo("999");
        assertThat(MetalPurities.fineLabel("PLATINUM")).isEqualTo("950");
        assertThat(MetalPurities.fine("COPPER")).isNull();
        assertThat(MetalPurities.forMetal("gold")).hasSize(4);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "gold, GOLD", " Gold , GOLD", "Yellow Gold, GOLD", "AU, GOLD",
            "silver, SILVER", "Sterling Silver, SILVER",
            "platinum, PLATINUM", "Pt, PLATINUM"})
    void metalNamesNormalise(String raw, String expected) {
        assertThat(MetalPurities.normalizeMetal(raw)).isEqualTo(expected);
    }

    @Test
    void unknownMetalIsNull() {
        assertThat(MetalPurities.normalizeMetal(null)).isNull();
        assertThat(MetalPurities.normalizeMetal("")).isNull();
        assertThat(MetalPurities.normalizeMetal("brass")).isNull();
    }

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource({
            "GOLD, 22k, 22K", "GOLD, 916, 22K", "GOLD, ' 22 K ', 22K", "GOLD, 22KT, 22K",
            "GOLD, 999, 24K", "GOLD, 24K, 24K", "GOLD, 750, 18K", "GOLD, 585, 14K", "GOLD, 14, 14K",
            "SILVER, 925, 925", "SILVER, sterling, 925", "SILVER, 999, 999",
            "PLATINUM, 950, 950", "PLATINUM, PT950, 950"})
    void purityLabelsNormalise(String metal, String raw, String expected) {
        assertThat(MetalPurities.normalizePurity(metal, raw)).isEqualTo(expected);
    }

    @Test
    void purityOffTheTableIsNull() {
        assertThat(MetalPurities.normalizePurity("GOLD", "9K")).isNull();
        assertThat(MetalPurities.normalizePurity("SILVER", "22K")).isNull();
        assertThat(MetalPurities.normalizePurity("PLATINUM", "900")).isNull();
        assertThat(MetalPurities.normalizePurity("GOLD", null)).isNull();
        assertThat(MetalPurities.normalizePurity(null, "22K")).isNull();
        assertThat(MetalPurities.fraction("GOLD", "22K")).isEqualByComparingTo("0.916");
        assertThat(MetalPurities.fraction("GOLD", "9K")).isNull();
    }
}
