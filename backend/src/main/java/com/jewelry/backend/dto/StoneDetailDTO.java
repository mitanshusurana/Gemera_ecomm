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
}
