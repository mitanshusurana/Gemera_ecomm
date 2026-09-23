package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ExchangeRequestEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ExchangeRequestEventRepository extends JpaRepository<ExchangeRequestEvent, UUID> {

    List<ExchangeRequestEvent> findByExchangeRequestIdOrderByAtAsc(UUID exchangeRequestId);
}
