package com.jewelry.backend.repository;

import com.jewelry.backend.entity.RepairJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RepairJobRepository extends JpaRepository<RepairJob, UUID>, JpaSpecificationExecutor<RepairJob> {

    Optional<RepairJob> findByJobNumber(String jobNumber);

    Optional<RepairJob> findByRazorpayOrderId(String razorpayOrderId);

    List<RepairJob> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("SELECT r.status, COUNT(r) FROM RepairJob r GROUP BY r.status")
    List<Object[]> countByStatus();
}
