package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByUser(User user);
    Page<Order> findByUser(User user, Pageable pageable);
    Page<Order> findByUserAndStatus(User user, String status, Pageable pageable);
    Page<Order> findByStatus(String status, Pageable pageable);
    Optional<Order> findByOrderNumber(String orderNumber);
}
