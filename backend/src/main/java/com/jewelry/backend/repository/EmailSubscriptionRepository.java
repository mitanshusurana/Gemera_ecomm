package com.jewelry.backend.repository;

import com.jewelry.backend.entity.EmailSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface EmailSubscriptionRepository extends JpaRepository<EmailSubscription, UUID> {
    Optional<EmailSubscription> findByEmail(String email);
}
