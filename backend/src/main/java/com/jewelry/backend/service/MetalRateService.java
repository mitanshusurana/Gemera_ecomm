package com.jewelry.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jewelry.backend.entity.MetalRate;
import com.jewelry.backend.pricing.MetalPurities;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.MetalRateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The one place a metal feed is turned into rupees per gram.
 *
 * <p>Two spot providers, chosen by the {@code metalRateProvider} setting:
 * <ul>
 *   <li>{@code GOLD_API_FREE} (default, no key): {@code GET https://api.gold-api.com/price/XAU}
 *       (and XAG, XPT) answering {@code {"price": <USD per troy ounce>, "updatedAt": ...}}.</li>
 *   <li>{@code GOLDAPI_IO}: the keyed goldapi.io feed ({@code goldapi.key}), {@code GET {base}/XAU/USD}
 *       with header {@code x-access-token}, same {@code price} field.</li>
 * </ul>
 * USD/INR comes from Frankfurter (ECB daily), then open.er-api.com, then the
 * {@code usdRate} setting (USD per INR in the storefront's convention, so a
 * value below 1 is inverted), then a hard fallback.
 *
 * <p>Fine rate in INR per gram = usdPerOunce / 31.1034768 x usdInr x
 * (1 + metalRateDutyPct/100 + metalRatePremiumPct/100). Duty defaults to 6 %
 * (customs), premium to 0. The result is {@code indicative} when any part
 * fell back (feed down, FX from the setting, missing figure). Everything is
 * cached in memory for {@code metal-rates.cache-minutes} (10).
 *
 * <p>{@link #fineRate(String)} prefers today's locked board (IST) when one
 * exists, so old-gold quotes, Treasure gram accrual and product prices all
 * agree with what the shop published for the day.
 */
@Service
public class MetalRateService {

    private static final Logger LOGGER = Logger.getLogger(MetalRateService.class.getName());
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    public static final String SETTING_PROVIDER = "metalRateProvider";
    public static final String SETTING_DUTY_PCT = "metalRateDutyPct";
    public static final String SETTING_PREMIUM_PCT = "metalRatePremiumPct";
    public static final String SETTING_USD_RATE = "usdRate";

    public static final String PROVIDER_GOLD_API_FREE = "GOLD_API_FREE";
    public static final String PROVIDER_GOLDAPI_IO = "GOLDAPI_IO";

    public static final String FX_FRANKFURTER = "frankfurter";
    public static final String FX_ER_API = "er-api";
    public static final String FX_SETTING = "setting";
    public static final String FX_FALLBACK = "fallback";

    static final BigDecimal TROY_OUNCE_GRAMS = new BigDecimal("31.1034768");
    static final BigDecimal DEFAULT_DUTY_PCT = new BigDecimal("6");
    static final BigDecimal DEFAULT_PREMIUM_PCT = BigDecimal.ZERO;
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    // Last-resort figures, only ever served with indicative=true.
    static final BigDecimal FALLBACK_GOLD_USD_PER_OUNCE = new BigDecimal("4200");
    static final BigDecimal FALLBACK_SILVER_USD_PER_OUNCE = new BigDecimal("50");
    static final BigDecimal FALLBACK_PLATINUM_USD_PER_OUNCE = new BigDecimal("1500");
    static final BigDecimal FALLBACK_USD_INR = new BigDecimal("95");

    /** Rate for one gram of fine (999) metal in INR, and whether it is a fallback figure. */
    public record FineRate(BigDecimal inrPerGram, boolean indicative) {
    }

    /** Spot prices in USD per troy ounce as the provider answered them. */
    public record Spot(BigDecimal goldUsdPerOunce, BigDecimal silverUsdPerOunce, BigDecimal platinumUsdPerOunce,
                       LocalDateTime updatedAt, String provider, boolean indicative) {
        public BigDecimal usdPerOunce(String metal) {
            return switch (metal) {
                case MetalPurities.GOLD -> goldUsdPerOunce;
                case MetalPurities.SILVER -> silverUsdPerOunce;
                case MetalPurities.PLATINUM -> platinumUsdPerOunce;
                default -> null;
            };
        }
    }

    /** USD/INR and where it came from. */
    public record Fx(BigDecimal usdInr, String source, boolean indicative) {
    }

    /** Everything derived from one fetch: spot, FX, loadings and INR per fine gram per metal. */
    public record LiveRates(Spot spot, Fx fx, BigDecimal dutyPct, BigDecimal premiumPct,
                            Map<String, BigDecimal> finePerGram, boolean indicative, LocalDateTime asOf) {
        /** INR per gram of fine metal for GOLD, SILVER or PLATINUM (normalised names). */
        public BigDecimal fine(String metal) {
            return finePerGram.get(metal);
        }
    }

    @Value("${metal-rates.gold-api-url:https://api.gold-api.com/price}")
    String goldApiUrl;

    @Value("${metal-rates.fx-url:https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR}")
    String fxUrl;

    @Value("${metal-rates.fx-fallback-url:https://open.er-api.com/v6/latest/USD}")
    String fxFallbackUrl;

    @Value("${metal-rates.cache-minutes:10}")
    int cacheMinutes = 10;

    @Value("${goldapi.key:}")
    String goldApiIoKey;

    @Value("${goldapi.base-url:https://www.goldapi.io/api}")
    String goldApiIoBaseUrl = "https://www.goldapi.io/api";

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    MetalRateRepository metalRateRepository;

    /** Package-private so tests can bind a MockRestServiceServer; built with timeouts when left null. */
    RestClient.Builder restClientBuilder;

    /** Package-private so tests can pin "today". */
    Clock clock = Clock.system(INDIA);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile RestClient restClient;
    private volatile LiveRates cached;
    private volatile LocalDateTime cachedAt;

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /** Live-derived rates, served from the cache while it is fresh. Never throws. */
    public LiveRates live() {
        LiveRates current = cached;
        LocalDateTime at = cachedAt;
        if (current != null && at != null
                && Duration.between(at, LocalDateTime.now(clock)).toMinutes() < Math.max(1, cacheMinutes)) {
            return current;
        }
        return refresh();
    }

    /** Fetches the feed and FX now, replacing the cache. Never throws. */
    public synchronized LiveRates refresh() {
        LiveRates previous = cached;
        Spot spot = fetchSpot(previous == null ? null : previous.spot());
        Fx fx = fetchFx();
        BigDecimal duty = pct(SETTING_DUTY_PCT, DEFAULT_DUTY_PCT);
        BigDecimal premium = pct(SETTING_PREMIUM_PCT, DEFAULT_PREMIUM_PCT);
        LiveRates rates = derive(spot, fx, duty, premium, LocalDateTime.now(clock));
        cached = rates;
        cachedAt = LocalDateTime.now(clock);
        return rates;
    }

    /**
     * INR per gram of fine metal: today's locked board when the shop has
     * locked one (never indicative), otherwise the live derivation.
     */
    public FineRate fineRate(String metal) {
        String m = MetalPurities.normalizeMetal(metal);
        if (m == null) {
            throw new IllegalArgumentException("Metal must be GOLD, SILVER or PLATINUM.");
        }
        MetalPurities.Purity fine = MetalPurities.fine(m);
        Optional<MetalRate> locked = metalRateRepository
                .findFirstByRateDateAndMetalAndPurity(LocalDate.now(clock), m, fine.label());
        if (locked.isPresent() && locked.get().getRatePerGram() != null && locked.get().getRatePerGram().signum() > 0) {
            return new FineRate(locked.get().getRatePerGram().divide(fine.fraction(), 2, RoundingMode.HALF_UP), false);
        }
        LiveRates live = live();
        return new FineRate(live.fine(m), live.indicative());
    }

    /** Kept for ExchangeService and TreasurePlanService: the gold fine rate. */
    public FineRate gold24kInrPerGram() {
        return fineRate(MetalPurities.GOLD);
    }

    /** The configured provider name, normalised; GOLD_API_FREE when unset or unknown. */
    public String provider() {
        String p = setting(SETTING_PROVIDER).map(s -> s.trim().toUpperCase(Locale.ROOT).replace('-', '_')).orElse("");
        return PROVIDER_GOLDAPI_IO.equals(p) ? PROVIDER_GOLDAPI_IO : PROVIDER_GOLD_API_FREE;
    }

    // ------------------------------------------------------------------
    // Derivation (pure)
    // ------------------------------------------------------------------

    /** usdPerOunce / 31.1034768 x usdInr x (1 + duty% + premium%), to the paisa. */
    static BigDecimal finePerGram(BigDecimal usdPerOunce, BigDecimal usdInr, BigDecimal dutyPct, BigDecimal premiumPct) {
        BigDecimal loading = BigDecimal.ONE
                .add(dutyPct.divide(HUNDRED, 6, RoundingMode.HALF_UP))
                .add(premiumPct.divide(HUNDRED, 6, RoundingMode.HALF_UP));
        return usdPerOunce.divide(TROY_OUNCE_GRAMS, 8, RoundingMode.HALF_UP)
                .multiply(usdInr)
                .multiply(loading)
                .setScale(2, RoundingMode.HALF_UP);
    }

    static LiveRates derive(Spot spot, Fx fx, BigDecimal dutyPct, BigDecimal premiumPct, LocalDateTime asOf) {
        Map<String, BigDecimal> fine = new LinkedHashMap<>();
        for (String metal : MetalPurities.METALS) {
            fine.put(metal, finePerGram(spot.usdPerOunce(metal), fx.usdInr(), dutyPct, premiumPct));
        }
        boolean indicative = spot.indicative() || fx.indicative();
        return new LiveRates(spot, fx, dutyPct, premiumPct, fine, indicative, asOf);
    }

    // ------------------------------------------------------------------
    // Spot feed
    // ------------------------------------------------------------------

    private Spot fetchSpot(Spot previous) {
        String provider = provider();
        boolean indicative = false;
        BigDecimal gold = null;
        BigDecimal silver = null;
        BigDecimal platinum = null;
        LocalDateTime updatedAt = null;

        if (PROVIDER_GOLDAPI_IO.equals(provider)) {
            if (goldApiIoKey == null || goldApiIoKey.isBlank() || "demo".equalsIgnoreCase(goldApiIoKey.trim())) {
                LOGGER.warning("metalRateProvider is GOLDAPI_IO but goldapi.key is not set; serving fallback rates.");
            } else {
                Map<String, String> headers = Map.of("x-access-token", goldApiIoKey.trim());
                String base = goldApiIoBaseUrl.endsWith("/") ? goldApiIoBaseUrl.substring(0, goldApiIoBaseUrl.length() - 1) : goldApiIoBaseUrl;
                JsonNode xau = getJson(base + "/XAU/USD", headers).orElse(null);
                gold = price(xau);
                updatedAt = timestamp(xau);
                silver = price(getJson(base + "/XAG/USD", headers).orElse(null));
                platinum = price(getJson(base + "/XPT/USD", headers).orElse(null));
            }
        } else {
            String base = goldApiUrl.endsWith("/") ? goldApiUrl.substring(0, goldApiUrl.length() - 1) : goldApiUrl;
            JsonNode xau = getJson(base + "/XAU", Map.of()).orElse(null);
            gold = price(xau);
            updatedAt = timestamp(xau);
            silver = price(getJson(base + "/XAG", Map.of()).orElse(null));
            platinum = price(getJson(base + "/XPT", Map.of()).orElse(null));
        }

        if (gold == null) {
            gold = previous != null && !previous.indicative() ? previous.goldUsdPerOunce() : FALLBACK_GOLD_USD_PER_OUNCE;
            indicative = true;
        }
        if (silver == null) {
            silver = previous != null && !previous.indicative() ? previous.silverUsdPerOunce() : FALLBACK_SILVER_USD_PER_OUNCE;
            indicative = true;
        }
        if (platinum == null) {
            platinum = previous != null && !previous.indicative() ? previous.platinumUsdPerOunce() : FALLBACK_PLATINUM_USD_PER_OUNCE;
            indicative = true;
        }
        if (indicative) {
            LOGGER.warning("Metal feed " + provider + " incomplete; serving indicative rates.");
        }
        return new Spot(gold, silver, platinum, updatedAt, provider, indicative);
    }

    /** The provider's {@code price} field when it is a positive number; null otherwise. */
    static BigDecimal price(JsonNode node) {
        if (node == null) {
            return null;
        }
        return positive(node.path("price"));
    }

    private static BigDecimal positive(JsonNode value) {
        if (value == null || value.isMissingNode() || value.isNull()) {
            return null;
        }
        try {
            BigDecimal d = value.isNumber() ? value.decimalValue() : new BigDecimal(value.asText().trim());
            return d.signum() > 0 ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDateTime timestamp(JsonNode node) {
        if (node == null) {
            return null;
        }
        JsonNode value = node.path("updatedAt");
        if (value.isMissingNode() || value.isNull()) {
            value = node.path("timestamp");
        }
        try {
            if (value.isNumber()) {
                long epoch = value.asLong();
                if (epoch > 0) {
                    return LocalDateTime.ofInstant(java.time.Instant.ofEpochSecond(epoch), INDIA);
                }
                return null;
            }
            String text = value.asText("");
            return text.isBlank() ? null : OffsetDateTime.parse(text).atZoneSameInstant(INDIA).toLocalDateTime();
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------------------
    // FX
    // ------------------------------------------------------------------

    private Fx fetchFx() {
        BigDecimal inr = getJson(fxUrl, Map.of()).map(n -> positive(n.path("rates").path("INR"))).orElse(null);
        if (inr != null) {
            return new Fx(inr.setScale(4, RoundingMode.HALF_UP), FX_FRANKFURTER, false);
        }
        inr = getJson(fxFallbackUrl, Map.of()).map(n -> positive(n.path("rates").path("INR"))).orElse(null);
        if (inr != null) {
            return new Fx(inr.setScale(4, RoundingMode.HALF_UP), FX_ER_API, false);
        }
        BigDecimal usdRate = setting(SETTING_USD_RATE).map(MetalRateService::parseDecimal).orElse(null);
        if (usdRate != null && usdRate.signum() > 0) {
            // The storefront stores usdRate as USD per INR (0.012); a value above 1 is INR per USD.
            BigDecimal usdInr = usdRate.compareTo(BigDecimal.ONE) < 0
                    ? BigDecimal.ONE.divide(usdRate, 4, RoundingMode.HALF_UP)
                    : usdRate.setScale(4, RoundingMode.HALF_UP);
            return new Fx(usdInr, FX_SETTING, true);
        }
        LOGGER.warning("No FX source answered and usdRate is unset; using the fallback USD/INR.");
        return new Fx(FALLBACK_USD_INR.setScale(4, RoundingMode.HALF_UP), FX_FALLBACK, true);
    }

    // ------------------------------------------------------------------
    // Plumbing
    // ------------------------------------------------------------------

    private Optional<JsonNode> getJson(String url, Map<String, String> headers) {
        try {
            RestClient.RequestHeadersSpec<?> spec = client().get().uri(URI.create(url)).accept(MediaType.APPLICATION_JSON);
            for (Map.Entry<String, String> header : headers.entrySet()) {
                spec = spec.header(header.getKey(), header.getValue());
            }
            ResponseEntity<String> response = spec.retrieve().toEntity(String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null || response.getBody().isBlank()) {
                return Optional.empty();
            }
            JsonNode node = objectMapper.readTree(response.getBody());
            return node == null || !node.isObject() ? Optional.empty() : Optional.of(node);
        } catch (Exception e) {
            LOGGER.log(Level.FINE, "Metal rate fetch failed: " + url, e);
            LOGGER.warning("Metal rate fetch failed for " + url + ": " + e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private RestClient client() {
        RestClient current = restClient;
        if (current == null) {
            synchronized (this) {
                if (restClient == null) {
                    RestClient.Builder builder = restClientBuilder;
                    if (builder == null) {
                        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
                        factory.setConnectTimeout(Duration.ofSeconds(8));
                        factory.setReadTimeout(Duration.ofSeconds(8));
                        builder = RestClient.builder().requestFactory(factory);
                    }
                    restClient = builder.build();
                }
                current = restClient;
            }
        }
        return current;
    }

    private BigDecimal pct(String key, BigDecimal fallback) {
        BigDecimal value = setting(key).map(MetalRateService::parseDecimal).orElse(null);
        if (value == null || value.signum() < 0 || value.compareTo(HUNDRED) > 0) {
            return fallback;
        }
        return value;
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
