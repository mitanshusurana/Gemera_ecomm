package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByUser(User user);
    Page<Order> findByUser(User user, Pageable pageable);
}
