package com.jewelry.backend.controller;

import com.jewelry.backend.dto.EmailNotificationDTO;
import com.jewelry.backend.dto.EmailTemplateDTO;
import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.entity.EmailTemplate;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.EmailService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/email")
@CrossOrigin(origins = "*")
@Tag(name = "Email", description = "Email Notification APIs")
public class EmailController {

    @Autowired
    private EmailService emailService;

    @Autowired
    EntityMapper entityMapper;

    @PostMapping("/send")
    @Operation(summary = "Send email notification")
    public ResponseEntity<EmailNotificationDTO> sendEmail(@RequestBody EmailNotificationDTO notification) {
        EmailNotification entity = entityMapper.toEmailNotificationEntity(notification);
        return ResponseEntity.ok(entityMapper.toEmailNotificationDTO(emailService.sendEmail(entity)));
    }

    @GetMapping("/notifications/{id}")
    @Operation(summary = "Get notification by ID")
    public ResponseEntity<EmailNotificationDTO> getNotification(@PathVariable UUID id) {
        return ResponseEntity.ok(entityMapper.toEmailNotificationDTO(emailService.getNotification(id)));
    }

    @GetMapping("/notifications")
    @Operation(summary = "Get user notifications")
    public ResponseEntity<Page<EmailNotificationDTO>> getNotifications(
            @RequestParam String email,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Page<EmailNotification> notifications = emailService.getUserNotifications(email, PageRequest.of(page, size));
        return ResponseEntity.ok(notifications.map(entityMapper::toEmailNotificationDTO));
    }

    @PostMapping("/subscribe")
    @Operation(summary = "Subscribe to newsletter")
    public ResponseEntity<Void> subscribe(@RequestBody Map<String, String> body) {
        emailService.subscribe(body.get("email"));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/unsubscribe")
    @Operation(summary = "Unsubscribe from newsletter")
    public ResponseEntity<Void> unsubscribe(@RequestBody Map<String, String> body) {
        emailService.unsubscribe(body.get("email"));
        return ResponseEntity.ok().build();
    }

    @GetMapping("/templates/{name}")
    @Operation(summary = "Get email template")
    public ResponseEntity<EmailTemplateDTO> getTemplate(@PathVariable String name) {
        return ResponseEntity.ok(entityMapper.toEmailTemplateDTO(emailService.getTemplate(name)));
    }

    @GetMapping("/templates")
    @Operation(summary = "Get all templates")
    public ResponseEntity<List<EmailTemplateDTO>> getAllTemplates() {
        List<EmailTemplate> templates = emailService.getAllTemplates();
        return ResponseEntity.ok(templates.stream().map(entityMapper::toEmailTemplateDTO).collect(Collectors.toList()));
    }
}
