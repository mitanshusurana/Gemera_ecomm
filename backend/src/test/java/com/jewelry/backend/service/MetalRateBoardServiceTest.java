package com.jewelry.backend.service;

import com.jewelry.backend.dto.LockMetalRatesRequest;
import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.MetalRateHistoryPointDTO;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.MetalRate;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.MetalRateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Board derivation from fine rates, lock filling in missing purities, today() precedence, history. */
class MetalRateBoardServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);

    private MetalRateBoardService service;
    private MetalRateService metalRateService;
    private MetalRateRepository repo;
    private GlobalSettingRepository settings;
    private final List<MetalRate> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        metalRateService = mock(MetalRateService.class);
        repo = mock(MetalRateRepository.class);
        settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        when(repo.findByRateDate(any())).thenAnswer(inv -> new ArrayList<>(saved)); // what lock() wrote
        when(repo.findFirstByRateDateAndMetalAndPurity(any(), anyString(), anyString())).thenReturn(Optional.empty());
        when(repo.save(any(MetalRate.class))).thenAnswer(inv -> {
            MetalRate row = inv.getArgument(0);
            saved.add(row);
            return row;
        });
        when(metalRateService.live()).thenReturn(live(false));
        when(metalRateService.refresh()).thenReturn(live(false));

        service = new MetalRateBoardService();
        service.metalRateService = metalRateService;
        service.metalRateRepository = repo;
        service.globalSettingRepository = settings;
        service.clock = Clock.fixed(Instant.parse("2026-09-26T04:30:00Z"), ZoneId.of("Asia/Kolkata"));
    }

    /** Live derivation as MetalRateService would answer: gold 14000, silver 150, platinum 4000 per fine gram. */
    private static MetalRateService.LiveRates live(boolean indicative) {
        Map<String, BigDecimal> fine = new LinkedHashMap<>();
        fine.put("GOLD", new BigDecimal("14000.00"));
        fine.put("SILVER", new BigDecimal("150.00"));
        fine.put("PLATINUM", new BigDecimal("4000.00"));
        MetalRateService.Spot spot = new MetalRateService.Spot(new BigDecimal("4286.2"), new BigDecimal("50"),
                new BigDecimal("1500"), LocalDateTime.of(2026, 9, 26, 8, 26), "GOLD_API_FREE", indicative);
        MetalRateService.Fx fx = new MetalRateService.Fx(new BigDecimal("95.82"), "frankfurter", false);
        return new MetalRateService.LiveRates(spot, fx, new BigDecimal("6"), BigDecimal.ZERO, fine, indicative,
                LocalDateTime.of(2026, 9, 26, 10, 0));
    }

    private static LockMetalRatesRequest.Line line(String metal, String purity, String rate) {
        LockMetalRatesRequest.Line l = new LockMetalRatesRequest.Line();
        l.setMetal(metal);
        l.setPurity(purity);
        l.setRatePerGram(rate == null ? null : new BigDecimal(rate));
        return l;
    }

    private static String describe(MetalRateBoardDTO.RateDTO r) {
        return r.getMetal() + " " + r.getPurity() + " " + r.getRatePerGram().toPlainString()
                + (r.getSource() == null ? "" : " " + r.getSource());
    }

    // ---- derivation --------------------------------------------------------

    @Test
    void boardLinesAreFineTimesFractionRoundedToTheRupeeInTableOrder() {
        List<MetalRateBoardDTO.RateDTO> lines = MetalRateBoardService.deriveLines(live(false).finePerGram(), null);
        assertThat(lines).extracting(MetalRateBoardServiceTest::describe).containsExactly(
                "GOLD 24K 13986", "GOLD 22K 12824", "GOLD 18K 10500", "GOLD 14K 8190",
                "SILVER 999 150", "SILVER 925 139",
                "PLATINUM 950 3800");
        assertThat(lines.get(0).getPurityFraction()).isEqualByComparingTo("0.999");
    }

    @Test
    void liveBoardCarriesTheFeedDetailsAndTheIndicativeFlag() {
        MetalRateBoardDTO board = service.liveBoard(false);
        assertThat(board.getSource()).isEqualTo("LIVE");
        assertThat(board.getDate()).isEqualTo(TODAY);
        assertThat(board.isIndicative()).isFalse();
        assertThat(board.getLockedAt()).isNull();
        assertThat(board.getFx().getUsdInr()).isEqualByComparingTo("95.82");
        assertThat(board.getFx().getSource()).isEqualTo("frankfurter");
        assertThat(board.getLive().getGoldUsdPerOunce()).isEqualByComparingTo("4286.2");
        assertThat(board.getLive().getDutyPct()).isEqualByComparingTo("6");
        assertThat(board.getRates()).hasSize(7);
        assertThat(board.ratePerGram("gold", "916")).contains(new BigDecimal("12824"));
        assertThat(board.fineRatePerGram("GOLD")).contains(new BigDecimal("14000.00")); // 13986 / 0.999
        verify(metalRateService, never()).refresh();

        when(metalRateService.live()).thenReturn(live(true));
        assertThat(service.liveBoard(false).isIndicative()).isTrue();
        service.liveBoard(true);
        verify(metalRateService).refresh();
    }

    @Test
    void todayIsTheLiveBoardUntilSomethingIsLocked() {
        assertThat(service.today().getSource()).isEqualTo("LIVE");
    }

    @Test
    void todayIsTheLockedBoardWhenRowsExist() {
        MetalRate row = new MetalRate();
        row.setRateDate(TODAY);
        row.setMetal("GOLD");
        row.setPurity("22K");
        row.setPurityFraction(new BigDecimal("0.916"));
        row.setRatePerGram(new BigDecimal("12900.00"));
        row.setSource("MANUAL");
        row.setLockedBy("owner@caratloop.com");
        row.setLockedAt(LocalDateTime.of(2026, 9, 26, 9, 45));
        row.setNote("Counter rate");
        MetalRate fine = new MetalRate();
        fine.setRateDate(TODAY);
        fine.setMetal("GOLD");
        fine.setPurity("24K");
        fine.setPurityFraction(new BigDecimal("0.999"));
        fine.setRatePerGram(new BigDecimal("14069.00"));
        fine.setSource("MANUAL");
        fine.setLockedAt(LocalDateTime.of(2026, 9, 26, 9, 45));
        when(repo.findByRateDate(TODAY)).thenReturn(List.of(row, fine)); // stored out of table order

        MetalRateBoardDTO board = service.today();
        assertThat(board.getSource()).isEqualTo("LOCKED");
        assertThat(board.isLocked()).isTrue();
        assertThat(board.isIndicative()).isFalse();
        assertThat(board.getLockedAt()).isEqualTo(LocalDateTime.of(2026, 9, 26, 9, 45));
        assertThat(board.getAsOf()).isEqualTo(board.getLockedAt());
        assertThat(board.getLockedBy()).isEqualTo("owner@caratloop.com");
        assertThat(board.getNote()).isEqualTo("Counter rate");
        assertThat(board.getRates()).extracting(MetalRateBoardServiceTest::describe)
                .containsExactly("GOLD 24K 14069 MANUAL", "GOLD 22K 12900 MANUAL");
        assertThat(board.getFx()).isNotNull(); // live context still attached for display
    }

    // ---- lock --------------------------------------------------------------

    @Test
    void lockFillsMissingPuritiesFromTheGivenFineRateAndMissingMetalsFromTheFeed() {
        LockMetalRatesRequest request = new LockMetalRatesRequest();
        request.setRates(List.of(line("gold", "24k", "14500")));
        request.setNote("  Morning rate  ");

        service.lock(request, "owner@caratloop.com");

        // 14500 / 0.999 = 14514.5145 fine; 22K = 13295, 18K = 10886, 14K = 8491
        assertThat(saved).extracting(r -> r.getMetal() + " " + r.getPurity() + " " + r.getRatePerGram().toPlainString() + " " + r.getSource())
                .containsExactly(
                        "GOLD 24K 14500 MANUAL", "GOLD 22K 13295 MANUAL", "GOLD 18K 10886 MANUAL", "GOLD 14K 8491 MANUAL",
                        "SILVER 999 150 LIVE", "SILVER 925 139 LIVE",
                        "PLATINUM 950 3800 LIVE");
        assertThat(saved).allSatisfy(r -> {
            assertThat(r.getRateDate()).isEqualTo(TODAY);
            assertThat(r.getLockedBy()).isEqualTo("owner@caratloop.com");
            assertThat(r.getLockedAt()).isEqualTo(LocalDateTime.of(2026, 9, 26, 10, 0));
            assertThat(r.getNote()).isEqualTo("Morning rate");
            assertThat(r.getPurityFraction()).isNotNull();
        });
    }

    @Test
    void lockDerivesTheFineRateFromWhateverPurityWasGivenAndKeepsTypedLines() {
        LockMetalRatesRequest request = new LockMetalRatesRequest();
        request.setRates(List.of(line("GOLD", "22K", "12824"), line("GOLD", "14K", "8300.4"), line("SILVER", "925", "140")));

        List<MetalRateBoardDTO.RateDTO> lines = MetalRateBoardService.resolveLockLines(request.getRates(), service.liveBoard(false));

        // 12824 / 0.916 = 14000 fine -> 24K 13986, 18K 10500; 14K typed (rounded to the rupee) wins
        assertThat(lines).extracting(MetalRateBoardServiceTest::describe).containsExactly(
                "GOLD 24K 13986 MANUAL", "GOLD 22K 12824 MANUAL", "GOLD 18K 10500 MANUAL", "GOLD 14K 8300 MANUAL",
                "SILVER 999 151 MANUAL", "SILVER 925 140 MANUAL",   // 140 / 0.925 = 151.35 fine -> 999: 151
                "PLATINUM 950 3800 LIVE");
    }

    @Test
    void emptyLockTakesTheWholeLiveBoardAsLive() {
        MetalRateBoardDTO board = service.lock(new LockMetalRatesRequest(), null);
        assertThat(saved).hasSize(7).allSatisfy(r -> {
            assertThat(r.getSource()).isEqualTo("LIVE");
            assertThat(r.getLockedBy()).isEqualTo("system");
            assertThat(r.getNote()).isNull();
        });
        assertThat(board).isNotNull();
        // a null body behaves the same
        saved.clear();
        service.lock(null, "x");
        assertThat(saved).hasSize(7);
    }

    @Test
    void lockRewritesExistingRowsInPlace() {
        MetalRate existing = new MetalRate();
        existing.setRateDate(TODAY);
        existing.setMetal("GOLD");
        existing.setPurity("24K");
        existing.setRatePerGram(new BigDecimal("100"));
        when(repo.findFirstByRateDateAndMetalAndPurity(eq(TODAY), eq("GOLD"), eq("24K"))).thenReturn(Optional.of(existing));

        LockMetalRatesRequest request = new LockMetalRatesRequest();
        request.setRates(List.of(line("GOLD", "24K", "14500")));
        service.lock(request, "a@b.c");

        assertThat(saved.get(0)).isSameAs(existing);
        assertThat(existing.getRatePerGram()).isEqualByComparingTo("14500");
        assertThat(existing.getSource()).isEqualTo("MANUAL");
    }

    @Test
    void lockRejectsUnknownMetalsPuritiesAndNonPositiveRates() {
        assertThatThrownBy(() -> MetalRateBoardService.resolveLockLines(List.of(line("copper", "24K", "1")), service.liveBoard(false)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Unknown metal");
        assertThatThrownBy(() -> MetalRateBoardService.resolveLockLines(List.of(line("GOLD", "9K", "1")), service.liveBoard(false)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Unknown purity");
        assertThatThrownBy(() -> MetalRateBoardService.resolveLockLines(List.of(line("GOLD", "22K", "0")), service.liveBoard(false)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("above zero");
        assertThatThrownBy(() -> MetalRateBoardService.resolveLockLines(List.of(line("GOLD", "22K", null)), service.liveBoard(false)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("above zero");
        assertThat(saved).isEmpty();
    }

    // ---- history and settings ---------------------------------------------

    @Test
    void historyNormalisesLabelsClampsTheWindowAndDefaultsToTheFineLabel() {
        MetalRate row = new MetalRate();
        row.setRateDate(TODAY.minusDays(1));
        row.setPurity("22K");
        row.setMetal("GOLD");
        row.setRatePerGram(new BigDecimal("12800.00"));
        row.setSource("LIVE");
        when(repo.findByMetalAndPurityAndRateDateGreaterThanEqualOrderByRateDateAsc("GOLD", "22K", TODAY.minusDays(29)))
                .thenReturn(List.of(row));

        List<MetalRateHistoryPointDTO> points = service.history("gold", "916", null);
        assertThat(points).hasSize(1);
        assertThat(points.get(0).date()).isEqualTo(TODAY.minusDays(1));
        assertThat(points.get(0).ratePerGram()).isEqualByComparingTo("12800");
        assertThat(points.get(0).source()).isEqualTo("LIVE");

        service.history("SILVER", null, 1000);
        verify(repo).findByMetalAndPurityAndRateDateGreaterThanEqualOrderByRateDateAsc("SILVER", "999", TODAY.minusDays(365));
        service.history("PLATINUM", "950", 0);
        verify(repo).findByMetalAndPurityAndRateDateGreaterThanEqualOrderByRateDateAsc("PLATINUM", "950", TODAY.minusDays(29));

        assertThatThrownBy(() -> service.history("brass", "22K", 7)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.history("GOLD", "9K", 7)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void autoLockHourDefaultsToTenBlankDisablesAndGarbageDisables() {
        assertThat(service.autoLockHour()).contains(10);

        GlobalSetting s = new GlobalSetting();
        s.setSettingKey(MetalRateBoardService.SETTING_AUTO_LOCK_HOUR);
        when(settings.findBySettingKey(MetalRateBoardService.SETTING_AUTO_LOCK_HOUR)).thenReturn(Optional.of(s));
        s.setSettingValue("  ");
        assertThat(service.autoLockHour()).isEmpty();
        s.setSettingValue("9");
        assertThat(service.autoLockHour()).contains(9);
        s.setSettingValue("24");
        assertThat(service.autoLockHour()).isEmpty();
        s.setSettingValue("ten");
        assertThat(service.autoLockHour()).isEmpty();
    }
}
