package com.jewelry.backend.controller;

import com.jewelry.backend.entity.Setting;
import com.jewelry.backend.repository.SettingRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/v1/settings")
public class SettingController {

    private final SettingRepository settingRepository;

    public SettingController(SettingRepository settingRepository) {
        this.settingRepository = settingRepository;
    }

    @GetMapping
    public ResponseEntity<Map<String, String>> getAllSettings() {
        List<Setting> settings = settingRepository.findAll();
        Map<String, String> settingsMap = settings.stream()
            .filter(s -> s.getKeyName() != null)
            .collect(Collectors.toMap(
                Setting::getKeyName, 
                s -> s.getValue() == null ? "" : s.getValue()
            ));
        return ResponseEntity.ok(settingsMap);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> updateSettings(@RequestBody Map<String, String> updates) {
        updates.forEach((key, value) -> {
            Setting setting = settingRepository.findByKeyName(key).orElse(new Setting());
            setting.setKeyName(key);
            setting.setValue(value);
            settingRepository.save(setting);
        });
        return ResponseEntity.ok().build();
    }
}
