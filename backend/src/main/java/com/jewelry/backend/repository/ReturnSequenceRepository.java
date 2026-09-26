package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ReturnSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ReturnSequenceRepository extends JpaRepository<ReturnSequence, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM ReturnSequence s WHERE s.year = :year")
    Optional<ReturnSequence> lockByYear(@Param("year") String year);

    @Modifying
    @Query(value = "INSERT INTO return_sequences (year, last_number) VALUES (:year, 0) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int ensureRow(@Param("year") String year);
}
