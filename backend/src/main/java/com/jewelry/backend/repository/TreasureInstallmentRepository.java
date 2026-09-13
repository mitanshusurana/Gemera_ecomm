package com.jewelry.backend.repository;

import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.TreasureInstallment;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TreasureInstallmentRepository extends JpaRepository<TreasureInstallment, UUID> {

    /** Customer history: newest first. */
    List<TreasureInstallment> findByAccountOrderByCreatedAtDesc(TreasureChestAccount account);

    /** At most one PENDING installment per account is created; the order endpoint returns it instead of a new one. */
    Optional<TreasureInstallment> findFirstByAccountAndStatusOrderByCreatedAtDesc(TreasureChestAccount account, String status);

    // Razorpay webhook: the gateway order id is the only key the event carries.
    Optional<TreasureInstallment> findByRazorpayOrderId(String razorpayOrderId);

    /**
     * Payment path: lock the row so a client confirm and the webhook for the
     * same installment apply it (and send its emails) only once.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM TreasureInstallment i WHERE i.id = :id")
    Optional<TreasureInstallment> findByIdForUpdate(@Param("id") UUID id);
}
