package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Wishlist;
import com.jewelry.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface WishlistRepository extends JpaRepository<Wishlist, UUID> {
    Optional<Wishlist> findByUser(User user);
}
