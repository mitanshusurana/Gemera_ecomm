package com.jewelry.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/v1/admin/backup")
public class BackupController {

    private static final Logger LOGGER = Logger.getLogger(BackupController.class.getName());

    @Value("${spring.datasource.url}")
    private String dbUrl;

    @Value("${spring.datasource.username}")
    private String dbUsername;

    @Value("${spring.datasource.password}")
    private String dbPassword;

    @PostMapping("/trigger")
    public ResponseEntity<Map<String, Object>> triggerBackup() {
        Map<String, Object> response = new HashMap<>();
        
        try {
            // Simplified logic: If it's H2 (local dev), we skip or do a simple file copy if file-based.
            // If PostgreSQL (prod), we run pg_dump.
            if (dbUrl != null && dbUrl.startsWith("jdbc:postgresql")) {
                String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
                String backupFileName = "backup_" + timestamp + ".sql";
                String backupPath = "/tmp/" + backupFileName; // Or a configured backup directory
                
                // Extract DB name from URL (e.g. jdbc:postgresql://localhost:5432/jewelry_db)
                String dbName = dbUrl.substring(dbUrl.lastIndexOf("/") + 1);
                if (dbName.contains("?")) {
                    dbName = dbName.substring(0, dbName.indexOf("?"));
                }

                ProcessBuilder pb = new ProcessBuilder(
                        "pg_dump",
                        "-U", dbUsername,
                        "-d", dbName,
                        "-f", backupPath
                );
                
                pb.environment().put("PGPASSWORD", dbPassword);
                pb.redirectErrorStream(true);
                
                Process process = pb.start();
                int exitCode = process.waitFor();
                
                if (exitCode == 0) {
                    response.put("success", true);
                    response.put("message", "Backup completed successfully");
                    response.put("file", backupPath);
                    return ResponseEntity.ok(response);
                } else {
                    response.put("success", false);
                    response.put("message", "Backup process failed with exit code " + exitCode);
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
                }
            } else {
                response.put("success", true);
                response.put("message", "Database is not PostgreSQL. Skipped pg_dump. (Local H2 Database)");
                return ResponseEntity.ok(response);
            }
        } catch (IOException | InterruptedException e) {
            LOGGER.log(Level.SEVERE, "Failed to execute backup", e);
            response.put("success", false);
            response.put("message", "Error triggering backup: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
}
