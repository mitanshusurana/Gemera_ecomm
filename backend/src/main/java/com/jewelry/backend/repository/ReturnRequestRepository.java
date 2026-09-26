package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ReturnRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReturnRequestRepository extends JpaRepository<ReturnRequest, UUID> {

    Optional<ReturnRequest> findByRmaNumberIgnoreCase(String rmaNumber);

    List<ReturnRequest> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<ReturnRequest> findByOrderIdAndStatusIn(UUID orderId, Collection<String> statuses);

    List<ReturnRequest> findByOrderIdOrderByCreatedAtDesc(UUID orderId);

    /** Admin list: optional status and a free-text match on RMA number, order number or customer e-mail. */
    @Query("SELECT r FROM ReturnRequest r LEFT JOIN r.order o LEFT JOIN r.user u WHERE "
            + "(:status IS NULL OR r.status = :status) AND ("
            + ":q IS NULL OR LOWER(r.rmaNumber) LIKE :q OR LOWER(o.orderNumber) LIKE :q OR LOWER(u.email) LIKE :q) "
            + "ORDER BY r.createdAt DESC")
    Page<ReturnRequest> search(@Param("status") String status, @Param("q") String q, Pageable pageable);

    @Query("SELECT r.status, COUNT(r) FROM ReturnRequest r GROUP BY r.status")
    List<Object[]> countGroupedByStatus();
}
