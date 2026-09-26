package com.jewelry.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.jewelry.backend.pricing.MetalPurities;
import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The rate board as {@code GET /api/v1/metal-prices/today} returns it:
 * one line per metal and purity in table order, plus where the figures came
 * from. {@code source} is LOCKED when the day's board has been locked and
 * LIVE when it is derived from the feed on the fly.
 */
@Data
public class MetalRateBoardDTO {

    public static final String SOURCE_LOCKED = "LOCKED";
    public static final String SOURCE_LIVE = "LIVE";

    private LocalDate date;
    private LocalDateTime asOf;
    private String source;
    private LocalDateTime lockedAt;
    private String lockedBy;
    private String note;
    private boolean indicative;
    private FxDTO fx;
    private LiveDTO live;
    private List<RateDTO> rates = new ArrayList<>();

    @Data
    public static class FxDTO {
        private BigDecimal usdInr;
        private String source; // frankfurter | er-api | setting | fallback
    }

    @Data
    public static class LiveDTO {
        private BigDecimal goldUsdPerOunce;
        private BigDecimal silverUsdPerOunce;
        private BigDecimal platinumUsdPerOunce;
        private LocalDateTime updatedAt;
        private String provider;
        private BigDecimal dutyPct;
        private BigDecimal premiumPct;
    }

    @Data
    public static class RateDTO {
        private String metal;
        private String purity;
        private BigDecimal purityFraction;
        private BigDecimal ratePerGram;
        private String source; // LIVE | MANUAL (per line; null on a live board)

        public RateDTO() {
        }

        public RateDTO(String metal, String purity, BigDecimal purityFraction, BigDecimal ratePerGram, String source) {
            this.metal = metal;
            this.purity = purity;
            this.purityFraction = purityFraction;
            this.ratePerGram = ratePerGram;
            this.source = source;
        }
    }

    /** The line for a metal and purity (labels normalised), if the board has it. */
    @JsonIgnore
    public Optional<RateDTO> line(String metal, String purity) {
        String m = MetalPurities.normalizeMetal(metal);
        String p = MetalPurities.normalizePurity(m, purity);
        if (m == null || p == null || rates == null) {
            return Optional.empty();
        }
        return rates.stream().filter(r -> m.equals(r.getMetal()) && p.equals(r.getPurity())).findFirst();
    }

    /** Rupees per gram at a purity, if the board has the line. */
    @JsonIgnore
    public Optional<BigDecimal> ratePerGram(String metal, String purity) {
        return line(metal, purity).map(RateDTO::getRatePerGram);
    }

    /**
     * Rupees per gram of fine metal (999): the metal's fine-label line divided
     * by its fraction, so a board and the quotes built on it agree.
     */
    @JsonIgnore
    public Optional<BigDecimal> fineRatePerGram(String metal) {
        String m = MetalPurities.normalizeMetal(metal);
        MetalPurities.Purity fine = MetalPurities.fine(m);
        if (fine == null) {
            return Optional.empty();
        }
        return ratePerGram(m, fine.label())
                .map(rate -> rate.divide(fine.fraction(), 2, RoundingMode.HALF_UP));
    }

    @JsonIgnore
    public boolean isLocked() {
        return SOURCE_LOCKED.equals(source);
    }
}
