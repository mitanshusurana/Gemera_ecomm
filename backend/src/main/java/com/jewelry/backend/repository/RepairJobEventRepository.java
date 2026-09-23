package com.jewelry.backend.repository;

import com.jewelry.backend.entity.RepairJobEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RepairJobEventRepository extends JpaRepository<RepairJobEvent, UUID> {

    List<RepairJobEvent> findByJobIdOrderByCreatedAtAsc(UUID jobId);

    List<RepairJobEvent> findByJobIdAndVisibleToCustomerTrueOrderByCreatedAtAsc(UUID jobId);
}
