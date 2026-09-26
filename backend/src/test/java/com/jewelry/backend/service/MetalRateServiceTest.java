package com.jewelry.backend.service;

import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.MetalRate;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.MetalRateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Feed and FX parsing with stubbed HTTP, the INR-per-gram derivation, the
 * fallback chain (and its indicative flag) and the locked board's precedence.
 */
class MetalRateServiceTest {

    private static final String XAU = "https://api.gold-api.com/price/XAU";
    private static final String XAG = "https://api.gold-api.com/price/XAG";
    private static final String XPT = "https://api.gold-api.com/price/XPT";
    private static final String FX = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR";
    private static final String FX_FALLBACK = "https://open.er-api.com/v6/latest/USD";

    private static final String GOLD_JSON = "{\"currency\":\"USD\",\"currencySymbol\":\"$\",\"exchangeRate\":1.0,"
            + "\"name\":\"Gold\",\"price\":4286.200195,\"symbol\":\"XAU\",\"updatedAt\":\"2026-09-26T02:56:24Z\","
            + "\"updatedAtReadable\":\"a few seconds ago\"}";
    private static final String SILVER_JSON = "{\"name\":\"Silver\",\"price\":50,\"symbol\":\"XAG\",\"updatedAt\":\"2026-09-26T02:56:24Z\"}";
    private static final String PLATINUM_JSON = "{\"name\":\"Platinum\",\"price\":1500,\"symbol\":\"XPT\",\"updatedAt\":\"2026-09-26T02:56:24Z\"}";
    private static final String FRANKFURTER_JSON = "{\"amount\":1.0,\"base\":\"USD\",\"date\":\"2026-09-25\",\"rates\":{\"INR\":95.82}}";
    private static final String ER_API_JSON = "{\"result\":\"success\",\"rates\":{\"INR\":95.9187,\"EUR\":0.85},\"time_last_update_utc\":\"Fri, 26 Sep 2026 00:00:01 +0000\"}";

    private MetalRateService service;
    private GlobalSettingRepository settings;
    private MetalRateRepository rates;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        rates = mock(MetalRateRepository.class);
        when(rates.findFirstByRateDateAndMetalAndPurity(any(), anyString(), anyString())).thenReturn(Optional.empty());

        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();

