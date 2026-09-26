package com.jewelry.backend.service;

import com.jewelry.backend.dto.ExchangeQuoteResponse;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.repository.GlobalSettingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Old gold quote arithmetic with the gold rate and settings mocked. The
 * USD-to-INR conversion itself is covered by {@link MetalRateServiceTest}.
 */
class ExchangeServiceTest {

    private ExchangeService service;
    private MetalRateService metalRateService;
    private GlobalSettingRepository settings;

    @BeforeEach
    void setUp() {
        metalRateService = mock(MetalRateService.class);
        settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        service = new ExchangeService();
        service.metalRateService = metalRateService;
        service.globalSettingRepository = settings;
    }

    private void setting(String key, String value) {
        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(key);
        s.setSettingValue(value);
        when(settings.findBySettingKey(key)).thenReturn(Optional.of(s));
    }

    /** Gold rate as MetalRateService would answer: INR per fine gram, and whether it is a fallback. */
    private void goldRate(String inrPerGram, boolean indicative) {
        when(metalRateService.gold24kInrPerGram())
                .thenReturn(new MetalRateService.FineRate(new BigDecimal(inrPerGram), indicative));
    }

    // ---- purity ------------------------------------------------------------

    @ParameterizedTest(name = "{0} {1} -> {2}")
    @CsvSource({
            "GOLD, 24K, 0.999",
            "GOLD, 999, 0.999",
            "GOLD, 22K, 0.916",
            "GOLD, 916, 0.916",
            "GOLD, 18K, 0.750",
            "GOLD, 750, 0.750",
            "GOLD, 14K, 0.585",
            "SILVER, 999, 0.999",
            "SILVER, 925, 0.925",
            "SILVER, STERLING, 0.925"
    })
    void purityLabelsMapToFineFractions(String metal, String label, String expected) {
        assertThat(ExchangeService.purityFraction(metal, label)).isEqualByComparingTo(expected);
    }

