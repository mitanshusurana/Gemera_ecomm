package com.jewelry.backend.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class GstStateCodesTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "Rajasthan, 08",
            "Uttar Pradesh, 09",
            "Maharashtra, 27",
            "Tamil Nadu, 33",
            "Delhi, 07",
            "New Delhi, 07",
            "Karnataka, 29",
            "Other Territory, 97"
    })
    void resolvesCanonicalNames(String name, String expected) {
        assertThat(GstStateCodes.codeFor(name)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "RJ, 08",
            "UP, 09",
            "MH, 27",
            "TN, 33",
            "DL, 07",
            "KA, 29",
            "J&K, 01",
            "JK, 01",
            "TS, 36",
            "TG, 36"
    })
    void resolvesAbbreviations(String abbreviation, String expected) {
        assertThat(GstStateCodes.codeFor(abbreviation)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "code {0} -> {1}")
    @CsvSource({
            "08, 08",
            "8, 08",
            "27, 27",
            "97, 97"
    })
    void acceptsBareCodesAndPadsSingleDigits(String code, String expected) {
        assertThat(GstStateCodes.codeFor(code)).isEqualTo(expected);
    }

    @Test
    void lookupIsCaseAndWhitespaceInsensitive() {
        assertThat(GstStateCodes.codeFor("  uttar pradesh ")).isEqualTo("09");
        assertThat(GstStateCodes.codeFor("TAMIL  NADU")).isEqualTo("33");
        assertThat(GstStateCodes.codeFor("tamil-nadu")).isEqualTo("33");
        assertThat(GstStateCodes.codeFor("Tamilnadu")).isEqualTo("33");
    }

    @Test
    void ampersandAndTheWordAndAreInterchangeable() {
        assertThat(GstStateCodes.codeFor("Jammu & Kashmir")).isEqualTo("01");
        assertThat(GstStateCodes.codeFor("Jammu and Kashmir")).isEqualTo("01");
        assertThat(GstStateCodes.codeFor("Andaman & Nicobar Islands")).isEqualTo("35");
        assertThat(GstStateCodes.codeFor("Andaman and Nicobar Islands")).isEqualTo("35");
    }

    @Test
    void legacyNamesResolveToCurrentCodes() {
        assertThat(GstStateCodes.codeFor("Orissa")).isEqualTo("21");
        assertThat(GstStateCodes.codeFor("Pondicherry")).isEqualTo("34");
        assertThat(GstStateCodes.codeFor("Uttaranchal")).isEqualTo("05");
        // Daman and Diu (25) merged into 26 in 2020.
        assertThat(GstStateCodes.codeFor("Daman and Diu")).isEqualTo("26");
    }

    @ParameterizedTest
    @ValueSource(strings = {"Atlantis", "XX", "00", "39", "99", "123", "   ", ""})
    void unknownTextAndInvalidCodesYieldNull(String input) {
        assertThat(GstStateCodes.codeFor(input)).isNull();
    }

    @Test
    void nullYieldsNull() {
        assertThat(GstStateCodes.codeFor(null)).isNull();
        assertThat(GstStateCodes.nameFor(null)).isNull();
    }

    @Test
    void nameForReturnsCanonicalNameOrNull() {
        assertThat(GstStateCodes.nameFor("08")).isEqualTo("Rajasthan");
        assertThat(GstStateCodes.nameFor(" 27 ")).isEqualTo("Maharashtra");
        assertThat(GstStateCodes.nameFor("26")).isEqualTo("Dadra and Nagar Haveli and Daman and Diu");
        assertThat(GstStateCodes.nameFor("25")).isNull();
        assertThat(GstStateCodes.nameFor("99")).isNull();
    }

    @Test
    void everyNamedCodeRoundTrips() {
        for (String code : new String[]{"01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
                "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "26", "27", "29", "30",
                "31", "32", "33", "34", "35", "36", "37", "38", "97"}) {
            String name = GstStateCodes.nameFor(code);
            assertThat(name).as("name for %s", code).isNotNull();
            assertThat(GstStateCodes.codeFor(name)).as("code for %s", name).isEqualTo(code);
        }
    }
}
