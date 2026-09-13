package com.jewelry.backend.repository;

import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TreasureChestAccountRepository extends JpaRepository<TreasureChestAccount, UUID> {
    Optional<TreasureChestAccount> findByUser(User user);

    /**
     * Payment path: lock the account so two installments applied at the same
     * time (customer confirm + webhook, or admin cash) update the counters
     * and balance one after the other.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM TreasureChestAccount a WHERE a.id = :id")
    Optional<TreasureChestAccount> findByIdForUpdate(@Param("id") UUID id);
}
