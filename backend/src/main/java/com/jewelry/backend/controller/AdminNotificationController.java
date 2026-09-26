package com.jewelry.backend.controller;

import com.jewelry.backend.dto.NotificationDtos.EventTemplate;
import com.jewelry.backend.dto.NotificationDtos.LogEntry;
import com.jewelry.backend.dto.NotificationDtos.TestRequest;
import com.jewelry.backend.dto.NotificationDtos.TestResponse;
import com.jewelry.backend.entity.NotificationLog;
import com.jewelry.backend.repository.NotificationLogRepository;
import com.jewelry.backend.service.notification.NotificationChannel;
import com.jewelry.backend.service.notification.NotificationEvent;
import com.jewelry.backend.service.notification.NotificationResult;
import com.jewelry.backend.service.notification.NotificationService;
import com.jewelry.backend.service.notification.NotificationTemplateRegistry;
import com.jewelry.backend.service.notification.NotificationTemplateRegistry.TemplateSpec;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Delivery log, channel status and test sends for the messaging channels. */
@RestController
@RequestMapping("/api/v1/admin/notifications")
@Tag(name = "Admin Notifications", description = "E-mail, WhatsApp and SMS delivery log and test sends")
public class AdminNotificationController {

    @Autowired
    NotificationLogRepository logRepository;

    @Autowired
    NotificationService notificationService;

    @Autowired
    NotificationTemplateRegistry registry;

    @GetMapping
    @PreAuthorize("@access.has('logs.read')")
    @Operation(summary = "Delivery log, newest first; filter by channel, status and a search on reference, event or masked recipient")
    public ResponseEntity<Page<LogEntry>> list(
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "25") int size,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        String ch = NotificationChannel.parse(channel) == null ? null : NotificationChannel.parse(channel).name();
        String st = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        String q = search == null || search.isBlank() ? null : "%" + search.trim().toLowerCase(Locale.ROOT) + "%";

        Specification<NotificationLog> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (ch != null) predicates.add(cb.equal(root.get("channel"), ch));
            if (st != null) predicates.add(cb.equal(root.get("status"), st));
            if (q != null) {
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("reference")), q),
                        cb.like(cb.lower(root.get("event")), q),
                        cb.like(cb.lower(root.get("recipient")), q),
                        cb.like(cb.lower(root.get("template")), q)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(logRepository.findAll(spec, pageable).map(AdminNotificationController::toDto));
    }

    @GetMapping("/channels")
    @PreAuthorize("@access.hasAny('logs.read', 'settings.read')")
    @Operation(summary = "Which providers are configured (no secrets)")
    public ResponseEntity<Map<String, Map<String, Object>>> channels() {
        return ResponseEntity.ok(notificationService.channels());
    }

    @GetMapping("/events")
    @PreAuthorize("@access.hasAny('logs.read', 'settings.read')")
    @Operation(summary = "Every event with its default and overridden WhatsApp template name and SMS text")
    public ResponseEntity<List<EventTemplate>> events() {
        List<EventTemplate> out = new ArrayList<>();
        for (TemplateSpec resolved : registry.resolveAll()) {
            TemplateSpec def = NotificationTemplateRegistry.defaults(resolved.event());
            out.add(new EventTemplate(
                    resolved.event().name(),
                    resolved.emailTemplate(),
                    def == null ? null : def.waTemplate(),
                    resolved.waTemplate(),
                    resolved.waParams(),
                    def == null ? null : def.smsText(),
                    resolved.smsText()));
        }
        return ResponseEntity.ok(out);
    }

    @PostMapping("/test")
    @PreAuthorize("@access.has('settings.write')")
    @Operation(summary = "Send a test message on one channel to a phone (WhatsApp, SMS) or e-mail address")
    public ResponseEntity<TestResponse> test(@RequestBody TestRequest body) {
        if (body == null) {
            throw new IllegalArgumentException("channel and phone or email are required");
        }
        NotificationChannel channel = NotificationChannel.parse(body.channel());
        if (channel == null) {
            throw new IllegalArgumentException("channel must be EMAIL, WHATSAPP or SMS");
        }
        String destination = channel == NotificationChannel.EMAIL ? body.email() : body.phone();
        NotificationEvent event = NotificationEvent.parse(body.event());
        NotificationResult result = notificationService.sendTest(channel, destination, event);
        return ResponseEntity.ok(new TestResponse(result.channel().name(), result.status(), result.providerMessageId(), result.error()));
    }

    static LogEntry toDto(NotificationLog log) {
        return new LogEntry(log.getId(), log.getEvent(), log.getChannel(), log.getRecipient(), log.getTemplate(),
                log.getStatus(), log.getProviderMessageId(), log.getError(), log.getReference(), log.getCreatedAt());
    }
}
