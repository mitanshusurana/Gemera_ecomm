package com.jewelry.backend.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class CertificateDetailDTO {
    private UUID id;
    private String reportNumber;
    private String lab;
    private String dateIssued;
    private String productName;
    private Double carat;
    private String color;
    private String clarity;
    private String cut;
    private String shape;
    private String imageUrl;
}
