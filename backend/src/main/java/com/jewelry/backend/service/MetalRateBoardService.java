package com.jewelry.backend.service;

import com.jewelry.backend.dto.LockMetalRatesRequest;
import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.MetalRateHistoryPointDTO;
import com.jewelry.backend.entity.MetalRate;
import com.jewelry.backend.pricing.MetalPurities;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.MetalRateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The rate of the day. {@link #today()} answers the board the shop locked
 * for today (IST) when there is one, otherwise the live derivation flagged
 * {@code source: LIVE}. {@link #lock} writes today's rows: lines the request
 * gives are MANUAL, purities it leaves out derive from that metal's fine
 * label (24K / 999 / 950), and a metal with no line at all is filled from
 * the live feed as LIVE. Every board line is a whole rupee.
 */
@Service
public class MetalRateBoardService {

    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    public static final String SETTING_AUTO_LOCK_HOUR = "metalRateAutoLockHour";
    static final int DEFAULT_AUTO_LOCK_HOUR = 10;
    static final int MAX_HISTORY_DAYS = 366;

    @Autowired
    MetalRateService metalRateService;

    @Autowired
    MetalRateRepository metalRateRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    /** Package-private so tests can pin "today". */
    Clock clock = Clock.system(INDIA);

    public LocalDate todayDate() {
        return LocalDate.now(clock);
    }

    // ------------------------------------------------------------------
    // Reading
    // ------------------------------------------------------------------

    /** Today's locked board, or the live board when nothing is locked yet. */
    public MetalRateBoardDTO today() {
        return locked(todayDate()).orElseGet(() -> liveBoard(false));
    }

    /** The board locked for a date, if any rows exist. */
    public Optional<MetalRateBoardDTO> locked(LocalDate date) {
        List<MetalRate> rows = metalRateRepository.findByRateDate(date);
        if (rows == null || rows.isEmpty()) {
            return Optional.empty();
        }
        MetalRateBoardDTO board = new MetalRateBoardDTO();
        board.setDate(date);
        board.setSource(MetalRateBoardDTO.SOURCE_LOCKED);
        board.setIndicative(false);
        LocalDateTime lockedAt = null;
        for (MetalRate row : rows) {
            if (row.getLockedAt() != null && (lockedAt == null || row.getLockedAt().isAfter(lockedAt))) {
                lockedAt = row.getLockedAt();
                board.setLockedBy(row.getLockedBy());
                board.setNote(row.getNote());
            }
        }
        board.setLockedAt(lockedAt);
        board.setAsOf(lockedAt != null ? lockedAt : LocalDateTime.now(clock));
        List<MetalRateBoardDTO.RateDTO> lines = new ArrayList<>();
        for (MetalRate row : rows) {
            lines.add(new MetalRateBoardDTO.RateDTO(row.getMetal(), row.getPurity(), row.getPurityFraction(),
                    whole(row.getRatePerGram()), row.getSource()));
        }
        lines.sort(Comparator.comparingInt(MetalRateBoardService::tableIndex));
        board.setRates(lines);
        attachLive(board, metalRateService.live());
        return Optional.of(board);
    }

    /** The live-derived board, ignoring any lock; {@code fresh} forces a new fetch. */
    public MetalRateBoardDTO liveBoard(boolean fresh) {
        MetalRateService.LiveRates live = fresh ? metalRateService.refresh() : metalRateService.live();
        MetalRateBoardDTO board = new MetalRateBoardDTO();
        board.setDate(todayDate());
        board.setSource(MetalRateBoardDTO.SOURCE_LIVE);
        board.setAsOf(live.asOf());
        board.setIndicative(live.indicative());
        board.setRates(deriveLines(live.finePerGram(), null));
        attachLive(board, live);
        return board;
    }

    /** Board lines from INR-per-fine-gram figures: fine x fraction, rounded to the rupee. */
    public static List<MetalRateBoardDTO.RateDTO> deriveLines(Map<String, BigDecimal> finePerGram, String source) {
        List<MetalRateBoardDTO.RateDTO> lines = new ArrayList<>();
        for (MetalPurities.Purity purity : MetalPurities.ALL) {
            BigDecimal fine = finePerGram == null ? null : finePerGram.get(purity.metal());
            if (fine == null) {
                continue;
            }
            lines.add(new MetalRateBoardDTO.RateDTO(purity.metal(), purity.label(), purity.fraction(),
                    whole(fine.multiply(purity.fraction())), source));
        }
        return lines;
    }

    private static void attachLive(MetalRateBoardDTO board, MetalRateService.LiveRates live) {
        if (live == null) {
            return;
        }
        MetalRateBoardDTO.FxDTO fx = new MetalRateBoardDTO.FxDTO();
        fx.setUsdInr(live.fx().usdInr());
        fx.setSource(live.fx().source());
        board.setFx(fx);
        MetalRateBoardDTO.LiveDTO spot = new MetalRateBoardDTO.LiveDTO();
        spot.setGoldUsdPerOunce(live.spot().goldUsdPerOunce());
        spot.setSilverUsdPerOunce(live.spot().silverUsdPerOunce());
        spot.setPlatinumUsdPerOunce(live.spot().platinumUsdPerOunce());
        spot.setUpdatedAt(live.spot().updatedAt() != null ? live.spot().updatedAt() : live.asOf());
        spot.setProvider(live.spot().provider());
        spot.setDutyPct(live.dutyPct());
        spot.setPremiumPct(live.premiumPct());
        board.setLive(spot);
    }

    // ------------------------------------------------------------------
    // Locking
    // ------------------------------------------------------------------

    /**
     * Locks today's board. Lines given in the request are MANUAL; purities
     * missing for a metal derive from its fine-label line (or, failing that,
     * from the first line given for it); a metal with no line is taken from
     * the live board as LIVE. Rewrites existing rows for the day in place.
     */
    @Transactional(rollbackFor = Exception.class)
    public MetalRateBoardDTO lock(LockMetalRatesRequest request, String actor) {
        List<LockMetalRatesRequest.Line> given = request == null || request.getRates() == null
                ? List.of() : request.getRates();
        String note = request == null || request.getNote() == null || request.getNote().isBlank()
                ? null : request.getNote().trim();
        if (note != null && note.length() > 500) {
            note = note.substring(0, 500);
        }
        MetalRateBoardDTO live = liveBoard(false);
        List<MetalRateBoardDTO.RateDTO> lines = resolveLockLines(given, live);

        LocalDate today = todayDate();
        LocalDateTime now = LocalDateTime.now(clock);
        String by = actor == null || actor.isBlank() ? "system" : actor.trim();
        for (MetalRateBoardDTO.RateDTO line : lines) {
            MetalRate row = metalRateRepository
                    .findFirstByRateDateAndMetalAndPurity(today, line.getMetal(), line.getPurity())
                    .orElseGet(MetalRate::new);
            row.setRateDate(today);
            row.setMetal(line.getMetal());
            row.setPurity(line.getPurity());
            row.setPurityFraction(line.getPurityFraction());
            row.setRatePerGram(line.getRatePerGram());
            row.setSource(line.getSource());
            row.setLockedBy(by);
            row.setLockedAt(now);
            row.setNote(note);
            metalRateRepository.save(row);
        }
        return locked(today).orElseThrow(() -> new IllegalStateException("Board lock did not persist."));
    }

    /**
     * Pure part of {@link #lock}: the full table for the request, with sources.
     * Throws on an unknown metal or purity or a non-positive rate.
     */
    public static List<MetalRateBoardDTO.RateDTO> resolveLockLines(List<LockMetalRatesRequest.Line> given,
                                                                   MetalRateBoardDTO live) {
        Map<String, Map<String, BigDecimal>> byMetal = new LinkedHashMap<>();
        for (LockMetalRatesRequest.Line line : given) {
            if (line == null) {
                continue;
            }
            String metal = MetalPurities.normalizeMetal(line.getMetal());
            if (metal == null) {
                throw new IllegalArgumentException("Unknown metal '" + line.getMetal() + "'; use GOLD, SILVER or PLATINUM.");
            }
            String purity = MetalPurities.normalizePurity(metal, line.getPurity());
            if (purity == null) {
                throw new IllegalArgumentException("Unknown purity '" + line.getPurity() + "' for " + metal + ".");
            }
            if (line.getRatePerGram() == null || line.getRatePerGram().signum() <= 0) {
                throw new IllegalArgumentException("Rate per gram for " + metal + " " + purity + " must be above zero.");
            }
            byMetal.computeIfAbsent(metal, k -> new LinkedHashMap<>()).put(purity, whole(line.getRatePerGram()));
        }

        List<MetalRateBoardDTO.RateDTO> lines = new ArrayList<>();
        for (String metal : MetalPurities.METALS) {
            Map<String, BigDecimal> rates = byMetal.getOrDefault(metal, Map.of());
            MetalPurities.Purity fine = MetalPurities.fine(metal);
            BigDecimal fineRate;
            String derivedSource;
            if (rates.containsKey(fine.label())) {
                fineRate = rates.get(fine.label()).divide(fine.fraction(), 4, RoundingMode.HALF_UP);
                derivedSource = MetalRate.SOURCE_MANUAL;
            } else if (!rates.isEmpty()) {
                MetalPurities.Purity first = null;
                for (MetalPurities.Purity p : MetalPurities.forMetal(metal)) {
                    if (rates.containsKey(p.label())) {
                        first = p;
                        break;
                    }
                }
                fineRate = rates.get(first.label()).divide(first.fraction(), 4, RoundingMode.HALF_UP);
                derivedSource = MetalRate.SOURCE_MANUAL;
            } else {
                fineRate = live == null ? null : live.fineRatePerGram(metal).orElse(null);
                if (fineRate == null) {
                    throw new IllegalArgumentException("No live rate for " + metal + "; enter its " + fine.label() + " rate.");
                }
                derivedSource = MetalRate.SOURCE_LIVE;
            }
            for (MetalPurities.Purity purity : MetalPurities.forMetal(metal)) {
                BigDecimal rate = rates.get(purity.label());
                String source = MetalRate.SOURCE_MANUAL;
                if (rate == null) {
                    rate = whole(fineRate.multiply(purity.fraction()));
                    source = derivedSource;
                }
                lines.add(new MetalRateBoardDTO.RateDTO(metal, purity.label(), purity.fraction(), rate, source));
            }
        }
        return lines;
    }

    // ------------------------------------------------------------------
    // History and settings
    // ------------------------------------------------------------------

    /** Locked rates for one metal and purity over the last {@code days} days (1..366, default 30), oldest first. */
    public List<MetalRateHistoryPointDTO> history(String metalRaw, String purityRaw, Integer days) {
        String metal = MetalPurities.normalizeMetal(metalRaw);
        if (metal == null) {
            throw new IllegalArgumentException("Metal must be GOLD, SILVER or PLATINUM.");
        }
        String purity = MetalPurities.normalizePurity(metal, purityRaw == null ? MetalPurities.fineLabel(metal) : purityRaw);
        if (purity == null) {
            throw new IllegalArgumentException("Unknown purity '" + purityRaw + "' for " + metal + ".");
        }
        int window = days == null || days < 1 ? 30 : Math.min(days, MAX_HISTORY_DAYS);
        LocalDate from = todayDate().minusDays(window - 1L);
        List<MetalRateHistoryPointDTO> points = new ArrayList<>();
        for (MetalRate row : metalRateRepository
                .findByMetalAndPurityAndRateDateGreaterThanEqualOrderByRateDateAsc(metal, purity, from)) {
            points.add(new MetalRateHistoryPointDTO(row.getRateDate(), whole(row.getRatePerGram()), row.getSource()));
        }
        return points;
    }

    /**
     * Hour of day (IST, 0-23) at which the live board is locked automatically;
     * empty when the {@code metalRateAutoLockHour} setting is blank or not a
     * valid hour. Missing setting means the default (10).
     */
    public Optional<Integer> autoLockHour() {
        return globalSettingRepository.findBySettingKey(SETTING_AUTO_LOCK_HOUR)
                .map(s -> s.getSettingValue() == null ? "" : s.getSettingValue().trim())
                .map(v -> {
                    if (v.isEmpty()) {
                        return Optional.<Integer>empty();
                    }
                    try {
                        int hour = Integer.parseInt(v);
                        return hour >= 0 && hour <= 23 ? Optional.of(hour) : Optional.<Integer>empty();
                    } catch (NumberFormatException e) {
                        return Optional.<Integer>empty();
                    }
                })
                .orElse(Optional.of(DEFAULT_AUTO_LOCK_HOUR));
    }

    // ------------------------------------------------------------------

    static BigDecimal whole(BigDecimal value) {
        return value == null ? null : value.setScale(0, RoundingMode.HALF_UP);
    }

    private static int tableIndex(MetalRateBoardDTO.RateDTO line) {
        for (int i = 0; i < MetalPurities.ALL.size(); i++) {
            MetalPurities.Purity p = MetalPurities.ALL.get(i);
            if (p.metal().equals(line.getMetal()) && p.label().equals(line.getPurity())) {
                return i;
            }
        }
        return MetalPurities.ALL.size();
    }
}
