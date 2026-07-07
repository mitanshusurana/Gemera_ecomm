package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface StockNotificationRepository extends JpaRepository<StockNotification, UUID> {
    List<StockNotification> findByProductIdAndNotifiedFalse(UUID productId);
    boolean existsByEmailAndProductIdAndNotifiedFalse(String email, UUID productId);
}
