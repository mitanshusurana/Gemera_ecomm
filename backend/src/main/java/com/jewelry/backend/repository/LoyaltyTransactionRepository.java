package com.jewelry.backend.repository;

import com.jewelry.backend.entity.LoyaltyTransaction;
import com.jewelry.backend.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LoyaltyTransactionRepository extends JpaRepository<LoyaltyTransaction, UUID> {

    Page<LoyaltyTransaction> findByUserOrderByCreatedAtDesc(User user, Pageable pageable);

    List<LoyaltyTransaction> findByUserOrderByCreatedAtAsc(User user);

    Optional<LoyaltyTransaction> findFirstByOrderIdAndType(UUID orderId, String type);

    List<LoyaltyTransaction> findByOrderId(UUID orderId);

    boolean existsByOrderIdAndType(UUID orderId, String type);

    /** Sum of every positive movement: what the tiers are based on. */
    @Query("SELECT COALESCE(SUM(t.points), 0) FROM LoyaltyTransaction t WHERE t.user = :user AND t.points > 0")
    long lifetimeEarned(@Param("user") User user);

    /** Users holding at least one earn lot whose expiry has passed and has not been processed. */
    @Query("SELECT DISTINCT t.user.id FROM LoyaltyTransaction t WHERE t.expiresAt IS NOT NULL AND t.expiresAt <= :now AND t.expiryProcessed = false")
    List<UUID> userIdsWithDueLots(@Param("now") LocalDateTime now);
}
