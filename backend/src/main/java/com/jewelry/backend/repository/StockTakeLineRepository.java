package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockTakeLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StockTakeLineRepository extends JpaRepository<StockTakeLine, UUID> {

    Optional<StockTakeLine> findByStockTakeIdAndProductId(UUID stockTakeId, UUID productId);

    /** Per take: line count, counted lines, lines with a non-zero variance. */
    @Query("SELECT l.stockTake.id, COUNT(l), "
            + "SUM(CASE WHEN l.countedQuantity IS NULL THEN 0 ELSE 1 END), "
            + "SUM(CASE WHEN l.variance IS NOT NULL AND l.variance <> 0 THEN 1 ELSE 0 END) "
            + "FROM StockTakeLine l WHERE l.stockTake.id IN :ids GROUP BY l.stockTake.id")
    List<Object[]> summarizeByTake(@Param("ids") Collection<UUID> ids);
}
