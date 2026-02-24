package com.jewelry.backend.repository;

import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface RFQRepository extends JpaRepository<RFQ, UUID> {
    Page<RFQ> findByUser(User user, Pageable pageable);
    Page<RFQ> findByUserAndStatus(User user, String status, Pageable pageable);
    Optional<RFQ> findByRfqNumber(String rfqNumber);
}
