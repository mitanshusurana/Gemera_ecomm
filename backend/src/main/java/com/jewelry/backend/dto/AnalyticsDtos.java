package com.jewelry.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Response shapes of /api/v1/admin/analytics/* (AnalyticsService). Records,
 * so Jackson writes exactly these keys and nothing else.
 */
public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    /** Inclusive calendar range. */
    public record Period(LocalDate from, LocalDate to, int days) {
    }

    /** A figure for the period, the same figure for the compare period, and the % change (null when previous is 0). */
    public record Metric(BigDecimal current, BigDecimal previous, BigDecimal deltaPercent) {
    }

    /** One slice of a breakdown; share is the % of the breakdown total. */
    public record BreakdownRow(String key, String label, BigDecimal revenue, long units, long orders, BigDecimal share) {
    }

    public record Breakdown(String dimension, Period period, BigDecimal total, List<BreakdownRow> rows) {
    }

    public record Overview(
            Period period,
            Period comparePeriod,
            Metric revenue,
            Metric orders,
            Metric averageOrderValue,
            Metric unitsSold,
            Metric grossMargin,
            BigDecimal grossMarginPercent,
            BigDecimal revenueWithKnownCost,
            BigDecimal revenueWithUnknownCost,
            BigDecimal unknownCostSharePercent,
            BigDecimal couponDiscount,
            BigDecimal loyaltyDiscount,
            BigDecimal otherDiscount,
            BigDecimal giftCardRedeemed,
            BigDecimal treasureRedeemed,
            BigDecimal tax,
            BigDecimal shipping,
            long newCustomers,
            long returningCustomers,
            long refundCount,
            BigDecimal refundAmount,
            Map<String, Long> repairsByStatus,
            Map<String, Long> exchangeByStatus,
            List<BreakdownRow> byPaymentMethod) {
    }

    /** bucket is the ISO date (day), the Monday of the week (week) or yyyy-MM (month). */
    public record SeriesPoint(String bucket, long orders, BigDecimal revenue, BigDecimal margin) {
    }

    public record Series(String granularity, Period period, Period comparePeriod,
                         List<SeriesPoint> current, List<SeriesPoint> previous) {
    }

    public record TopProduct(UUID id, String sku, String name, String category, Integer stock,
                             long units, BigDecimal revenue, BigDecimal margin) {
    }

    public record TopProducts(String by, Period period, List<TopProduct> rows) {
    }

    public record StockRow(UUID id, String sku, String name, String category, Integer stock,
                           BigDecimal price, BigDecimal costPrice, BigDecimal valueAtPrice, BigDecimal valueAtCost,
                           LocalDateTime lastSoldAt, LocalDateTime createdAt, Integer reorderPoint) {
    }

    public record StoreStock(UUID storeId, String storeName, long skus, long pieces,
                             BigDecimal valueAtPrice, BigDecimal valueAtCost) {
    }

    public record StockReport(
            int deadAfterDays,
            long skusInStock,
            long piecesInStock,
            BigDecimal valueAtPrice,
            BigDecimal valueAtCost,
            long piecesWithoutCost,
            long deadSkus,
            long deadPieces,
            BigDecimal deadValueAtPrice,
            BigDecimal deadValueAtCost,
            List<StockRow> deadStock,
            List<StockRow> lowStock,
            List<StoreStock> stores) {
    }
}
