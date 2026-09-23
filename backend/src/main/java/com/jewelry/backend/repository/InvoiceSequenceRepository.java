package com.jewelry.backend.repository;

import com.jewelry.backend.entity.InvoiceSequence;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface InvoiceSequenceRepository extends JpaRepository<InvoiceSequence, String> {

    /**
     * Row lock for the year's counter. Two invoices issued at the same moment
     * queue here, so both get distinct consecutive numbers.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InvoiceSequence s WHERE s.financialYear = :fy")
    Optional<InvoiceSequence> lockByFinancialYear(@Param("fy") String financialYear);

    /**
     * Creates the year's counter if it does not exist yet. Native because two
     * transactions can race to create it on the first invoice of a new
     * financial year; ON CONFLICT lets the loser continue to the lock instead
     * of failing on the primary key (the schema is PostgreSQL only).
     */
    @Modifying
    @Query(value = "INSERT INTO invoice_sequences (financial_year, last_number) VALUES (:fy, 0) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int ensureRow(@Param("fy") String financialYear);
}
