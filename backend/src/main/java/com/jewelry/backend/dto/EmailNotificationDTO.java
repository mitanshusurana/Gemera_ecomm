package com.jewelry.backend.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
public class EmailNotificationDTO {
    private UUID id;
    private String type;
    private String email;
    private String subject;
    private String templateName;
    private Map<String, String> data;
    private LocalDateTime sentAt;
    private String status;
}
