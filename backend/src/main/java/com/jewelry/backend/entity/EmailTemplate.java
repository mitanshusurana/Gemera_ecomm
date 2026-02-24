package com.jewelry.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.util.List;

@Entity
@Table(name = "email_templates")
@Data
@EqualsAndHashCode(callSuper = true)
public class EmailTemplate extends BaseEntity {
    @Column(unique = true)
    private String name;
    private String subject;

    @Column(columnDefinition = "TEXT")
    private String htmlContent;

    @ElementCollection
    private List<String> placeholders;
}
