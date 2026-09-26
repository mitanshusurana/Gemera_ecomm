package com.jewelry.backend.repository;

import com.jewelry.backend.entity.ReturnLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ReturnLineRepository extends JpaRepository<ReturnLine, UUID> {
}
