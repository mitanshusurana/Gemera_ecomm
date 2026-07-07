package com.jewelry.backend.repository;

import com.jewelry.backend.entity.UserProductView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserProductViewRepository extends JpaRepository<UserProductView, UUID> {
    Optional<UserProductView> findByUserIdAndProductId(UUID userId, UUID productId);
}
