package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ExchangeSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ExchangeSequenceRepository extends JpaRepository<ExchangeSequence, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM ExchangeSequence s WHERE s.year = :year")
    Optional<ExchangeSequence> lockByYear(@Param("year") String year);

    @Modifying
    @Query(value = "INSERT INTO exchange_sequences (year, last_number) VALUES (:year, 0) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int ensureRow(@Param("year") String year);
}