        service = new MetalRateService();
        service.globalSettingRepository = settings;
        service.metalRateRepository = rates;
        service.restClientBuilder = builder;
        service.clock = Clock.fixed(Instant.parse("2026-09-26T04:30:00Z"), ZoneId.of("Asia/Kolkata"));
        service.goldApiUrl = "https://api.gold-api.com/price";
        service.fxUrl = FX;
        service.fxFallbackUrl = FX_FALLBACK;
        service.cacheMinutes = 10;
        service.goldApiIoKey = "";
        service.goldApiIoBaseUrl = "https://www.goldapi.io/api";
    }

    private void setting(String key, String value) {
        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(key);
        s.setSettingValue(value);
        when(settings.findBySettingKey(key)).thenReturn(Optional.of(s));
    }

    private void expectFeed(String goldBody, String silverBody, String platinumBody) {
        server.expect(requestTo(XAU)).andRespond(withSuccess(goldBody, MediaType.APPLICATION_JSON));
        server.expect(requestTo(XAG)).andRespond(withSuccess(silverBody, MediaType.APPLICATION_JSON));
        server.expect(requestTo(XPT)).andRespond(withSuccess(platinumBody, MediaType.APPLICATION_JSON));
    }

    // ---- derivation ----------------------------------------------------------

    @Test
    void finePerGramIsOuncePriceOverTroyOunceTimesFxTimesLoadings() {
        // 4286.2 / 31.1034768 x 95.82 x 1.06 = 13996.70
        assertThat(MetalRateService.finePerGram(new BigDecimal("4286.2"), new BigDecimal("95.82"),
                new BigDecimal("6"), BigDecimal.ZERO)).isEqualByComparingTo("13996.70");
        assertThat(MetalRateService.finePerGram(new BigDecimal("4286.2"), new BigDecimal("95.82"),
                new BigDecimal("3"), new BigDecimal("1.5"))).isEqualByComparingTo("13798.63");
    }

    @Test
    void goldApiFreeAndFrankfurterGiveALiveNonIndicativeRate() {
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();

        assertThat(live.indicative()).isFalse();
        assertThat(live.spot().provider()).isEqualTo(MetalRateService.PROVIDER_GOLD_API_FREE);
        assertThat(live.spot().goldUsdPerOunce()).isEqualByComparingTo("4286.200195");
        assertThat(live.spot().silverUsdPerOunce()).isEqualByComparingTo("50");
        assertThat(live.spot().platinumUsdPerOunce()).isEqualByComparingTo("1500");
        assertThat(live.spot().updatedAt()).isEqualTo("2026-09-26T08:26:24"); // 02:56Z in IST
        assertThat(live.fx().usdInr()).isEqualByComparingTo("95.82");
        assertThat(live.fx().source()).isEqualTo(MetalRateService.FX_FRANKFURTER);
        assertThat(live.dutyPct()).isEqualByComparingTo("6");
        assertThat(live.premiumPct()).isEqualByComparingTo("0");
        // sanity: with USD/INR near 96 the 24K fine rate lands near Rs 14,000 per gram
        assertThat(live.fine("GOLD")).isEqualByComparingTo("13996.70");
        assertThat(live.fine("SILVER")).isEqualByComparingTo("163.28");
        assertThat(live.fine("PLATINUM")).isEqualByComparingTo("4898.29");

        MetalRateService.FineRate gold = service.gold24kInrPerGram();
        assertThat(gold.inrPerGram()).isEqualByComparingTo("13996.70");
        assertThat(gold.indicative()).isFalse();
        server.verify();
    }

    @Test
    void dutyAndPremiumSettingsChangeTheLoading() {
        setting(MetalRateService.SETTING_DUTY_PCT, "3");
        setting(MetalRateService.SETTING_PREMIUM_PCT, "1.5");
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.dutyPct()).isEqualByComparingTo("3");
        assertThat(live.premiumPct()).isEqualByComparingTo("1.5");
        assertThat(live.fine("GOLD")).isEqualByComparingTo("13798.63");
    }

    @Test
    void unusableLoadingSettingsFallBackToTheDefaults() {
        setting(MetalRateService.SETTING_DUTY_PCT, "abc");
        setting(MetalRateService.SETTING_PREMIUM_PCT, "-4");
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.dutyPct()).isEqualByComparingTo("6");
        assertThat(live.premiumPct()).isEqualByComparingTo("0");
    }

    // ---- FX fallbacks --------------------------------------------------------

    @Test
    void frankfurterDownFallsBackToErApiAndStaysLive() {
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        server.expect(requestTo(FX_FALLBACK)).andRespond(withSuccess(ER_API_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.indicative()).isFalse();
        assertThat(live.fx().source()).isEqualTo(MetalRateService.FX_ER_API);
        assertThat(live.fx().usdInr()).isEqualByComparingTo("95.9187");
        assertThat(live.fine("GOLD")).isEqualByComparingTo("14011.11");
    }

    @Test
    void bothFxFeedsDownUseTheUsdRateSettingInvertedAndAreIndicative() {
        setting(MetalRateService.SETTING_USD_RATE, "0.012"); // storefront convention: USD per INR
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withStatus(HttpStatus.MOVED_PERMANENTLY));
        server.expect(requestTo(FX_FALLBACK)).andRespond(withSuccess("{\"result\":\"error\"}", MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.indicative()).isTrue();
        assertThat(live.fx().source()).isEqualTo(MetalRateService.FX_SETTING);
        assertThat(live.fx().usdInr()).isEqualByComparingTo("83.3333");
        assertThat(live.fine("GOLD")).isEqualByComparingTo("12172.73");
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
    }

    @Test
    void usdRateAboveOneIsReadAsInrPerUsd() {
        setting(MetalRateService.SETTING_USD_RATE, "95.82");
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(FX_FALLBACK)).andRespond(withStatus(HttpStatus.NOT_FOUND));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.fx().usdInr()).isEqualByComparingTo("95.82");
        assertThat(live.fx().source()).isEqualTo(MetalRateService.FX_SETTING);
        assertThat(live.indicative()).isTrue();
    }

    @Test
    void noFxAnywhereUsesTheHardFallback() {
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(FX_FALLBACK)).andRespond(withSuccess("not json at all", MediaType.TEXT_PLAIN));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.fx().source()).isEqualTo(MetalRateService.FX_FALLBACK);
        assertThat(live.fx().usdInr()).isEqualByComparingTo(MetalRateService.FALLBACK_USD_INR);
        assertThat(live.indicative()).isTrue();
    }

    // ---- spot fallbacks ------------------------------------------------------

    @Test
    void feedFailureIsIndicativeWithFallbackFigures() {
        server.expect(requestTo(XAU)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        server.expect(requestTo(XAG)).andRespond(withSuccess("{\"price\":\"oops\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(XPT)).andRespond(withSuccess("<html>", MediaType.TEXT_HTML));
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.indicative()).isTrue();
        assertThat(live.spot().indicative()).isTrue();
        assertThat(live.spot().goldUsdPerOunce()).isEqualByComparingTo(MetalRateService.FALLBACK_GOLD_USD_PER_OUNCE);
        assertThat(live.spot().silverUsdPerOunce()).isEqualByComparingTo(MetalRateService.FALLBACK_SILVER_USD_PER_OUNCE);
        assertThat(live.spot().platinumUsdPerOunce()).isEqualByComparingTo(MetalRateService.FALLBACK_PLATINUM_USD_PER_OUNCE);
        assertThat(live.fx().indicative()).isFalse();
        assertThat(live.fine("GOLD")).isEqualByComparingTo("13715.21"); // 4200 fallback
        assertThat(service.fineRate("gold").indicative()).isTrue();
    }

    @Test
    void oneMetalMissingStillMarksTheWholeFetchIndicative() {
        server.expect(requestTo(XAU)).andRespond(withSuccess(GOLD_JSON, MediaType.APPLICATION_JSON));
        server.expect(requestTo(XAG)).andRespond(withSuccess(SILVER_JSON, MediaType.APPLICATION_JSON));
        server.expect(requestTo(XPT)).andRespond(withSuccess("{\"price\":-3}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.indicative()).isTrue();
        assertThat(live.fine("GOLD")).isEqualByComparingTo("13996.70");
        assertThat(live.spot().platinumUsdPerOunce()).isEqualByComparingTo(MetalRateService.FALLBACK_PLATINUM_USD_PER_OUNCE);
    }

    @Test
    void goldApiIoProviderSendsTheKeyAndReadsTheSamePriceField() {
        setting(MetalRateService.SETTING_PROVIDER, "goldapi_io");
        service.goldApiIoKey = "secret-key";
        server.expect(requestTo("https://www.goldapi.io/api/XAU/USD"))
                .andExpect(header("x-access-token", "secret-key"))
                .andRespond(withSuccess("{\"price\":4286.2,\"timestamp\":1790384184,\"price_gram_24k\":137.8}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://www.goldapi.io/api/XAG/USD"))
                .andRespond(withSuccess("{\"price\":50}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://www.goldapi.io/api/XPT/USD"))
                .andRespond(withSuccess("{\"price\":1500}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(service.provider()).isEqualTo(MetalRateService.PROVIDER_GOLDAPI_IO);
        assertThat(live.spot().provider()).isEqualTo(MetalRateService.PROVIDER_GOLDAPI_IO);
        assertThat(live.indicative()).isFalse();
        assertThat(live.fine("GOLD")).isEqualByComparingTo("13996.70");
        server.verify();
    }

    @Test
    void goldApiIoWithoutAKeyServesIndicativeFallbacksWithoutCalling() {
        setting(MetalRateService.SETTING_PROVIDER, "GOLDAPI_IO");
        service.goldApiIoKey = "";
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates live = service.live();
        assertThat(live.indicative()).isTrue();
        assertThat(live.spot().goldUsdPerOunce()).isEqualByComparingTo(MetalRateService.FALLBACK_GOLD_USD_PER_OUNCE);
        server.verify();
    }

    @Test
    void unknownProviderSettingMeansTheFreeFeed() {
        setting(MetalRateService.SETTING_PROVIDER, "something-else");
        assertThat(service.provider()).isEqualTo(MetalRateService.PROVIDER_GOLD_API_FREE);
    }

    // ---- cache and locked board ----------------------------------------------

    @Test
    void liveIsCachedForTenMinutesAndRefreshForcesAFetch() {
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));

        MetalRateService.LiveRates first = service.live();
        MetalRateService.LiveRates second = service.live(); // no second set of expectations: must not fetch
        assertThat(second).isSameAs(first);
        server.verify();

        server.reset();
        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));
        MetalRateService.LiveRates third = service.refresh();
        assertThat(third).isNotSameAs(first);
        server.verify();
    }

    @Test
    void todaysLockedBoardWinsOverTheLiveFeed() {
        MetalRate locked = new MetalRate();
        locked.setRateDate(LocalDate.of(2026, 9, 26));
        locked.setMetal("GOLD");
        locked.setPurity("24K");
        locked.setPurityFraction(new BigDecimal("0.999"));
        locked.setRatePerGram(new BigDecimal("14000"));
        when(rates.findFirstByRateDateAndMetalAndPurity(eq(LocalDate.of(2026, 9, 26)), eq("GOLD"), eq("24K")))
                .thenReturn(Optional.of(locked));

        MetalRateService.FineRate gold = service.gold24kInrPerGram();
        assertThat(gold.inrPerGram()).isEqualByComparingTo("14014.01"); // 14000 / 0.999
        assertThat(gold.indicative()).isFalse();
        assertThat(gold.inrPerGram().scale()).isEqualTo(2);
        server.verify(); // nothing fetched
    }

    @Test
    void silverAndPlatinumFineRatesComeFromTheSameBoardOrFeed() {
        MetalRate silver = new MetalRate();
        silver.setRatePerGram(new BigDecimal("150"));
        when(rates.findFirstByRateDateAndMetalAndPurity(any(), eq("SILVER"), eq("999"))).thenReturn(Optional.of(silver));
        assertThat(service.fineRate("silver").inrPerGram()).isEqualByComparingTo("150.15");

        expectFeed(GOLD_JSON, SILVER_JSON, PLATINUM_JSON);
        server.expect(requestTo(FX)).andRespond(withSuccess(FRANKFURTER_JSON, MediaType.APPLICATION_JSON));
        assertThat(service.fineRate("PLATINUM").inrPerGram()).isEqualByComparingTo("4898.29");
    }

    @Test
    void unknownMetalIsRejectedBeforeAnyLookup() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.fineRate("copper"))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(rates);
    }
}
