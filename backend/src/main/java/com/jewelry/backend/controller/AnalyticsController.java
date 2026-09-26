package com.jewelry.backend.controller;

import com.jewelry.backend.dto.AnalyticsDtos.Breakdown;
import com.jewelry.backend.dto.AnalyticsDtos.Overview;
import com.jewelry.backend.dto.AnalyticsDtos.Series;
import com.jewelry.backend.dto.AnalyticsDtos.StockReport;
import com.jewelry.backend.dto.AnalyticsDtos.TopProducts;
import com.jewelry.backend.service.AnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/**
 * Sales, margin, customer and stock analytics for the admin (permission
 * dashboard.read). Dates are ISO calendar days, inclusive; both default to
 * the last 30 days. Shapes are the records in AnalyticsDtos.
 */
@RestController
@RequestMapping("/api/v1/admin/analytics")
@PreAuthorize("@access.has('dashboard.read')")
@Tag(name = "Admin Analytics", description = "Sales, margin, customer and stock figures for the back office")
public class AnalyticsController {

    @Autowired
    private AnalyticsService analyticsService;

    @GetMapping("/overview")
    @Operation(summary = "KPIs for the period with the previous period of the same length for comparison")
    public ResponseEntity<Overview> overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(analyticsService.overview(from, to));
    }

    @GetMapping("/series")
    @Operation(summary = "Revenue, orders and known-cost margin per day, week or month (zero-filled), plus the previous period")
    public ResponseEntity<Series> series(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false, defaultValue = "day") String granularity) {
        return ResponseEntity.ok(analyticsService.series(from, to, granularity));
    }

    @GetMapping("/breakdown")
    @Operation(summary = "Sales by category, metal, purity, itemType, state (place of supply) or paymentMethod")
    public ResponseEntity<Breakdown> breakdown(
            @RequestParam(required = false, defaultValue = "category") String dimension,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(analyticsService.breakdown(dimension, from, to));
    }

    @GetMapping("/products/top")
    @Operation(summary = "Best sellers by revenue or units, with known-cost margin")
    public ResponseEntity<TopProducts> topProducts(
            @RequestParam(required = false, defaultValue = "revenue") String by,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false, defaultValue = "20") int limit) {
        return ResponseEntity.ok(analyticsService.topProducts(by, from, to, limit));
    }

    @GetMapping("/stock")
    @Operation(summary = "Stock value at price and cost, dead stock (no sale in N days), low stock and per-store value")
    public ResponseEntity<StockReport> stock(
            @RequestParam(required = false, defaultValue = "90") int deadAfterDays,
            @RequestParam(required = false, defaultValue = "50") int limit) {
        return ResponseEntity.ok(analyticsService.stock(deadAfterDays, limit));
    }

    @GetMapping(value = "/export", produces = "text/csv")
    @Operation(summary = "CSV of the period's orders (report=orders) or product sales (report=products)")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false, defaultValue = "orders") String report,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String csv = analyticsService.exportCsv(report, from, to);
        byte[] body = ("\uFEFF" + csv).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + analyticsService.exportFileName(report, from, to) + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }
}
