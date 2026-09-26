package com.jewelry.backend.service;

import com.jewelry.backend.dto.LockMetalRatesRequest;
import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.RepriceResultDTO;
import com.jewelry.backend.repository.MetalRateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The daily auto-lock: hour gate, once per day, never on fallback figures, then a reprice. */
class MetalRateAutoLockJobTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);

    private MetalRateAutoLockJob job;
    private MetalRateBoardService boardService;
    private MetalRateRepository repo;
    private ProductService productService;
    private MetalRateBoardDTO live;
    private MetalRateBoardDTO locked;

    @BeforeEach
    void setUp() {
        boardService = mock(MetalRateBoardService.class);
        repo = mock(MetalRateRepository.class);
        productService = mock(ProductService.class);
        live = new MetalRateBoardDTO();
        live.setSource("LIVE");
        live.setIndicative(false);
        locked = new MetalRateBoardDTO();
        locked.setSource("LOCKED");
        locked.setDate(TODAY);
        when(boardService.autoLockHour()).thenReturn(Optional.of(10));
        when(boardService.liveBoard(false)).thenReturn(live);
        when(boardService.lock(any(), anyString())).thenReturn(locked);
        when(productService.repriceMetalRateProducts(any())).thenReturn(new RepriceResultDTO(3, 0, LocalDateTime.now()));

        job = new MetalRateAutoLockJob();
        job.boardService = boardService;
        job.metalRateRepository = repo;
        job.productService = productService;
        at("2026-09-26T04:35:00Z"); // 10:05 IST
    }

    private void at(String utc) {
        job.clock = Clock.fixed(Instant.parse(utc), INDIA);
    }

    @Test
    void locksTheLiveBoardOnceTheHourIsReachedAndReprices() {
        assertThat(job.runOnce()).isTrue();
        ArgumentCaptor<LockMetalRatesRequest> request = ArgumentCaptor.forClass(LockMetalRatesRequest.class);
        verify(boardService).lock(request.capture(), eq("system"));
        assertThat(request.getValue().getRates()).isEmpty();
        assertThat(request.getValue().getNote()).contains("10:05");
        verify(productService).repriceMetalRateProducts(locked);
    }

    @Test
    void waitsUntilTheConfiguredHourInIst() {
        at("2026-09-26T04:25:00Z"); // 09:55 IST
        assertThat(job.runOnce()).isFalse();
        verify(boardService, never()).lock(any(), anyString());
    }

    @Test
    void doesNothingWhenTheDayIsAlreadyLocked() {
        when(repo.existsByRateDate(TODAY)).thenReturn(true);
        assertThat(job.runOnce()).isFalse();
        verify(boardService, never()).lock(any(), anyString());
        verify(productService, never()).repriceMetalRateProducts(any());
    }

    @Test
    void blankHourSettingDisablesTheJob() {
        when(boardService.autoLockHour()).thenReturn(Optional.empty());
        assertThat(job.runOnce()).isFalse();
        verify(boardService, never()).liveBoard(false);
    }

    @Test
    void neverLocksAnIndicativeBoard() {
        live.setIndicative(true);
        assertThat(job.runOnce()).isFalse();
        verify(boardService, never()).lock(any(), anyString());
    }

    @Test
    void runSwallowsFailuresSoTheSchedulerKeepsGoing() {
        when(boardService.liveBoard(false)).thenThrow(new RuntimeException("feed exploded"));
        job.run();
    }
}
