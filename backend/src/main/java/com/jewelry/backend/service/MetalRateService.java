package com.jewelry.backend.service;

import com.jewelry.backend.repository.GlobalSettingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Optional;

/**
 * The one place the GoldAPI feed is turned into rupees per gram.
 *
 * MetalPriceService returns USD per gram; the storefront's CurrencyService
 * treats the {@code usdRate} setting as USD per INR (default 0.012), so
 * INR per gram = USD per gram / usdRate. A rate above 1 is read as INR per
 * USD instead, so either convention in the setting gives rupees. The result
 * is {@code indicative} whenever a fallback figure was used anywhere
 * (mock feed, missing rate, missing setting).
 *
 * Used by the old-gold exchange quote (ExchangeService) and by the Treasure
 * plan's gram accrual and redemption (TreasurePlanService).
 */
@Service
public class MetalRateService {

    static final String SETTING_USD_RATE = "usdRate";
    static final BigDecimal FALLBACK_USD_PER_GRAM_24K = new BigDecimal("75.57"); // MetalPriceService fallback figure
    static final BigDecimal FALLBACK_USD_RATE = new BigDecimal("0.012");

    /** Rate for one gram of fine (24K) gold in INR, and whether it is a fallback figure. */
    public record FineRate(BigDecimal inrPerGram, boolean indicative) {
    }

    @Autowired
    MetalPriceService metalPriceService;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    public FineRate gold24kInrPerGram() {
        Map<String, Object> prices = metalPriceService.getLivePrices();
        boolean mock = prices == null || Boolean.TRUE.equals(prices.get("is_mock"));
        BigDecimal usdPerGram = prices == null ? null : parseDecimal(prices.get("24k"));
        if (usdPerGram == null || usdPerGram.signum() <= 0) {
            usdPerGram = FALLBACK_USD_PER_GRAM_24K;
            mock = true;
        }
        BigDecimal usdRate = setting(SETTING_USD_RATE).map(MetalRateService::parseDecimal).orElse(null);
        if (usdRate == null || usdRate.signum() <= 0) {
            usdRate = FALLBACK_USD_RATE;
            mock = true;
        }
        BigDecimal inr = usdRate.compareTo(BigDecimal.ONE) < 0
                ? usdPerGram.divide(usdRate, 4, RoundingMode.HALF_UP)   // usdRate = USD per INR (storefront convention)
                : usdPerGram.multiply(usdRate);                          // usdRate = INR per USD
        return new FineRate(inr.setScale(2, RoundingMode.HALF_UP), mock);
    }

    private Optional<String> setting(String key) {
        return globalSettingRepository.findBySettingKey(key)
                .map(s -> s.getSettingValue())
                .filter(v -> v != null && !v.isBlank());
    }

    static BigDecimal parseDecimal(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
