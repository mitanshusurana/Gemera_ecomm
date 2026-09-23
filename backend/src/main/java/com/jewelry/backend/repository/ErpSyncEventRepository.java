package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ErpSyncEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ErpSyncEventRepository extends JpaRepository<ErpSyncEvent, UUID> {

    Optional<ErpSyncEvent> findByOrderIdAndEventType(UUID orderId, String eventType);

    List<ErpSyncEvent> findByOrderId(UUID orderId);

    // Delivery queue: oldest first so the ERP receives documents in the order
    // they were issued, and a cap on attempts so a permanently broken row
    // stops consuming the scheduler.
    @Query("SELECT e FROM ErpSyncEvent e WHERE e.status IN :statuses AND e.attempts < :maxAttempts ORDER BY e.createdAt ASC")
    List<ErpSyncEvent> findDeliverable(@Param("statuses") Collection<String> statuses,
                                       @Param("maxAttempts") int maxAttempts);
}
