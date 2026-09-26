package com.jewelry.backend.repository;

import com.jewelry.backend.entity.NotificationLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface NotificationLogRepository extends JpaRepository<NotificationLog, UUID>, JpaSpecificationExecutor<NotificationLog> {

    /** Reminder jobs use this to send each reminder once per business object. */
    boolean existsByEventAndReference(String event, String reference);
}
