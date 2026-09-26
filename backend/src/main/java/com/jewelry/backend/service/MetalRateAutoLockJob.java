package com.jewelry.backend.service;

import com.jewelry.backend.dto.LockMetalRatesRequest;
import com.jewelry.backend.dto.MetalRateBoardDTO;
import com.jewelry.backend.dto.RepriceResultDTO;
import com.jewelry.backend.repository.MetalRateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Locks the live board automatically once the day (IST) reaches
 * {@code metalRateAutoLockHour} and nothing has been locked yet, then
 * reprices every METAL_RATE product. Polls every five minutes so a restart
 * or a late feed still gets the day locked; never locks fallback figures
 * (an indicative live board is skipped and retried on the next tick).
 */
@Component
public class MetalRateAutoLockJob {

    private static final Logger LOGGER = Logger.getLogger(MetalRateAutoLockJob.class.getName());
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    @Autowired
    MetalRateBoardService boardService;

    @Autowired
    MetalRateRepository metalRateRepository;

    @Autowired
    ProductService productService;

    /** Package-private so tests can pin the clock. */
    Clock clock = Clock.system(INDIA);

    @Scheduled(fixedDelay = 300_000, initialDelay = 120_000)
    public void run() {
        try {
            runOnce();
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Metal rate auto-lock failed", e);
        }
    }

    /** One tick; true when a board was locked. */
    public boolean runOnce() {
        Optional<Integer> hour = boardService.autoLockHour();
        if (hour.isEmpty()) {
            return false;
        }
        ZonedDateTime now = ZonedDateTime.now(clock);
        if (now.getHour() < hour.get()) {
            return false;
        }
        if (metalRateRepository.existsByRateDate(now.toLocalDate())) {
            return false;
        }
        MetalRateBoardDTO live = boardService.liveBoard(false);
        if (live.isIndicative()) {
            LOGGER.warning("Metal rate auto-lock skipped: the live board is indicative (feed or FX fell back).");
            return false;
        }
        LockMetalRatesRequest request = new LockMetalRatesRequest();
        request.setNote("Auto-locked from the live feed at " + now.format(DateTimeFormatter.ofPattern("HH:mm")) + " IST");
        MetalRateBoardDTO board = boardService.lock(request, "system");
        RepriceResultDTO result = productService.repriceMetalRateProducts(board);
        LOGGER.info("Metal rates auto-locked for " + board.getDate() + "; repriced " + result.repriced()
                + " product(s), skipped " + result.skipped() + ".");
        return true;
    }
}
