package com.jewelry.backend.repository;

import com.jewelry.backend.entity.CustomInquiry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CustomInquiryRepository extends JpaRepository<CustomInquiry, Long> {
}
