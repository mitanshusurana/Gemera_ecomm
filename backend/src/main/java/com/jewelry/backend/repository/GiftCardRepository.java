package com.jewelry.backend.repository;

import com.jewelry.backend.entity.GiftCard;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GiftCardRepository extends JpaRepository<GiftCard, UUID> {

    Optional<GiftCard> findByCodeIgnoreCase(String code);

    boolean existsByCode(String code);

    /**
     * Redemption path: lock the row so two concurrent checkouts cannot both
     * spend the same balance.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM GiftCard g WHERE UPPER(g.code) = UPPER(:code)")
    Optional<GiftCard> findByCodeIgnoreCaseForUpdate(@Param("code") String code);

    /**
     * Activation path: lock the row so two concurrent confirm calls for the
     * same purchase activate it (and send its emails) only once.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM GiftCard g WHERE g.id = :id")
    Optional<GiftCard> findByIdForUpdate(@Param("id") UUID id);
}
