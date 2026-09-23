package com.jewelry.backend.repository;

import com.jewelry.backend.entity.RepairSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RepairSequenceRepository extends JpaRepository<RepairSequence, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM RepairSequence s WHERE s.year = :year")
    Optional<RepairSequence> lockByYear(@Param("year") String year);

    /** Creates the year's counter if missing; ON CONFLICT lets a racing transaction continue to the lock. */
    @Modifying
    @Query(value = "INSERT INTO repair_sequences (job_year, last_number) VALUES (:year, 0) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int ensureRow(@Param("year") String year);
}
