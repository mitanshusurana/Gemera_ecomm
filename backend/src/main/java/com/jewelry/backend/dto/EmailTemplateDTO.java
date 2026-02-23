package com.jewelry.backend.dto;

import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class EmailTemplateDTO {
    private UUID id;
    private String name;
    private String subject;
    private String htmlContent;
    private List<String> placeholders;
}
