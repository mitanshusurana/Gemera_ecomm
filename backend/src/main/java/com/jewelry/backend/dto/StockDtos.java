package com.jewelry.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Request and response shapes of /api/v1/admin/stock (per-store stock,
 * transfers, stock takes). A null storeId anywhere means the warehouse, i.e.
 * Product.stock, the quantity the storefront sells from.
 */
public final class StockDtos {

    private StockDtos() {
    }

    public static final String WAREHOUSE_NAME = "Warehouse";

    // ----- Quantities -----

    /** One store's counter for a product. */
    public record StoreQuantity(UUID storeId, String storeName, Integer quantity, LocalDateTime updatedAt) {
    }

    /** GET /stock/products/{productId}: warehouse plus every store, zeros included. */
    public record ProductStockLocations(
            UUID productId, String sku, String name, BigDecimal price,
            Integer warehouseQuantity, List<StoreQuantity> stores, Integer totalQuantity) {
    }

    /** One row of a location listing (GET /stock/warehouse, GET /stock/stores/{storeId}). */
    public record StockRow(
            UUID productId, String sku, String name, String category, BigDecimal price, String image,
            String erpMaterialCode, Integer quantity, BigDecimal value, LocalDateTime updatedAt) {
    }

    /** GET /stock/summary: one entry per location. storeId null = warehouse. */
    public record LocationSummary(UUID storeId, String name, long skus, long pieces, BigDecimal value) {
    }

    public record StockSummary(
            List<LocationSummary> locations, long totalSkus, long totalPieces, BigDecimal totalValue,
            long draftTransfers, long inTransitTransfers, long openTakes) {
    }

    // ----- Transfers -----

    public record TransferLine(
            UUID id, UUID productId, String sku, String name, BigDecimal price,
            Integer quantity, Integer receivedQuantity) {
    }

    public record Transfer(
            UUID id, String transferNumber,
            UUID fromStoreId, String fromStoreName, UUID toStoreId, String toStoreName,
            String status, String note,
            String createdBy, String dispatchedBy, String receivedBy, String cancelledBy,
            LocalDateTime createdAt, LocalDateTime dispatchedAt, LocalDateTime receivedAt, LocalDateTime cancelledAt,
            long lineCount, long totalQuantity, Long totalReceived, List<TransferLine> lines) {
    }

    /** A line names the product by id or SKU (id wins when both are sent). */
    public record CreateTransferLine(UUID productId, String sku, Integer quantity) {
    }

    public record CreateTransferRequest(UUID fromStoreId, UUID toStoreId, String note, List<CreateTransferLine> lines) {
    }

    public record ReceiveLine(UUID lineId, Integer receivedQuantity) {
    }

    /** Lines not listed are received in full. */
    public record ReceiveTransferRequest(List<ReceiveLine> lines) {
    }

    // ----- Stock takes -----

    public record TakeLine(
            UUID id, UUID productId, String sku, String name, BigDecimal price, String image,
            Integer expectedQuantity, Integer countedQuantity, Integer variance, BigDecimal varianceValue,
            String note, LocalDateTime lastCountedAt) {
    }

    public record Take(
            UUID id, String takeNumber, UUID storeId, String storeName, String status,
            String startedBy, String closedBy, String note,
            LocalDateTime createdAt, LocalDateTime closedAt,
            long lineCount, long countedLines, long varianceLines, List<TakeLine> lines) {
    }

    public record CreateTakeRequest(UUID storeId, String note) {
    }

    /**
     * POST /takes/{id}/count: the product by id or SKU; either an absolute
     * countedQuantity or an increment (default +1 when both are absent).
     */
    public record CountRequest(UUID productId, String sku, Integer countedQuantity, Integer increment, String note) {
    }

    public record CountResult(TakeLine line, boolean lineCreated, long lineCount, long countedLines, long varianceLines) {
    }

    /** GET /takes/{id}/variance: only lines whose count differs from the snapshot. */
    public record VarianceReport(
            UUID takeId, String takeNumber, UUID storeId, String storeName, String status,
            long lineCount, long countedLines, long uncountedLines,
            long surplusPieces, long shortagePieces, BigDecimal netValue, List<TakeLine> lines) {
    }
}
