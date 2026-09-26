package com.jewelry.backend.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class IndianMoneyTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "0 | 0.00",
            "5 | 5.00",
            "999 | 999.00",
            "1000 | 1,000.00",
            "12345 | 12,345.00",
            "123456 | 1,23,456.00",
            "1234567.89 | 12,34,567.89",
            "12345678 | 1,23,45,678.00",
            "123456789 | 12,34,56,789.00",
            "1000000000 | 1,00,00,00,000.00"
    })
    void groupsDigitsIndianStyle(String amount, String expected) {
        assertThat(IndianMoney.format(new BigDecimal(amount))).isEqualTo(expected);
    }

    @Test
    void nullAndZeroRenderAsZero() {
        assertThat(IndianMoney.format(null)).isEqualTo("0.00");
        assertThat(IndianMoney.format(BigDecimal.ZERO)).isEqualTo("0.00");
        assertThat(IndianMoney.format(new BigDecimal("0.000"))).isEqualTo("0.00");
    }

    @Test
    void roundsHalfUpToPaise() {
        assertThat(IndianMoney.format(new BigDecimal("1234.565"))).isEqualTo("1,234.57");
        assertThat(IndianMoney.format(new BigDecimal("1234.564"))).isEqualTo("1,234.56");
    }

    @Test
    void negativeAmountsKeepTheSignInFront() {
        assertThat(IndianMoney.format(new BigDecimal("-1234567.5"))).isEqualTo("-12,34,567.50");
    }

    @Test
    void rsPrefixesTheAsciiRupeeLabel() {
        assertThat(IndianMoney.rs(new BigDecimal("123456.78"))).isEqualTo("Rs. 1,23,456.78");
        assertThat(IndianMoney.rs(null)).isEqualTo("Rs. 0.00");
    }
}
