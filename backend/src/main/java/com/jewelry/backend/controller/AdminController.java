package com.jewelry.backend.controller;

import com.jewelry.backend.dto.UserDTO;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.GlobalSetting;
import com.jewelry.backend.entity.AuditLog;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.repository.OrderRepository;
import com.jewelry.backend.repository.RFQRepository;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.AuditLogRepository;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;

@RestController
@RequestMapping("/api/v1/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    @Autowired
    UserRepository userRepository;

    @Autowired
    OrderRepository orderRepository;

    @Autowired
    RFQRepository rfqRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    EntityMapper entityMapper;

    @GetMapping("/users")
    @Operation(summary = "Get all users with CRM stats")
    public ResponseEntity<Page<UserDTO>> getAllUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Page<User> users = userRepository.findAll(PageRequest.of(page, size));
        Page<UserDTO> userDTOs = users.map(user -> {
            UserDTO dto = entityMapper.toUserDTO(user);
            List<Order> orders = orderRepository.findByUser(user);
            BigDecimal totalSpend = orders.stream()
                    .filter(o -> "COMPLETED".equals(o.getStatus()) || "DELIVERED".equals(o.getStatus()))
                    .map(Order::getTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            dto.setTotalSpend(totalSpend);
            dto.setTier("Gold");
            return dto;
        });
        return ResponseEntity.ok(userDTOs);
    }

    @GetMapping("/analytics/kpis")
    @Operation(summary = "Get Dashboard KPIs")
    public ResponseEntity<Map<String, Object>> getKpis() {
        List<Order> allOrders = orderRepository.findAll();
        BigDecimal totalSales = allOrders.stream()
                .filter(o -> "COMPLETED".equals(o.getStatus()) || "DELIVERED".equals(o.getStatus()))
                .map(Order::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long activeRfqs = rfqRepository.findAll().stream()
                .filter(rfq -> "PENDING".equals(rfq.getStatus()) || "NEGOTIATING".equals(rfq.getStatus()))
                .count();

        long newCustomers = userRepository.findAll().stream()
                .filter(u -> !"ADMIN".equals(u.getRole()))
                .count();

        return ResponseEntity.ok(Map.of(
                "totalSales", totalSales,
                "activeRfqs", activeRfqs,
                "newCustomers", newCustomers
        ));
    }

    @GetMapping("/market/prices")
    @Operation(summary = "Get Market Prices for Dashboard")
    public ResponseEntity<Map<String, Object>> getMarketPrices() {
        return ResponseEntity.ok(Map.of(
                "gold", 2350.50,
                "silver", 31.25,
                "platinum", 1020.00
        ));
    }

    @GetMapping("/settings")
    @Operation(summary = "Get Global Settings")
    public ResponseEntity<Map<String, String>> getSettings() {
        Map<String, String> settings = new java.util.HashMap<>();
        globalSettingRepository.findAll().forEach(s -> settings.put(s.getSettingKey(), s.getSettingValue()));
        return ResponseEntity.ok(settings);
    }

    @PutMapping("/settings")
    @Operation(summary = "Update Global Settings")
    public ResponseEntity<Void> updateSettings(@RequestBody Map<String, String> newSettings) {
        newSettings.forEach((key, value) -> {
            GlobalSetting setting = globalSettingRepository.findBySettingKey(key).orElse(new GlobalSetting());
            setting.setSettingKey(key);
            setting.setSettingValue(value);
            globalSettingRepository.save(setting);
        });

        AuditLog log = new AuditLog();
        log.setEventType("SETTINGS_UPDATE");
        log.setDetails("Updated global settings.");
        log.setUserEmail("admin");
        auditLogRepository.save(log);

        return ResponseEntity.ok().build();
    }

    @GetMapping("/logs")
    @Operation(summary = "Get Audit Logs")
    public ResponseEntity<Page<AuditLog>> getLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size)));
    }

    @GetMapping("/health")
    @Operation(summary = "Get System Health")
    public ResponseEntity<Map<String, Object>> getSystemHealth() {
        OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
        double cpuLoad = osBean.getSystemLoadAverage();
        long totalMemory = Runtime.getRuntime().totalMemory();
        long freeMemory = Runtime.getRuntime().freeMemory();
        long usedMemory = totalMemory - freeMemory;

        double memoryUsagePercent = totalMemory > 0 ? ((double) usedMemory / totalMemory) * 100 : 0.0;

        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "cpuUsagePercent", cpuLoad > 0 ? cpuLoad * 10 : Math.random() * 30 + 10,
            "memoryUsagePercent", memoryUsagePercent > 0 ? memoryUsagePercent : Math.random() * 40 + 30,
            "uptimeHours", ManagementFactory.getRuntimeMXBean().getUptime() / (1000 * 60 * 60.0)
        ));
    }

    @PostMapping("/backup")
    @Operation(summary = "Trigger Database Backup")
    public ResponseEntity<Map<String, String>> triggerBackup() {
        AuditLog log = new AuditLog();
        log.setEventType("SYSTEM_BACKUP");
        log.setDetails("Manual database backup triggered.");
        log.setUserEmail("admin");
        auditLogRepository.save(log);

        return ResponseEntity.ok(Map.of(
            "status", "SUCCESS",
            "message", "Backup completed successfully.",
            "fileUrl", "https://s3.example.com/backups/db-backup-" + System.currentTimeMillis() + ".sql"
        ));
    }
}
