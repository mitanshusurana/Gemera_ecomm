package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class StoneDetailDTO {
    private UUID id;
    private String stoneType;
    private String shape;
    private Integer pieceCount;
    private BigDecimal totalCaratWeight;
    private String settingType;
    private BigDecimal caratWeight;
    private String clarity;
    private String colour;
    private String cut;
    private String certificateLab;
    private String certificateNumber;
    private BigDecimal ratePerCarat;
    private String origin;
    private String treatment;
    private String position;
}
