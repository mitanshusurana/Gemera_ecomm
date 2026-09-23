package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ProductStock;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductStockRepository extends JpaRepository<ProductStock, UUID> {

    /** Row lock for a dispatch / receive / stock-take adjustment on one store counter. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT ps FROM ProductStock ps WHERE ps.product.id = :productId AND ps.store.id = :storeId")
    Optional<ProductStock> lockByProductAndStore(@Param("productId") UUID productId, @Param("storeId") UUID storeId);

    Optional<ProductStock> findByProductIdAndStoreId(UUID productId, UUID storeId);

    @Query("SELECT ps FROM ProductStock ps JOIN FETCH ps.store WHERE ps.product.id = :productId")
    List<ProductStock> findByProductIdWithStore(@Param("productId") UUID productId);

    @Query(value = "SELECT ps FROM ProductStock ps JOIN FETCH ps.product p WHERE ps.store.id = :storeId AND ("
            + "LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) "
            + "OR LOWER(p.sku) LIKE LOWER(CONCAT('%', :search, '%'))) "
            + "ORDER BY p.name ASC",
            countQuery = "SELECT COUNT(ps) FROM ProductStock ps JOIN ps.product p WHERE ps.store.id = :storeId AND ("
            + "LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) "
            + "OR LOWER(p.sku) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<ProductStock> searchByStore(@Param("storeId") UUID storeId, @Param("search") String search, Pageable pageable);

    /** Snapshot source for a store stock take: every counter row with pieces on it. */
    @Query("SELECT ps FROM ProductStock ps JOIN FETCH ps.product WHERE ps.store.id = :storeId AND ps.quantity > 0")
    List<ProductStock> findPositiveByStore(@Param("storeId") UUID storeId);

    /** Per store: distinct SKUs with pieces, pieces, value at list price. */
    @Query("SELECT ps.store.id, COUNT(ps), COALESCE(SUM(ps.quantity), 0), "
            + "COALESCE(SUM(ps.quantity * COALESCE(p.price, 0)), 0) "
            + "FROM ProductStock ps JOIN ps.product p WHERE ps.quantity > 0 GROUP BY ps.store.id")
    List<Object[]> summarizeByStore();
}
