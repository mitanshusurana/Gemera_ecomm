package com.jewelry.backend.repository;

import com.jewelry.backend.entity.GlobalSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GlobalSettingRepository extends JpaRepository<GlobalSetting, UUID> {
    Optional<GlobalSetting> findBySettingKey(String key);
    List<GlobalSetting> findBySettingKeyIn(Collection<String> keys);
}
