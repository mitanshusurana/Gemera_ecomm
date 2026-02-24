package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Certificate;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface CertificateRepository extends JpaRepository<Certificate, UUID> {
    Optional<Certificate> findByReportNumber(String reportNumber);
}