    @Test
    void unknownPurityForTheMetalIsRejectedWithTheChoices() {
        assertThatThrownBy(() -> ExchangeService.purityFraction("GOLD", "925"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown purity '925' for gold")
                .hasMessageContaining("22K");
        assertThatThrownBy(() -> ExchangeService.purityFraction("SILVER", "22K"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("for silver");
    }

    @ParameterizedTest(name = "\"{0}\" -> {1}")
    @CsvSource({
            "22k, 22K",
            "22 KT, 22K",
            "22ct, 22K",
            "22 karat, 22K",
            "916, 916",
            "sterling, STERLING"
    })
    void purityLabelsAreNormalised(String raw, String expected) {
        assertThat(ExchangeService.normalizePurityLabel(raw)).isEqualTo(expected);
    }

    @Test
    void metalAndPurityAreRequired() {
        assertThatThrownBy(() -> ExchangeService.normalizePurityLabel(" ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ExchangeService.normalizeMetal(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ExchangeService.normalizeMetal("Platinum"))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("Metal must be GOLD or SILVER.");
        assertThat(ExchangeService.normalizeMetal(" gold ")).isEqualTo("GOLD");
    }

    // ---- estimate --------------------------------------------------------

    @Test
    void estimateAppliesPurityWeightAndDeductionAndRoundsToTheRupee() {
        // 6000 x 0.916 x 10 x 0.98 = 53,860.80 -> 53,861
        BigDecimal value = ExchangeService.estimate(new BigDecimal("6000"), new BigDecimal("0.916"),
                new BigDecimal("10"), new BigDecimal("2"));
        assertThat(value).isEqualByComparingTo("53861.00");
        assertThat(value.scale()).isEqualTo(2);
    }

    @Test
    void zeroDeductionLeavesTheMetalValueUntouched() {
        assertThat(ExchangeService.estimate(new BigDecimal("100"), new BigDecimal("0.750"), new BigDecimal("4"), BigDecimal.ZERO))
                .isEqualByComparingTo("300.00");
    }

    @Test
    void deductionComesFromSettingsWithinBoundsElseTwoPercent() {
        assertThat(service.deductionPct()).isEqualByComparingTo("2.00");
        setting(ExchangeService.SETTING_DEDUCTION, "3.5");
        assertThat(service.deductionPct()).isEqualByComparingTo("3.50");
        setting(ExchangeService.SETTING_DEDUCTION, "150");
        assertThat(service.deductionPct()).isEqualByComparingTo("2.00");
        setting(ExchangeService.SETTING_DEDUCTION, "-1");
        assertThat(service.deductionPct()).isEqualByComparingTo("2.00");
        setting(ExchangeService.SETTING_DEDUCTION, "abc");
        assertThat(service.deductionPct()).isEqualByComparingTo("2.00");
    }

    // ---- fine rate ---------------------------------------------------------

    @Test
    void goldRateAndItsIndicativeFlagComeStraightFromTheRateService() {
        goldRate("6297.50", false);
        ExchangeService.FineRate rate = service.fineRate("GOLD");
        assertThat(rate.inrPerGram()).isEqualByComparingTo("6297.50");
        assertThat(rate.indicative()).isFalse();

        goldRate("6297.50", true);
        assertThat(service.fineRate("GOLD").indicative()).isTrue();
    }

    @Test
    void silverRateComesFromSettingsAndIsAlwaysIndicative() {
        ExchangeService.FineRate fallback = service.fineRate("SILVER");
        assertThat(fallback.inrPerGram()).isEqualByComparingTo("95.00");
        assertThat(fallback.indicative()).isTrue();

        setting(ExchangeService.SETTING_SILVER_RATE, "101.25");
        ExchangeService.FineRate configured = service.fineRate("SILVER");
        assertThat(configured.inrPerGram()).isEqualByComparingTo("101.25");
        assertThat(configured.indicative()).isTrue();
    }

    // ---- quote ---------------------------------------------------------------

    @Test
    void quoteCombinesRatePurityWeightAndDeduction() {
        goldRate("6297.50", false);
        setting(ExchangeService.SETTING_DEDUCTION, "2");

        ExchangeQuoteResponse quote = service.quote("gold", "22 kt", new BigDecimal("10"));

        assertThat(quote.getMetal()).isEqualTo("GOLD");
        assertThat(quote.getPurity()).isEqualTo("22K");
        assertThat(quote.getPurityFraction()).isEqualByComparingTo("0.916");
        assertThat(quote.getWeightGrams()).isEqualByComparingTo("10.000");
        assertThat(quote.getRatePerGramFine()).isEqualByComparingTo("6297.50");
        assertThat(quote.getRate()).as("rate at 22K").isEqualByComparingTo("5768.51");
        assertThat(quote.getDeductionPct()).isEqualByComparingTo("2.00");
        // 6297.50 x 0.916 x 10 x 0.98 = 56,531.40 -> 56,531
        assertThat(quote.getEstimatedValue()).isEqualByComparingTo("56531.00");
        assertThat(quote.isIndicative()).isFalse();
        assertThat(quote.isPanRequired()).isFalse();
    }

    @Test
    void quoteFlagsPanAtTwoLakhAndAbove() {
        goldRate("6297.50", false);
        setting(ExchangeService.SETTING_DEDUCTION, "0");
        // 6297.50 x 0.999 x 31.8 = 200,050.6 -> above the threshold
        assertThat(service.quote("GOLD", "24K", new BigDecimal("31.8")).isPanRequired()).isTrue();
        assertThat(service.quote("GOLD", "24K", new BigDecimal("31")).isPanRequired()).isFalse();
    }

    @Test
    void quoteRejectsNonPositiveWeight() {
        assertThatThrownBy(() -> service.quote("GOLD", "22K", BigDecimal.ZERO))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("above zero");
        assertThatThrownBy(() -> service.quote("GOLD", "22K", null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.quote("GOLD", "22K", new BigDecimal("-3"))).isInstanceOf(IllegalArgumentException.class);
    }

    // ---- small helpers ------------------------------------------------------

    @Test
    void panIsUpperCasedValidatedAndMasked() {
        assertThat(ExchangeService.normalizePan(" abcde1234f ")).isEqualTo("ABCDE1234F");
        assertThat(ExchangeService.normalizePan("")).isNull();
        assertThatThrownBy(() -> ExchangeService.normalizePan("ABC123")).isInstanceOf(IllegalArgumentException.class);
        assertThat(ExchangeService.maskPan("ABCDE1234F")).isEqualTo("ABCDE****F");
        assertThat(ExchangeService.maskPan("short")).isNull();
    }

    @Test
    void phonesMatchOnTheirLastTenDigits() {
        assertThat(ExchangeService.samePhone("+91 98765 43210", "9876543210")).isTrue();
        assertThat(ExchangeService.samePhone("09876543210", "98765-43210")).isTrue();
        assertThat(ExchangeService.samePhone("9876543210", "9876543211")).isFalse();
        assertThat(ExchangeService.samePhone("12345", "12345")).as("too short to trust").isFalse();
        assertThat(ExchangeService.samePhone(null, "9876543210")).isFalse();
    }
}
