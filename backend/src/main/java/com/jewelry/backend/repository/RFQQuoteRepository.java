package com.jewelry.backend.repository;

import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.RFQQuote;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RFQQuoteRepository extends JpaRepository<RFQQuote, UUID> {
    Page<RFQQuote> findByRfq(RFQ rfq, Pageable pageable);
}
