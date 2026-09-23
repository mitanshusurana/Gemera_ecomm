package com.jewelry.backend.service;

import com.jewelry.backend.dto.StockDtos;
import com.jewelry.backend.dto.StockDtos.CountRequest;
import com.jewelry.backend.dto.StockDtos.CountResult;
import com.jewelry.backend.dto.StockDtos.CreateTakeRequest;
import com.jewelry.backend.dto.StockDtos.CreateTransferLine;
import com.jewelry.backend.dto.StockDtos.CreateTransferRequest;
import com.jewelry.backend.dto.StockDtos.LocationSummary;
import com.jewelry.backend.dto.StockDtos.ProductStockLocations;
import com.jewelry.backend.dto.StockDtos.ReceiveLine;
import com.jewelry.backend.dto.StockDtos.ReceiveTransferRequest;
import com.jewelry.backend.dto.StockDtos.StockRow;
import com.jewelry.backend.dto.StockDtos.StockSummary;
import com.jewelry.backend.dto.StockDtos.StoreQuantity;
import com.jewelry.backend.dto.StockDtos.Take;
import com.jewelry.backend.dto.StockDtos.TakeLine;
import com.jewelry.backend.dto.StockDtos.Transfer;
import com.jewelry.backend.dto.StockDtos.TransferLine;
import com.jewelry.backend.dto.StockDtos.VarianceReport;
import com.jewelry.backend.entity.AuditLog;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.ProductStock;
import com.jewelry.backend.entity.StockSequence;
import com.jewelry.backend.entity.StockTake;
import com.jewelry.backend.entity.StockTakeLine;
import com.jewelry.backend.entity.StockTransfer;
import com.jewelry.backend.entity.StockTransferLine;
import com.jewelry.backend.entity.Store;
import com.jewelry.backend.repository.AuditLogRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.ProductStockRepository;
import com.jewelry.backend.repository.StockSequenceRepository;
import com.jewelry.backend.repository.StockTakeLineRepository;
import com.jewelry.backend.repository.StockTakeRepository;
import com.jewelry.backend.repository.StockTransferLineRepository;
import com.jewelry.backend.repository.StockTransferRepository;
import com.jewelry.backend.repository.StoreRepository;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Per-store stock, transfers and stock takes (docs/BUSINESS_GAPS.md, "Per-store
 * stock, transfers, stock take with the scanner").
 *
 * The warehouse is Product.stock: the one sellable quantity that OrderService
 * decrements and restores. Store counters are ProductStock rows. Every
 * quantity change here happens under the same pessimistic row lock
 * OrderService uses (ProductRepository.findByIdWithPessimisticWrite, or the
 * ProductStock equivalent), so a dispatch racing a web order cannot oversell.
 */
@Service
public class StockService {

    private static final Logger log = LoggerFactory.getLogger(StockService.class);

    @Autowired
    ProductRepository productRepository;
    @Autowired
    ProductStockRepository productStockRepository;
    @Autowired
    StoreRepository storeRepository;
    @Autowired
    StockTransferRepository transferRepository;
    @Autowired
    StockTransferLineRepository transferLineRepository;
    @Autowired
    StockTakeRepository takeRepository;
    @Autowired
    StockTakeLineRepository takeLineRepository;
    @Autowired
    StockSequenceRepository sequenceRepository;
    @Autowired
    AuditLogRepository auditLogRepository;
    @Autowired(required = false)
    CacheManager cacheManager;

    // =====================================================================
    // Quantities and listings
    // =====================================================================

    @Transactional(readOnly = true)
    public ProductStockLocations productStock(UUID productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new EntityNotFoundException("Product not found: " + productId));
        Map<UUID, ProductStock> byStore = new HashMap<>();
        for (ProductStock ps : productStockRepository.findByProductIdWithStore(productId)) {
            byStore.put(ps.getStore().getId(), ps);
        }
        List<StoreQuantity> stores = new ArrayList<>();
        int total = product.getStock() == null ? 0 : product.getStock();
        for (Store store : sortedStores()) {
            ProductStock ps = byStore.get(store.getId());
            int qty = ps == null || ps.getQuantity() == null ? 0 : ps.getQuantity();
            total += qty;
            stores.add(new StoreQuantity(store.getId(), store.getName(), qty, ps == null ? null : ps.getUpdatedAt()));
        }
        return new ProductStockLocations(product.getId(), product.getSku(), product.getName(), product.getPrice(),
                product.getStock(), stores, total);
    }

    @Transactional(readOnly = true)
    public Page<StockRow> warehouseRows(String search, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size));
        return productRepository.searchWarehouseStock(search == null ? "" : search.trim(), pageable)
                .map(p -> row(p, p.getStock(), p.getUpdatedAt()));
    }

    @Transactional(readOnly = true)
    public Page<StockRow> storeRows(UUID storeId, String search, int page, int size) {
        requireStore(storeId);
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size));
        return productStockRepository.searchByStore(storeId, search == null ? "" : search.trim(), pageable)
                .map(ps -> row(ps.getProduct(), ps.getQuantity(), ps.getUpdatedAt()));
    }

    @Transactional(readOnly = true)
    public StockSummary summary() {
        List<LocationSummary> locations = new ArrayList<>();
        long skus = 0;
        long pieces = 0;
        BigDecimal value = BigDecimal.ZERO;

        List<Object[]> warehouse = productRepository.summarizeWarehouseStock();
        Object[] w = warehouse.isEmpty() ? new Object[]{0L, 0L, BigDecimal.ZERO} : warehouse.get(0);
        LocationSummary wh = new LocationSummary(null, StockDtos.WAREHOUSE_NAME, asLong(w[0]), asLong(w[1]), asMoney(w[2]));
        locations.add(wh);
        skus += wh.skus();
        pieces += wh.pieces();
        value = value.add(wh.value());

        Map<UUID, Object[]> perStore = new HashMap<>();
        for (Object[] r : productStockRepository.summarizeByStore()) {
            perStore.put((UUID) r[0], r);
        }
        for (Store store : sortedStores()) {
            Object[] r = perStore.get(store.getId());
            LocationSummary ls = r == null
                    ? new LocationSummary(store.getId(), store.getName(), 0, 0, BigDecimal.ZERO)
                    : new LocationSummary(store.getId(), store.getName(), asLong(r[1]), asLong(r[2]), asMoney(r[3]));
            locations.add(ls);
            skus += ls.skus();
            pieces += ls.pieces();
            value = value.add(ls.value());
        }
        return new StockSummary(locations, skus, pieces, value,
                transferRepository.countByStatus(StockTransfer.STATUS_DRAFT),
                transferRepository.countByStatus(StockTransfer.STATUS_IN_TRANSIT),
                takeRepository.countByStatus(StockTake.STATUS_OPEN));
    }

    // =====================================================================
    // Transfers
    // =====================================================================

    @Transactional(readOnly = true)
    public Page<Transfer> listTransfers(String status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size));
        Page<StockTransfer> found = transferRepository.search(status == null ? "" : status.trim().toUpperCase(), pageable);
        Map<UUID, Object[]> totals = new HashMap<>();
        List<UUID> ids = found.getContent().stream().map(StockTransfer::getId).toList();
        if (!ids.isEmpty()) {
            for (Object[] r : transferLineRepository.summarizeByTransfer(ids)) {
                totals.put((UUID) r[0], r);
            }
        }
        return found.map(t -> {
            Object[] r = totals.get(t.getId());
            long lineCount = r == null ? 0 : asLong(r[1]);
            long qty = r == null ? 0 : asLong(r[2]);
            Long received = r == null || r[3] == null ? null : asLong(r[3]);
            return toTransferDto(t, lineCount, qty, received, null);
        });
    }

    @Transactional(readOnly = true)
    public Transfer getTransfer(UUID id) {
        return toTransferDto(requireTransfer(id));
    }

    @Transactional(rollbackFor = Exception.class)
    public Transfer createTransfer(CreateTransferRequest request, String actor) {
        if (request == null) {
            throw new IllegalArgumentException("A transfer body is required.");
        }
        if (Objects.equals(request.fromStoreId(), request.toStoreId())) {
            throw new IllegalArgumentException("Choose two different locations: the source and destination are the same.");
        }
        Store from = request.fromStoreId() == null ? null : requireStore(request.fromStoreId());
        Store to = request.toStoreId() == null ? null : requireStore(request.toStoreId());
        if (request.lines() == null || request.lines().isEmpty()) {
            throw new IllegalArgumentException("Add at least one product line.");
        }

        // Merge duplicate products so one line per product is dispatched.
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        Map<UUID, Product> products = new HashMap<>();
        for (CreateTransferLine line : request.lines()) {
            if (line == null || line.quantity() == null || line.quantity() < 1) {
                throw new IllegalArgumentException("Every line needs a quantity of at least 1.");
            }
            Product product = resolveProduct(line.productId(), line.sku());
            products.put(product.getId(), product);
            quantities.merge(product.getId(), line.quantity(), Integer::sum);
        }

        StockTransfer transfer = new StockTransfer();
        transfer.setTransferNumber(allocateNumber("ST"));
        transfer.setFromStore(from);
        transfer.setToStore(to);
        transfer.setStatus(StockTransfer.STATUS_DRAFT);
        transfer.setNote(blankToNull(request.note()));
        transfer.setCreatedBy(actor);
        for (Map.Entry<UUID, Integer> e : quantities.entrySet()) {
            StockTransferLine line = new StockTransferLine();
            line.setTransfer(transfer);
            line.setProduct(products.get(e.getKey()));
            line.setQuantity(e.getValue());
            transfer.getLines().add(line);
        }
        StockTransfer saved = transferRepository.save(transfer);
        audit("STOCK_TRANSFER_CREATE", actor, saved.getTransferNumber() + ": " + locationName(from) + " -> "
                + locationName(to) + ", " + saved.getLines().size() + " line(s), "
                + quantities.values().stream().mapToInt(Integer::intValue).sum() + " piece(s)");
        return toTransferDto(requireTransfer(saved.getId()));
    }

    /** DRAFT -> IN_TRANSIT: pieces leave the source now. Refuses when any line lacks stock. */
    @Transactional(rollbackFor = Exception.class)
    public Transfer dispatchTransfer(UUID id, String actor) {
        StockTransfer transfer = requireTransfer(id);
        if (!StockTransfer.STATUS_DRAFT.equals(transfer.getStatus())) {
            throw new IllegalArgumentException(transfer.getTransferNumber() + " is " + transfer.getStatus()
                    + "; only a DRAFT transfer can be dispatched.");
        }
        if (transfer.getLines().isEmpty()) {
            throw new IllegalArgumentException("The transfer has no lines.");
        }
        UUID fromId = transfer.getFromStore() == null ? null : transfer.getFromStore().getId();
        for (StockTransferLine line : sortedForLocking(transfer.getLines())) {
            adjust(line.getProduct().getId(), fromId, -line.getQuantity(), true);
        }
        transfer.setStatus(StockTransfer.STATUS_IN_TRANSIT);
        transfer.setDispatchedAt(LocalDateTime.now());
        transfer.setDispatchedBy(actor);
        transferRepository.save(transfer);
        audit("STOCK_TRANSFER_DISPATCH", actor, transfer.getTransferNumber() + " dispatched from "
                + locationName(transfer.getFromStore()) + " to " + locationName(transfer.getToStore())
                + ": " + describeLines(transfer.getLines()));
        return toTransferDto(transfer);
    }

    /** IN_TRANSIT -> RECEIVED: the destination is credited with what actually arrived. */
    @Transactional(rollbackFor = Exception.class)
    public Transfer receiveTransfer(UUID id, ReceiveTransferRequest request, String actor) {
        StockTransfer transfer = requireTransfer(id);
        if (!StockTransfer.STATUS_IN_TRANSIT.equals(transfer.getStatus())) {
            throw new IllegalArgumentException(transfer.getTransferNumber() + " is " + transfer.getStatus()
                    + "; only an IN_TRANSIT transfer can be received.");
        }
        Map<UUID, Integer> received = new HashMap<>();
        if (request != null && request.lines() != null) {
            for (ReceiveLine rl : request.lines()) {
                if (rl == null || rl.lineId() == null) {
                    throw new IllegalArgumentException("Each received line needs its lineId.");
                }
                received.put(rl.lineId(), rl.receivedQuantity());
            }
        }
        for (UUID lineId : received.keySet()) {
            if (transfer.getLines().stream().noneMatch(l -> l.getId().equals(lineId))) {
                throw new IllegalArgumentException("Line " + lineId + " does not belong to " + transfer.getTransferNumber());
            }
        }
        UUID toId = transfer.getToStore() == null ? null : transfer.getToStore().getId();
        List<String> shortfalls = new ArrayList<>();
        for (StockTransferLine line : sortedForLocking(transfer.getLines())) {
            Integer qty = received.containsKey(line.getId()) ? received.get(line.getId()) : line.getQuantity();
            if (qty == null) {
                qty = line.getQuantity();
            }
            if (qty < 0 || qty > line.getQuantity()) {
                throw new IllegalArgumentException("Received quantity for " + line.getProduct().getSku()
                        + " must be between 0 and " + line.getQuantity() + ".");
            }
            line.setReceivedQuantity(qty);
            if (qty > 0) {
                adjust(line.getProduct().getId(), toId, qty, false);
            }
            if (qty < line.getQuantity()) {
                shortfalls.add(line.getProduct().getSku() + " " + qty + "/" + line.getQuantity());
            }
        }
        transfer.setStatus(StockTransfer.STATUS_RECEIVED);
        transfer.setReceivedAt(LocalDateTime.now());
        transfer.setReceivedBy(actor);
        transferRepository.save(transfer);
        audit("STOCK_TRANSFER_RECEIVE", actor, transfer.getTransferNumber() + " received at "
                + locationName(transfer.getToStore()) + ": " + describeLines(transfer.getLines())
                + (shortfalls.isEmpty() ? "" : "; short: " + String.join(", ", shortfalls)));
        return toTransferDto(transfer);
    }

    /** DRAFT or IN_TRANSIT -> CANCELLED; an IN_TRANSIT cancel puts the pieces back at the source. */
    @Transactional(rollbackFor = Exception.class)
    public Transfer cancelTransfer(UUID id, String actor) {
        StockTransfer transfer = requireTransfer(id);
        String status = transfer.getStatus();
        if (StockTransfer.STATUS_IN_TRANSIT.equals(status)) {
            UUID fromId = transfer.getFromStore() == null ? null : transfer.getFromStore().getId();
            for (StockTransferLine line : sortedForLocking(transfer.getLines())) {
                adjust(line.getProduct().getId(), fromId, line.getQuantity(), false);
            }
        } else if (!StockTransfer.STATUS_DRAFT.equals(status)) {
            throw new IllegalArgumentException(transfer.getTransferNumber() + " is " + status + " and cannot be cancelled.");
        }
        transfer.setStatus(StockTransfer.STATUS_CANCELLED);
        transfer.setCancelledAt(LocalDateTime.now());
        transfer.setCancelledBy(actor);
        transferRepository.save(transfer);
        audit("STOCK_TRANSFER_CANCEL", actor, transfer.getTransferNumber() + " cancelled"
                + (StockTransfer.STATUS_IN_TRANSIT.equals(status)
                ? ", pieces returned to " + locationName(transfer.getFromStore()) : ""));
        return toTransferDto(transfer);
    }

    // =====================================================================
    // Stock takes
    // =====================================================================

    @Transactional(readOnly = true)
    public Page<Take> listTakes(String status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), clampSize(size));
        Page<StockTake> found = takeRepository.search(status == null ? "" : status.trim().toUpperCase(), pageable);
        Map<UUID, Object[]> totals = new HashMap<>();
        List<UUID> ids = found.getContent().stream().map(StockTake::getId).toList();
        if (!ids.isEmpty()) {
            for (Object[] r : takeLineRepository.summarizeByTake(ids)) {
                totals.put((UUID) r[0], r);
            }
        }
        return found.map(t -> {
            Object[] r = totals.get(t.getId());
            return toTakeDto(t, r == null ? 0 : asLong(r[1]), r == null ? 0 : asLong(r[2]), r == null ? 0 : asLong(r[3]), null);
        });
    }

    @Transactional(readOnly = true)
    public Take getTake(UUID id) {
        return toTakeDto(requireTake(id));
    }

    /** Opens a take and snapshots every product with pieces at the location. */
    @Transactional(rollbackFor = Exception.class)
    public Take openTake(CreateTakeRequest request, String actor) {
        UUID storeId = request == null ? null : request.storeId();
        Store store = storeId == null ? null : requireStore(storeId);
        List<StockTake> open = storeId == null
                ? takeRepository.findByStatusAndStoreIsNull(StockTake.STATUS_OPEN)
                : takeRepository.findByStatusAndStoreId(StockTake.STATUS_OPEN, storeId);
        if (!open.isEmpty()) {
            throw new IllegalArgumentException(open.get(0).getTakeNumber() + " is still open for "
                    + locationName(store) + "; close or cancel it before starting another count there.");
        }

        StockTake take = new StockTake();
        take.setTakeNumber(allocateNumber("SC"));
        take.setStore(store);
        take.setStatus(StockTake.STATUS_OPEN);
        take.setStartedBy(actor);
        take.setNote(request == null ? null : blankToNull(request.note()));

        if (store == null) {
            for (Product p : productRepository.findWithPositiveStock()) {
                take.getLines().add(newTakeLine(take, p, p.getStock()));
            }
        } else {
            for (ProductStock ps : productStockRepository.findPositiveByStore(storeId)) {
                take.getLines().add(newTakeLine(take, ps.getProduct(), ps.getQuantity()));
            }
        }
        StockTake saved = takeRepository.save(take);
        audit("STOCK_TAKE_OPEN", actor, saved.getTakeNumber() + " opened at " + locationName(store)
                + " with " + saved.getLines().size() + " line(s)");
        return toTakeDto(requireTake(saved.getId()));
    }

    /**
     * Scan-to-count. An absolute countedQuantity replaces the count; otherwise
     * the increment (default +1) is added. A product outside the snapshot gets
     * a line with expected 0.
     */
    @Transactional(rollbackFor = Exception.class)
    public CountResult count(UUID takeId, CountRequest request) {
        StockTake take = takeRepository.findById(takeId)
                .orElseThrow(() -> new EntityNotFoundException("Stock take not found: " + takeId));
        if (!StockTake.STATUS_OPEN.equals(take.getStatus())) {
            throw new IllegalArgumentException(take.getTakeNumber() + " is " + take.getStatus() + "; counting is closed.");
        }
        if (request == null) {
            throw new IllegalArgumentException("Send the product (sku or productId) to count.");
        }
        Product product = resolveProduct(request.productId(), request.sku());
        boolean created = false;
        StockTakeLine line = takeLineRepository.findByStockTakeIdAndProductId(takeId, product.getId()).orElse(null);
        if (line == null) {
            line = newTakeLine(take, product, 0);
            created = true;
        }
        int counted;
        if (request.countedQuantity() != null) {
            if (request.countedQuantity() < 0) {
                throw new IllegalArgumentException("A count cannot be negative.");
            }
            counted = request.countedQuantity();
        } else {
            int current = line.getCountedQuantity() == null ? 0 : line.getCountedQuantity();
            int step = request.increment() == null ? 1 : request.increment();
            counted = Math.max(0, current + step);
        }
        line.setCountedQuantity(counted);
        line.setVariance(counted - (line.getExpectedQuantity() == null ? 0 : line.getExpectedQuantity()));
        line.setLastCountedAt(LocalDateTime.now());
        if (request.note() != null) {
            line.setNote(blankToNull(request.note()));
        }
        StockTakeLine saved = takeLineRepository.save(line);

        List<Object[]> totals = takeLineRepository.summarizeByTake(List.of(takeId));
        Object[] r = totals.isEmpty() ? new Object[]{takeId, 0L, 0L, 0L} : totals.get(0);
        return new CountResult(toTakeLineDto(saved), created, asLong(r[1]), asLong(r[2]), asLong(r[3]));
    }

    @Transactional(readOnly = true)
    public VarianceReport variance(UUID takeId) {
        StockTake take = requireTake(takeId);
        List<TakeLine> lines = new ArrayList<>();
        long counted = 0;
        long surplus = 0;
        long shortage = 0;
        BigDecimal net = BigDecimal.ZERO;
        for (StockTakeLine l : take.getLines()) {
            if (l.getCountedQuantity() == null) {
                continue;
            }
            counted++;
            int v = l.getVariance() == null ? 0 : l.getVariance();
            if (v == 0) {
                continue;
            }
            TakeLine dto = toTakeLineDto(l);
            lines.add(dto);
            if (v > 0) {
                surplus += v;
            } else {
                shortage += -v;
            }
            if (dto.varianceValue() != null) {
                net = net.add(dto.varianceValue());
            }
        }
        lines.sort(Comparator.comparing((TakeLine t) -> t.variance() == null ? 0 : Math.abs(t.variance())).reversed());
        UUID storeId = take.getStore() == null ? null : take.getStore().getId();
        return new VarianceReport(take.getId(), take.getTakeNumber(), storeId, locationName(take.getStore()),
                take.getStatus(), take.getLines().size(), counted, take.getLines().size() - counted,
                surplus, shortage, net, lines);
    }

    /**
     * Applies every counted line's variance to the live quantity (never below
     * zero) and writes one AuditLog row per adjusted line under the caller's
     * email. Uncounted lines are left untouched.
     */
    @Transactional(rollbackFor = Exception.class)
    public Take closeTake(UUID takeId, String actor) {
        StockTake take = requireTake(takeId);
        if (!StockTake.STATUS_OPEN.equals(take.getStatus())) {
            throw new IllegalArgumentException(take.getTakeNumber() + " is " + take.getStatus() + " and cannot be closed.");
        }
        UUID storeId = take.getStore() == null ? null : take.getStore().getId();
        String where = locationName(take.getStore());
        int adjusted = 0;
        List<StockTakeLine> lines = new ArrayList<>(take.getLines());
        lines.sort(Comparator.comparing(l -> l.getProduct().getId()));
        for (StockTakeLine line : lines) {
            if (line.getCountedQuantity() == null) {
                continue;
            }
            int variance = line.getVariance() == null ? 0 : line.getVariance();
            if (variance == 0) {
                continue;
            }
            int[] beforeAfter = adjust(line.getProduct().getId(), storeId, variance, false);
            adjusted++;
            String sign = variance > 0 ? "+" : "";
            audit("STOCK_TAKE_ADJUSTMENT", actor, take.getTakeNumber() + ": " + line.getProduct().getSku()
                    + " at " + where + " expected " + line.getExpectedQuantity() + ", counted " + line.getCountedQuantity()
                    + " (" + sign + variance + "); quantity " + beforeAfter[0] + " -> " + beforeAfter[1]
                    + (line.getNote() == null ? "" : "; note: " + line.getNote()));
        }
        take.setStatus(StockTake.STATUS_CLOSED);
        take.setClosedAt(LocalDateTime.now());
        take.setClosedBy(actor);
        takeRepository.save(take);
        audit("STOCK_TAKE_CLOSE", actor, take.getTakeNumber() + " closed at " + where + ": " + adjusted
                + " adjustment(s) across " + take.getLines().size() + " line(s)");
        return toTakeDto(take);
    }

    @Transactional(rollbackFor = Exception.class)
    public Take cancelTake(UUID takeId, String actor) {
        StockTake take = requireTake(takeId);
        if (!StockTake.STATUS_OPEN.equals(take.getStatus())) {
            throw new IllegalArgumentException(take.getTakeNumber() + " is " + take.getStatus() + " and cannot be cancelled.");
        }
        take.setStatus(StockTake.STATUS_CANCELLED);
        take.setClosedAt(LocalDateTime.now());
        take.setClosedBy(actor);
        takeRepository.save(take);
        audit("STOCK_TAKE_CANCEL", actor, take.getTakeNumber() + " cancelled at " + locationName(take.getStore())
                + "; no quantities changed");
        return toTakeDto(take);
    }

    // =====================================================================
    // Quantity changes (the only place stock moves)
    // =====================================================================

    /**
     * Adds delta to the product's quantity at the location, under a row lock.
     * With refuseInsufficient the call fails instead of going negative;
     * otherwise the result is floored at zero. Returns {before, after}.
     */
    private int[] adjust(UUID productId, UUID storeId, int delta, boolean refuseInsufficient) {
        if (storeId == null) {
            Product product = productRepository.findByIdWithPessimisticWrite(productId)
                    .orElseThrow(() -> new EntityNotFoundException("Product not found: " + productId));
            int before = product.getStock() == null ? 0 : product.getStock();
            int after = before + delta;
            if (after < 0) {
                if (refuseInsufficient) {
                    throw new IllegalArgumentException("Insufficient warehouse stock for " + product.getSku()
                            + ": " + before + " available, " + (-delta) + " needed.");
                }
                after = 0;
            }
            product.setStock(after);
            productRepository.save(product);
            evictProductCache(productId);
            return new int[]{before, after};
        }
        ProductStock ps = productStockRepository.lockByProductAndStore(productId, storeId).orElse(null);
        if (ps == null) {
            ps = new ProductStock();
            ps.setProduct(productRepository.getReferenceById(productId));
            ps.setStore(storeRepository.getReferenceById(storeId));
            ps.setQuantity(0);
        }
        int before = ps.getQuantity() == null ? 0 : ps.getQuantity();
        int after = before + delta;
        if (after < 0) {
            if (refuseInsufficient) {
                String sku = productRepository.findById(productId).map(Product::getSku).orElse(productId.toString());
                throw new IllegalArgumentException("Insufficient stock for " + sku + " at "
                        + storeRepository.findById(storeId).map(Store::getName).orElse("the store")
                        + ": " + before + " available, " + (-delta) + " needed.");
            }
            after = 0;
        }
        ps.setQuantity(after);
        productStockRepository.save(ps);
        return new int[]{before, after};
    }

    /** Lines locked in a fixed product order so two concurrent transfers cannot deadlock. */
    private static List<StockTransferLine> sortedForLocking(Collection<StockTransferLine> lines) {
        List<StockTransferLine> sorted = new ArrayList<>(lines);
        sorted.sort(Comparator.comparing(l -> l.getProduct().getId()));
        return sorted;
    }

    private void evictProductCache(UUID productId) {
        if (cacheManager == null) {
            return;
        }
        Cache cache = cacheManager.getCache("products");
        if (cache != null) {
            cache.evict(productId);
        }
    }

    // =====================================================================
    // Numbering
    // =====================================================================

    /** ST-2026-00001 / SC-2026-00001, consecutive per series and calendar year under a row lock. */
    private String allocateNumber(String series) {
        int year = LocalDate.now().getYear();
        String key = series + "-" + year;
        sequenceRepository.ensureRow(key);
        StockSequence seq = sequenceRepository.lockByKey(key)
                .orElseThrow(() -> new IllegalStateException("Sequence row missing for " + key));
        long next = seq.getLastNumber() + 1;
        seq.setLastNumber(next);
        sequenceRepository.save(seq);
        return key + "-" + String.format("%05d", next);
    }

    // =====================================================================
    // Lookups and mapping
    // =====================================================================

    private Product resolveProduct(UUID productId, String sku) {
        if (productId != null) {
            return productRepository.findById(productId)
                    .orElseThrow(() -> new EntityNotFoundException("Product not found: " + productId));
        }
        if (sku == null || sku.trim().isEmpty()) {
            throw new IllegalArgumentException("Each line needs a productId or a sku.");
        }
        return productRepository.findFirstBySkuIgnoreCase(sku.trim())
                .orElseThrow(() -> new EntityNotFoundException("No product with SKU " + sku.trim()));
    }

    private Store requireStore(UUID storeId) {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> new EntityNotFoundException("Store not found: " + storeId));
    }

    private StockTransfer requireTransfer(UUID id) {
        return transferRepository.findDetailById(id)
                .orElseThrow(() -> new EntityNotFoundException("Stock transfer not found: " + id));
    }

    private StockTake requireTake(UUID id) {
        return takeRepository.findDetailById(id)
                .orElseThrow(() -> new EntityNotFoundException("Stock take not found: " + id));
    }

    private List<Store> sortedStores() {
        List<Store> stores = new ArrayList<>(storeRepository.findAll());
        stores.sort(Comparator.comparing(s -> s.getName() == null ? "" : s.getName(), String.CASE_INSENSITIVE_ORDER));
        return stores;
    }

    private static StockTakeLine newTakeLine(StockTake take, Product product, Integer expected) {
        StockTakeLine line = new StockTakeLine();
        line.setStockTake(take);
        line.setProduct(product);
        line.setExpectedQuantity(expected == null ? 0 : expected);
        return line;
    }

    private static StockRow row(Product p, Integer quantity, LocalDateTime updatedAt) {
        int qty = quantity == null ? 0 : quantity;
        BigDecimal price = p.getPrice() == null ? BigDecimal.ZERO : p.getPrice();
        String image = p.getImages() == null || p.getImages().isEmpty() ? null : p.getImages().get(0);
        return new StockRow(p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getPrice(), image,
                p.getErpMaterialCode(), quantity, price.multiply(BigDecimal.valueOf(qty)), updatedAt);
    }

    private Transfer toTransferDto(StockTransfer t) {
        long qty = 0;
        long received = 0;
        boolean anyReceived = false;
        List<TransferLine> lines = new ArrayList<>();
        for (StockTransferLine l : t.getLines()) {
            qty += l.getQuantity() == null ? 0 : l.getQuantity();
            if (l.getReceivedQuantity() != null) {
                anyReceived = true;
                received += l.getReceivedQuantity();
            }
            Product p = l.getProduct();
            lines.add(new TransferLine(l.getId(), p.getId(), p.getSku(), p.getName(), p.getPrice(),
                    l.getQuantity(), l.getReceivedQuantity()));
        }
        return toTransferDto(t, lines.size(), qty, anyReceived ? received : null, lines);
    }

    private Transfer toTransferDto(StockTransfer t, long lineCount, long totalQuantity, Long totalReceived,
                                   List<TransferLine> lines) {
        Store from = t.getFromStore();
        Store to = t.getToStore();
        return new Transfer(t.getId(), t.getTransferNumber(),
                from == null ? null : from.getId(), locationName(from),
                to == null ? null : to.getId(), locationName(to),
                t.getStatus(), t.getNote(),
                t.getCreatedBy(), t.getDispatchedBy(), t.getReceivedBy(), t.getCancelledBy(),
                t.getCreatedAt(), t.getDispatchedAt(), t.getReceivedAt(), t.getCancelledAt(),
                lineCount, totalQuantity, totalReceived, lines == null ? List.of() : lines);
    }

    private Take toTakeDto(StockTake t) {
        long counted = 0;
        long withVariance = 0;
        List<TakeLine> lines = new ArrayList<>();
        for (StockTakeLine l : t.getLines()) {
            if (l.getCountedQuantity() != null) {
                counted++;
                if (l.getVariance() != null && l.getVariance() != 0) {
                    withVariance++;
                }
            }
            lines.add(toTakeLineDto(l));
        }
        lines.sort(Comparator.comparing((TakeLine l) -> l.name() == null ? "" : l.name(), String.CASE_INSENSITIVE_ORDER));
        return toTakeDto(t, lines.size(), counted, withVariance, lines);
    }

    private Take toTakeDto(StockTake t, long lineCount, long countedLines, long varianceLines, List<TakeLine> lines) {
        Store store = t.getStore();
        return new Take(t.getId(), t.getTakeNumber(), store == null ? null : store.getId(), locationName(store),
                t.getStatus(), t.getStartedBy(), t.getClosedBy(), t.getNote(), t.getCreatedAt(), t.getClosedAt(),
                lineCount, countedLines, varianceLines, lines == null ? List.of() : lines);
    }

    private static TakeLine toTakeLineDto(StockTakeLine l) {
        Product p = l.getProduct();
        BigDecimal varianceValue = null;
        if (l.getVariance() != null) {
            BigDecimal price = p.getPrice() == null ? BigDecimal.ZERO : p.getPrice();
            varianceValue = price.multiply(BigDecimal.valueOf(l.getVariance()));
        }
        String image = p.getImages() == null || p.getImages().isEmpty() ? null : p.getImages().get(0);
        return new TakeLine(l.getId(), p.getId(), p.getSku(), p.getName(), p.getPrice(), image,
                l.getExpectedQuantity(), l.getCountedQuantity(), l.getVariance(), varianceValue,
                l.getNote(), l.getLastCountedAt());
    }

    private static String describeLines(Collection<StockTransferLine> lines) {
        List<String> parts = new ArrayList<>();
        for (StockTransferLine l : lines) {
            parts.add(l.getProduct().getSku() + " x" + l.getQuantity());
        }
        return String.join(", ", parts);
    }

    static String locationName(Store store) {
        return store == null ? StockDtos.WAREHOUSE_NAME : store.getName();
    }

    private void audit(String eventType, String actor, String details) {
        try {
            AuditLog entry = new AuditLog();
            entry.setEventType(eventType);
            entry.setUserEmail(actor == null || actor.isBlank() ? "unknown" : actor);
            entry.setDetails(details != null && details.length() > 250 ? details.substring(0, 247) + "..." : details);
            auditLogRepository.save(entry);
        } catch (RuntimeException e) {
            // The stock change is the record of truth; a failed audit row must not undo it.
            log.warn("Could not write audit row {}: {}", eventType, e.getMessage());
        }
    }

    private static int clampSize(int size) {
        return Math.max(1, Math.min(size, 500));
    }

    private static long asLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    private static BigDecimal asMoney(Object o) {
        if (o instanceof BigDecimal b) {
            return b;
        }
        return o instanceof Number n ? BigDecimal.valueOf(n.doubleValue()) : BigDecimal.ZERO;
    }

    private static String blankToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }
}
