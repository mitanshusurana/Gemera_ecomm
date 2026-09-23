package com.jewelry.backend.controller;

import com.jewelry.backend.dto.StockDtos.CountRequest;
import com.jewelry.backend.dto.StockDtos.CountResult;
import com.jewelry.backend.dto.StockDtos.CreateTakeRequest;
import com.jewelry.backend.dto.StockDtos.CreateTransferRequest;
import com.jewelry.backend.dto.StockDtos.ProductStockLocations;
import com.jewelry.backend.dto.StockDtos.ReceiveTransferRequest;
import com.jewelry.backend.dto.StockDtos.StockRow;
import com.jewelry.backend.dto.StockDtos.StockSummary;
import com.jewelry.backend.dto.StockDtos.Take;
import com.jewelry.backend.dto.StockDtos.Transfer;
import com.jewelry.backend.dto.StockDtos.VarianceReport;
import com.jewelry.backend.service.StockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.UUID;

/**
 * Per-store stock, transfers and stock takes. The warehouse (Product.stock)
 * is storeId null everywhere; store counters are ProductStock rows.
 */
@RestController
@RequestMapping("/api/v1/admin/stock")
@PreAuthorize("@access.has('stock.read')")
@Tag(name = "Admin Stock", description = "Per-store stock, transfers and scanner stock takes")
public class AdminStockController {

    @Autowired
    StockService stockService;

    // ----- Quantities -----

    @GetMapping("/summary")
    @Operation(summary = "Per location (warehouse + every store): SKUs with pieces, pieces, value at price; plus open document counts")
    public ResponseEntity<StockSummary> summary() {
        return ResponseEntity.ok(stockService.summary());
    }

    @GetMapping("/products/{productId}")
    @Operation(summary = "One product's warehouse quantity and every store counter")
    public ResponseEntity<ProductStockLocations> productStock(@PathVariable UUID productId) {
        return ResponseEntity.ok(stockService.productStock(productId));
    }

    @GetMapping("/warehouse")
    @Operation(summary = "Warehouse (Product.stock) rows, paged, searched by name or SKU")
    public ResponseEntity<Page<StockRow>> warehouseRows(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(stockService.warehouseRows(search, page, size));
    }

    @GetMapping("/stores/{storeId}")
    @Operation(summary = "One store's counter rows, paged, searched by name or SKU")
    public ResponseEntity<Page<StockRow>> storeRows(
            @PathVariable UUID storeId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(stockService.storeRows(storeId, search, page, size));
    }

    // ----- Transfers -----

    @GetMapping("/transfers")
    @Operation(summary = "Transfers newest first; optional status filter (DRAFT, IN_TRANSIT, RECEIVED, CANCELLED)")
    public ResponseEntity<Page<Transfer>> listTransfers(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(stockService.listTransfers(status, page, size));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/transfers")
    @Operation(summary = "Create a DRAFT transfer: {fromStoreId?, toStoreId?, note?, lines:[{productId|sku, quantity}]} (null store = warehouse)")
    public ResponseEntity<Transfer> createTransfer(@RequestBody CreateTransferRequest request, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(stockService.createTransfer(request, actor(principal)));
    }

    @GetMapping("/transfers/{id}")
    public ResponseEntity<Transfer> getTransfer(@PathVariable UUID id) {
        return ResponseEntity.ok(stockService.getTransfer(id));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/transfers/{id}/dispatch")
    @Operation(summary = "DRAFT -> IN_TRANSIT; deducts every line from the source, refusing if any is short")
    public ResponseEntity<Transfer> dispatch(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(stockService.dispatchTransfer(id, actor(principal)));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/transfers/{id}/receive")
    @Operation(summary = "IN_TRANSIT -> RECEIVED; body {lines:[{lineId, receivedQuantity}]}, unlisted lines received in full")
    public ResponseEntity<Transfer> receive(@PathVariable UUID id,
                                            @RequestBody(required = false) ReceiveTransferRequest request,
                                            Principal principal) {
        return ResponseEntity.ok(stockService.receiveTransfer(id, request, actor(principal)));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/transfers/{id}/cancel")
    @Operation(summary = "Cancel a DRAFT or IN_TRANSIT transfer; an IN_TRANSIT cancel returns the pieces to the source")
    public ResponseEntity<Transfer> cancelTransfer(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(stockService.cancelTransfer(id, actor(principal)));
    }

    // ----- Stock takes -----

    @GetMapping("/takes")
    @Operation(summary = "Stock takes newest first; optional status filter (OPEN, CLOSED, CANCELLED)")
    public ResponseEntity<Page<Take>> listTakes(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(stockService.listTakes(status, page, size));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/takes")
    @Operation(summary = "Open a take at {storeId?} (null = warehouse) and snapshot every product with pieces there")
    public ResponseEntity<Take> openTake(@RequestBody(required = false) CreateTakeRequest request, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(stockService.openTake(request, actor(principal)));
    }

    @GetMapping("/takes/{id}")
    public ResponseEntity<Take> getTake(@PathVariable UUID id) {
        return ResponseEntity.ok(stockService.getTake(id));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/takes/{id}/count")
    @Operation(summary = "Scan-to-count: {sku|productId, countedQuantity (absolute) | increment (default +1), note?}")
    public ResponseEntity<CountResult> count(@PathVariable UUID id, @RequestBody CountRequest request) {
        return ResponseEntity.ok(stockService.count(id, request));
    }

    @GetMapping("/takes/{id}/variance")
    @Operation(summary = "Only the counted lines whose count differs from the snapshot, with value at price")
    public ResponseEntity<VarianceReport> variance(@PathVariable UUID id) {
        return ResponseEntity.ok(stockService.variance(id));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/takes/{id}/close")
    @Operation(summary = "Apply every counted variance to the live quantity, one AuditLog row per adjustment, then CLOSED")
    public ResponseEntity<Take> closeTake(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(stockService.closeTake(id, actor(principal)));
    }

    @PreAuthorize("@access.has('stock.write')")
    @PostMapping("/takes/{id}/cancel")
    public ResponseEntity<Take> cancelTake(@PathVariable UUID id, Principal principal) {
        return ResponseEntity.ok(stockService.cancelTake(id, actor(principal)));
    }

    private static String actor(Principal principal) {
        return principal == null ? null : principal.getName();
    }
}
