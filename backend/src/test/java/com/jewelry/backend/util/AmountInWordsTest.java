package com.jewelry.backend.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AmountInWordsTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "0 | Rupees Zero Only",
            "1 | Rupees One Only",
            "19 | Rupees Nineteen Only",
            "20 | Rupees Twenty Only",
            "21 | Rupees Twenty One Only",
            "100 | Rupees One Hundred Only",
            "105 | Rupees One Hundred Five Only",
            "999 | Rupees Nine Hundred Ninety Nine Only",
            "1000 | Rupees One Thousand Only",
            "1001 | Rupees One Thousand One Only",
            "99999 | Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only",
            "100000 | Rupees One Lakh Only",
            "123456 | Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only",
            "1000000 | Rupees Ten Lakh Only",
            "9999999 | Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only",
            "10000000 | Rupees One Crore Only",
            "12345678 | Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
            "100000000 | Rupees Ten Crore Only",
            "1000000000000 | Rupees One Lakh Crore Only"
    })
    void spellsRupeesInIndianGrouping(String amount, String expected) {
        assertThat(AmountInWords.inr(new BigDecimal(amount))).isEqualTo(expected);
    }

    @Test
    void spellsPaise() {
        assertThat(AmountInWords.inr(new BigDecimal("123456.78")))
                .isEqualTo("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Paise Seventy Eight Only");
        assertThat(AmountInWords.inr(new BigDecimal("0.05"))).isEqualTo("Rupees Zero and Paise Five Only");
        assertThat(AmountInWords.inr(new BigDecimal("1.50"))).isEqualTo("Rupees One and Paise Fifty Only");
    }

    @Test
    void roundsToTwoDecimalsHalfUp() {
        assertThat(AmountInWords.inr(new BigDecimal("10.005"))).isEqualTo("Rupees Ten and Paise One Only");
        assertThat(AmountInWords.inr(new BigDecimal("10.994"))).isEqualTo("Rupees Ten and Paise Ninety Nine Only");
        // 9.995 rounds up into the next rupee, leaving no paise.
        assertThat(AmountInWords.inr(new BigDecimal("9.995"))).isEqualTo("Rupees Ten Only");
    }

    @Test
    void nullIsZero() {
        assertThat(AmountInWords.inr(null)).isEqualTo("Rupees Zero Only");
    }

    @Test
    void negativeAmountsArePrefixedWithMinus() {
        assertThat(AmountInWords.inr(new BigDecimal("-250.25")))
                .isEqualTo("Minus Rupees Two Hundred Fifty and Paise Twenty Five Only");
    }

    @Test
    void integerHelperOmitsZeroAndCollapsesWhitespace() {
        assertThat(AmountInWords.integer(0)).isEmpty();
        assertThat(AmountInWords.integer(10_00_000)).isEqualTo("Ten Lakh");
        assertThat(AmountInWords.integer(1_00_00_001)).isEqualTo("One Crore One");
        assertThat(AmountInWords.integer(1_00_000)).doesNotContain("  ");
    }
}
