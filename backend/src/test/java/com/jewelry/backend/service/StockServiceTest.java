package com.jewelry.backend.service;

import com.jewelry.backend.dto.StockDtos.ReceiveLine;
import com.jewelry.backend.dto.StockDtos.ReceiveTransferRequest;
import com.jewelry.backend.dto.StockDtos.Transfer;
import com.jewelry.backend.entity.AuditLog;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.ProductStock;
import com.jewelry.backend.entity.StockTransfer;
import com.jewelry.backend.entity.StockTransferLine;
import com.jewelry.backend.entity.Store;
import com.jewelry.backend.repository.AuditLogRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.repository.ProductStockRepository;
import com.jewelry.backend.repository.StockTransferRepository;
import com.jewelry.backend.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Quantity rules of dispatch / receive with every repository mocked. A null
 * store is the warehouse (Product.stock); a store has a ProductStock row.
 */
class StockServiceTest {

    private StockService service;
    private ProductRepository productRepository;
    private ProductStockRepository productStockRepository;
    private StoreRepository storeRepository;
    private StockTransferRepository transferRepository;
    private AuditLogRepository auditLogRepository;

    private Store jaipur;
    private Store mumbai;

    @BeforeEach
    void setUp() {
        productRepository = mock(ProductRepository.class);
        productStockRepository = mock(ProductStockRepository.class);
        storeRepository = mock(StoreRepository.class);
        transferRepository = mock(StockTransferRepository.class);
        auditLogRepository = mock(AuditLogRepository.class);
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> inv.getArgument(0));
        when(productStockRepository.save(any(ProductStock.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transferRepository.save(any(StockTransfer.class))).thenAnswer(inv -> inv.getArgument(0));
        when(productStockRepository.lockByProductAndStore(any(), any())).thenReturn(Optional.empty());

        service = new StockService();
        service.productRepository = productRepository;
        service.productStockRepository = productStockRepository;
        service.storeRepository = storeRepository;
        service.transferRepository = transferRepository;
        service.auditLogRepository = auditLogRepository;

        jaipur = store("Jaipur");
        mumbai = store("Mumbai");
    }

    private Store store(String name) {
        Store s = new Store();
        s.setId(UUID.randomUUID());
        s.setName(name);
        when(storeRepository.findById(s.getId())).thenReturn(Optional.of(s));
        return s;
    }

    private Product product(String sku, Integer warehouseStock) {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setSku(sku);
        p.setName("Piece " + sku);
        p.setPrice(new BigDecimal("1000"));
        p.setStock(warehouseStock);
        when(productRepository.findById(p.getId())).thenReturn(Optional.of(p));
        when(productRepository.findByIdWithPessimisticWrite(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private ProductStock storeStock(Product product, Store store, int quantity) {
        ProductStock ps = new ProductStock();
        ps.setId(UUID.randomUUID());
        ps.setProduct(product);
        ps.setStore(store);
        ps.setQuantity(quantity);
        when(productStockRepository.lockByProductAndStore(product.getId(), store.getId())).thenReturn(Optional.of(ps));
        return ps;
    }

    private StockTransfer transfer(Store from, Store to, String status) {
        StockTransfer t = new StockTransfer();
        t.setId(UUID.randomUUID());
        t.setTransferNumber("ST-2026-00001");
        t.setFromStore(from);
        t.setToStore(to);
        t.setStatus(status);
        t.setLines(new ArrayList<>());
        when(transferRepository.findDetailById(t.getId())).thenReturn(Optional.of(t));
        return t;
    }

    private static StockTransferLine line(StockTransfer t, Product product, int quantity) {
        StockTransferLine l = new StockTransferLine();
        l.setId(UUID.randomUUID());
        l.setTransfer(t);
        l.setProduct(product);
        l.setQuantity(quantity);
        t.getLines().add(l);
        return l;
    }

    // ---- dispatch ------------------------------------------------------------

    @Test
    void dispatchFromTheWarehouseDebitsProductStockAndMovesToInTransit() {
        Product ring = product("JW-1", 5);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(t, ring, 3);

        Transfer dto = service.dispatchTransfer(t.getId(), "ops@test.local");

        assertThat(ring.getStock()).isEqualTo(2);
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_IN_TRANSIT);
        assertThat(t.getDispatchedBy()).isEqualTo("ops@test.local");
        assertThat(t.getDispatchedAt()).isNotNull();
        assertThat(dto.status()).isEqualTo(StockTransfer.STATUS_IN_TRANSIT);
        assertThat(dto.totalQuantity()).isEqualTo(3);
        assertThat(dto.totalReceived()).isNull();
        assertThat(dto.fromStoreName()).isEqualTo("Warehouse");
        assertThat(dto.toStoreName()).isEqualTo("Jaipur");
        verify(productRepository).save(ring);

        ArgumentCaptor<AuditLog> audit = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(audit.capture());
        assertThat(audit.getValue().getEventType()).isEqualTo("STOCK_TRANSFER_DISPATCH");
        assertThat(audit.getValue().getUserEmail()).isEqualTo("ops@test.local");
    }

    @Test
    void dispatchFromAStoreDebitsItsCounterRow() {
        Product ring = product("JW-1", 0);
        ProductStock counter = storeStock(ring, jaipur, 4);
        StockTransfer t = transfer(jaipur, mumbai, StockTransfer.STATUS_DRAFT);
        line(t, ring, 4);

        service.dispatchTransfer(t.getId(), "ops");

        assertThat(counter.getQuantity()).isZero();
        assertThat(ring.getStock()).as("warehouse untouched").isZero();
        verify(productStockRepository).save(counter);
    }

    @Test
    void dispatchRefusesWhenTheWarehouseIsShort() {
        Product ring = product("JW-1", 2);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(t, ring, 3);

        assertThatThrownBy(() -> service.dispatchTransfer(t.getId(), "ops"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Insufficient warehouse stock for JW-1: 2 available, 3 needed.");

        assertThat(ring.getStock()).isEqualTo(2);
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_DRAFT);
        verify(transferRepository, never()).save(any());
    }

    @Test
    void dispatchRefusesWhenTheStoreIsShortOrHasNoRow() {
        Product ring = product("JW-1", 10);
        storeStock(ring, jaipur, 1);
        StockTransfer t = transfer(jaipur, mumbai, StockTransfer.STATUS_DRAFT);
        line(t, ring, 2);

        assertThatThrownBy(() -> service.dispatchTransfer(t.getId(), "ops"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Insufficient stock for JW-1 at Jaipur: 1 available, 2 needed.");

        Product chain = product("JW-2", 10);
        StockTransfer u = transfer(mumbai, jaipur, StockTransfer.STATUS_DRAFT);
        line(u, chain, 1);
        assertThatThrownBy(() -> service.dispatchTransfer(u.getId(), "ops"))
                .hasMessage("Insufficient stock for JW-2 at Mumbai: 0 available, 1 needed.");
    }

    @Test
    void nullWarehouseStockCountsAsZero() {
        Product ring = product("JW-1", null);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(t, ring, 1);
        assertThatThrownBy(() -> service.dispatchTransfer(t.getId(), "ops"))
                .hasMessage("Insufficient warehouse stock for JW-1: 0 available, 1 needed.");
    }

    @Test
    void onlyADraftWithLinesCanBeDispatched() {
        StockTransfer inTransit = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        line(inTransit, product("JW-1", 5), 1);
        assertThatThrownBy(() -> service.dispatchTransfer(inTransit.getId(), "ops"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("only a DRAFT transfer can be dispatched");

        StockTransfer empty = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        assertThatThrownBy(() -> service.dispatchTransfer(empty.getId(), "ops"))
                .hasMessage("The transfer has no lines.");
    }

    @Test
    void aShortLineRollsBackNothingBeforeItButTheCallerTransactionDoes() {
        // Lines are locked in product-id order; the first debit happens in
        // memory before the second fails. The @Transactional boundary undoes
        // it in production; here we only assert the failure surfaces.
        Product a = product("JW-A", 5);
        Product b = product("JW-B", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(t, a, 1);
        line(t, b, 1);
        assertThatThrownBy(() -> service.dispatchTransfer(t.getId(), "ops"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("JW-B");
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_DRAFT);
    }

    // ---- receive ---------------------------------------------------------------

    @Test
    void receiveCreditsTheDestinationWithTheFullQuantityByDefault() {
        Product ring = product("JW-1", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        StockTransferLine l = line(t, ring, 3);

        Transfer dto = service.receiveTransfer(t.getId(), null, "shop@test.local");

        assertThat(l.getReceivedQuantity()).isEqualTo(3);
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_RECEIVED);
        assertThat(t.getReceivedBy()).isEqualTo("shop@test.local");
        assertThat(dto.totalReceived()).isEqualTo(3);
        assertThat(dto.lines().get(0).receivedQuantity()).isEqualTo(3);

        // No counter row existed at Jaipur: one is created with the received quantity.
        ArgumentCaptor<ProductStock> saved = ArgumentCaptor.forClass(ProductStock.class);
        verify(productStockRepository).save(saved.capture());
        assertThat(saved.getValue().getQuantity()).isEqualTo(3);
        assertThat(ring.getStock()).as("warehouse untouched").isZero();
    }

    @Test
    void receiveAddsToAnExistingCounterRow() {
        Product ring = product("JW-1", 0);
        ProductStock counter = storeStock(ring, jaipur, 7);
        StockTransfer t = transfer(mumbai, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        line(t, ring, 2);

        service.receiveTransfer(t.getId(), new ReceiveTransferRequest(List.of()), "shop");
        assertThat(counter.getQuantity()).isEqualTo(9);
    }

    @Test
    void receiveIntoTheWarehouseCreditsProductStock() {
        Product ring = product("JW-1", 1);
        StockTransfer t = transfer(jaipur, null, StockTransfer.STATUS_IN_TRANSIT);
        line(t, ring, 4);
        service.receiveTransfer(t.getId(), null, "shop");
        assertThat(ring.getStock()).isEqualTo(5);
    }

    @Test
    void partialReceiptCreditsOnlyWhatArrivedAndRecordsTheShortfall() {
        Product ring = product("JW-1", 0);
        Product chain = product("JW-2", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        StockTransferLine ringLine = line(t, ring, 3);
        StockTransferLine chainLine = line(t, chain, 2);

        Transfer dto = service.receiveTransfer(t.getId(),
                new ReceiveTransferRequest(List.of(new ReceiveLine(ringLine.getId(), 1))), "shop");

        assertThat(ringLine.getReceivedQuantity()).isEqualTo(1);
        assertThat(chainLine.getReceivedQuantity()).as("unlisted lines arrive in full").isEqualTo(2);
        assertThat(dto.totalReceived()).isEqualTo(3);
        assertThat(dto.totalQuantity()).isEqualTo(5);

        ArgumentCaptor<AuditLog> audit = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(audit.capture());
        assertThat(audit.getValue().getDetails()).contains("short: JW-1 1/3");
    }

    @Test
    void zeroReceivedIsAllowedAndCreditsNothing() {
        Product ring = product("JW-1", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        StockTransferLine l = line(t, ring, 3);

        service.receiveTransfer(t.getId(), new ReceiveTransferRequest(List.of(new ReceiveLine(l.getId(), 0))), "shop");

        assertThat(l.getReceivedQuantity()).isZero();
        verify(productStockRepository, never()).save(any());
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_RECEIVED);
    }

    @Test
    void nullReceivedQuantityMeansTheFullLine() {
        Product ring = product("JW-1", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        StockTransferLine l = line(t, ring, 3);
        service.receiveTransfer(t.getId(), new ReceiveTransferRequest(List.of(new ReceiveLine(l.getId(), null))), "shop");
        assertThat(l.getReceivedQuantity()).isEqualTo(3);
    }

    @Test
    void receivedQuantityMustBeBetweenZeroAndTheDispatchedQuantity() {
        Product ring = product("JW-1", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        StockTransferLine l = line(t, ring, 3);

        assertThatThrownBy(() -> service.receiveTransfer(t.getId(),
                new ReceiveTransferRequest(List.of(new ReceiveLine(l.getId(), 4))), "shop"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Received quantity for JW-1 must be between 0 and 3.");
        assertThatThrownBy(() -> service.receiveTransfer(t.getId(),
                new ReceiveTransferRequest(List.of(new ReceiveLine(l.getId(), -1))), "shop"))
                .isInstanceOf(IllegalArgumentException.class);

        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_IN_TRANSIT);
        verify(productStockRepository, never()).save(any());
    }

    @Test
    void receiveRejectsForeignLinesAndMissingLineIds() {
        Product ring = product("JW-1", 0);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        line(t, ring, 3);

        UUID foreign = UUID.randomUUID();
        assertThatThrownBy(() -> service.receiveTransfer(t.getId(),
                new ReceiveTransferRequest(List.of(new ReceiveLine(foreign, 1))), "shop"))
                .hasMessage("Line " + foreign + " does not belong to ST-2026-00001");
        assertThatThrownBy(() -> service.receiveTransfer(t.getId(),
                new ReceiveTransferRequest(List.of(new ReceiveLine(null, 1))), "shop"))
                .hasMessage("Each received line needs its lineId.");
    }

    @Test
    void onlyAnInTransitTransferCanBeReceived() {
        StockTransfer draft = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(draft, product("JW-1", 5), 1);
        assertThatThrownBy(() -> service.receiveTransfer(draft.getId(), null, "shop"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("only an IN_TRANSIT transfer can be received");

        StockTransfer received = transfer(null, jaipur, StockTransfer.STATUS_RECEIVED);
        assertThatThrownBy(() -> service.receiveTransfer(received.getId(), null, "shop"))
                .hasMessageContaining("is RECEIVED");
    }

    // ---- cancel ------------------------------------------------------------------

    @Test
    void cancellingAnInTransitTransferReturnsThePiecesToTheSource() {
        Product ring = product("JW-1", 2);
        StockTransfer t = transfer(null, jaipur, StockTransfer.STATUS_IN_TRANSIT);
        line(t, ring, 3);

        service.cancelTransfer(t.getId(), "ops");

        assertThat(ring.getStock()).isEqualTo(5);
        assertThat(t.getStatus()).isEqualTo(StockTransfer.STATUS_CANCELLED);
        assertThat(t.getCancelledBy()).isEqualTo("ops");
    }

    @Test
    void cancellingADraftMovesNothingAndAReceivedTransferCannotBeCancelled() {
        Product ring = product("JW-1", 2);
        StockTransfer draft = transfer(null, jaipur, StockTransfer.STATUS_DRAFT);
        line(draft, ring, 3);
        service.cancelTransfer(draft.getId(), "ops");
        assertThat(ring.getStock()).isEqualTo(2);
        assertThat(draft.getStatus()).isEqualTo(StockTransfer.STATUS_CANCELLED);

        StockTransfer received = transfer(null, jaipur, StockTransfer.STATUS_RECEIVED);
        assertThatThrownBy(() -> service.cancelTransfer(received.getId(), "ops"))
                .hasMessage("ST-2026-00001 is RECEIVED and cannot be cancelled.");
    }
}
