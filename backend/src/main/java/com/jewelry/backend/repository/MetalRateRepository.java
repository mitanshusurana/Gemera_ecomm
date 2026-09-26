package com.jewelry.backend.repository;

import com.jewelry.backend.entity.MetalRate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MetalRateRepository extends JpaRepository<MetalRate, UUID> {

    List<MetalRate> findByRateDate(LocalDate rateDate);

    boolean existsByRateDate(LocalDate rateDate);

    Optional<MetalRate> findFirstByRateDateAndMetalAndPurity(LocalDate rateDate, String metal, String purity);

    List<MetalRate> findByMetalAndPurityAndRateDateGreaterThanEqualOrderByRateDateAsc(
            String metal, String purity, LocalDate from);
}
