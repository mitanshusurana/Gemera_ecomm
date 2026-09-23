package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockTake;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StockTakeRepository extends JpaRepository<StockTake, UUID> {

    @EntityGraph(attributePaths = {"store", "lines", "lines.product"})
    @Query("SELECT t FROM StockTake t WHERE t.id = :id")
    Optional<StockTake> findDetailById(@Param("id") UUID id);

    /** status "" means every status. Newest first. */
    @EntityGraph(attributePaths = {"store"})
    @Query(value = "SELECT t FROM StockTake t WHERE (:status = '' OR t.status = :status) ORDER BY t.createdAt DESC",
            countQuery = "SELECT COUNT(t) FROM StockTake t WHERE (:status = '' OR t.status = :status)")
    Page<StockTake> search(@Param("status") String status, Pageable pageable);

    long countByStatus(String status);

    /** One open take per location at a time keeps counts from overlapping. */
    List<StockTake> findByStatusAndStoreId(String status, UUID storeId);

    List<StockTake> findByStatusAndStoreIsNull(String status);
}
