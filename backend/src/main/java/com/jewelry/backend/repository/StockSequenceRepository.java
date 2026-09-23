package com.jewelry.backend.repository;

import com.jewelry.backend.entity.StockSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface StockSequenceRepository extends JpaRepository<StockSequence, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM StockSequence s WHERE s.seriesKey = :key")
    Optional<StockSequence> lockByKey(@Param("key") String key);

    /** Same first-document race handling as InvoiceSequenceRepository.ensureRow (PostgreSQL only). */
    @Modifying
    @Query(value = "INSERT INTO stock_sequences (series_key, last_number) VALUES (:key, 0) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int ensureRow(@Param("key") String key);
}
