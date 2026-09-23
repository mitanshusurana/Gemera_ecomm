package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ExchangeRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExchangeRequestRepository extends JpaRepository<ExchangeRequest, UUID> {

    Optional<ExchangeRequest> findByRequestNumberIgnoreCase(String requestNumber);

    List<ExchangeRequest> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Page<ExchangeRequest> findByStatus(String status, Pageable pageable);
}
