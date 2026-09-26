package com.jewelry.backend.service;

import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.repository.GlobalSettingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** GoldAPI USD per gram to INR per gram, and the direction of the usdRate setting. */
class MetalRateServiceTest {

    private MetalRateService service;
    private MetalPriceService metalPriceService;
    private GlobalSettingRepository settings;

    @BeforeEach
    void setUp() {
        metalPriceService = mock(MetalPriceService.class);
        settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        service = new MetalRateService();
        service.metalPriceService = metalPriceService;
        service.globalSettingRepository = settings;
    }

    private void usdRate(String value) {
        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(MetalRateService.SETTING_USD_RATE);
        s.setSettingValue(value);
        when(settings.findBySettingKey(MetalRateService.SETTING_USD_RATE)).thenReturn(Optional.of(s));
    }

    /** Live feed answer: USD per gram of 24K, and whether the feed is a fallback. */
    private void livePrice(Object usdPerGram24k, boolean mock) {
        Map<String, Object> prices = new HashMap<>();
        prices.put("24k", usdPerGram24k);
        prices.put("is_mock", mock);
        when(metalPriceService.getLivePrices()).thenReturn(prices);
    }

    @Test
    void usdRateBelowOneIsUsdPerInrSoTheFeedPriceIsDivided() {
        livePrice("75.57", false);
        usdRate("0.012");
        MetalRateService.FineRate rate = service.gold24kInrPerGram();
        assertThat(rate.inrPerGram()).isEqualByComparingTo("6297.50");
        assertThat(rate.indicative()).isFalse();
    }

    @Test
    void usdRateAboveOneIsInrPerUsdSoTheFeedPriceIsMultiplied() {
        livePrice(75.57, false);
        usdRate("83.5");
        MetalRateService.FineRate rate = service.gold24kInrPerGram();
        assertThat(rate.inrPerGram()).isEqualByComparingTo("6310.10");
        assertThat(rate.indicative()).isFalse();
    }

    @Test
    void mockFeedIsIndicative() {
        livePrice("75.57", true);
        usdRate("0.012");
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
    }

    @Test
    void missingUsdRateFallsBackAndIsIndicative() {
        livePrice("75.57", false);
        MetalRateService.FineRate rate = service.gold24kInrPerGram();
        assertThat(rate.indicative()).isTrue();
        assertThat(rate.inrPerGram()).isEqualByComparingTo("6297.50");

        usdRate("not a number");
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
        usdRate("-2");
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
    }

    @Test
    void missingOrUnusableFeedPriceFallsBackAndIsIndicative() {
        when(metalPriceService.getLivePrices()).thenReturn(null);
        usdRate("0.012");
        MetalRateService.FineRate rate = service.gold24kInrPerGram();
        assertThat(rate.indicative()).isTrue();
        assertThat(rate.inrPerGram()).isEqualByComparingTo("6297.50"); // 75.57 fallback / 0.012

        livePrice("-1", false);
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
        livePrice("abc", false);
        assertThat(service.gold24kInrPerGram().indicative()).isTrue();
    }

    @Test
    void resultIsRoundedToPaise() {
        livePrice("70.123456", false);
        usdRate("0.0123");
        assertThat(service.gold24kInrPerGram().inrPerGram().scale()).isEqualTo(2);
    }
}
