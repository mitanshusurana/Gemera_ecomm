package com.jewelry.backend.repository;

import com.jewelry.backend.entity.EmailNotification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EmailNotificationRepository extends JpaRepository<EmailNotification, UUID> {
    Page<EmailNotification> findByEmail(String email, Pageable pageable);
}
