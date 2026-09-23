package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockTransfer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface StockTransferRepository extends JpaRepository<StockTransfer, UUID> {

    @EntityGraph(attributePaths = {"fromStore", "toStore", "lines", "lines.product"})
    @Query("SELECT t FROM StockTransfer t WHERE t.id = :id")
    Optional<StockTransfer> findDetailById(@Param("id") UUID id);

    /** status "" means every status. Newest first. */
    @EntityGraph(attributePaths = {"fromStore", "toStore"})
    @Query(value = "SELECT t FROM StockTransfer t WHERE (:status = '' OR t.status = :status) ORDER BY t.createdAt DESC",
            countQuery = "SELECT COUNT(t) FROM StockTransfer t WHERE (:status = '' OR t.status = :status)")
    Page<StockTransfer> search(@Param("status") String status, Pageable pageable);

    long countByStatus(String status);
}
