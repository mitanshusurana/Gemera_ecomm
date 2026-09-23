package com.jewelry.backend.controller;

import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.repository.GlobalSettingRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Public, read-only view of {@code global_settings}. Only the keys the
 * storefront needs are exposed; everything else (tax rates, credentials,
 * internal toggles) stays behind {@code /api/v1/admin/settings}.
 */
@RestController
@RequestMapping("/api/v1/settings")
@Tag(name = "Settings", description = "Public storefront settings")
public class SettingController {

    private static final Set<String> PUBLIC_KEYS = Set.of(
            // Legal name and GSTIN are printed on every tax invoice and are
            // public registration data, so the storefront may show them.
            "companyLegalName",
            "companyGstin",
            "companyAddress",
            "companyPhone",
            "companyEmail",
            "whatsappNumber",
            "companyInstagram",
            "companyFacebook",
            "usdRate",
            "eurRate",
            "gbpRate");

    private static final String PUBLIC_PREFIX = "home.";

    private final GlobalSettingRepository globalSettingRepository;

    public SettingController(GlobalSettingRepository globalSettingRepository) {
        this.globalSettingRepository = globalSettingRepository;
    }

    @GetMapping
    @Operation(summary = "Get public settings (contact details, currency rates, home.* content)")
    public ResponseEntity<Map<String, String>> getPublicSettings() {
        Map<String, String> result = new TreeMap<>();
        for (GlobalSetting setting : globalSettingRepository.findAll()) {
            String key = setting.getSettingKey();
            if (key != null && isPublic(key)) {
                result.put(key, setting.getSettingValue() == null ? "" : setting.getSettingValue());
            }
        }
        return ResponseEntity.ok(result);
    }

    static boolean isPublic(String key) {
        return PUBLIC_KEYS.contains(key) || key.startsWith(PUBLIC_PREFIX);
    }
}
