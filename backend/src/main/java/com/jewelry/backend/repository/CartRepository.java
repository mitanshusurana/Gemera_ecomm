package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CartRepository extends JpaRepository<Cart, UUID> {
    Optional<Cart> findByUser(User user);

    List<Cart> findByUpdatedAtBeforeAndTotalGreaterThanAndAbandonmentEmailSentFalse(LocalDateTime updatedAt, BigDecimal total);
}
