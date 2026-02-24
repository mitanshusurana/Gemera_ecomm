package com.jewelry.backend.repository;

import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TreasureChestAccountRepository extends JpaRepository<TreasureChestAccount, UUID> {
    Optional<TreasureChestAccount> findByUser(User user);
}
