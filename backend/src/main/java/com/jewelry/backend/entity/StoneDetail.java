package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;

@Entity
@Table(name = "stone_details")
@Data
@EqualsAndHashCode(callSuper = true)
public class StoneDetail extends BaseEntity {
    private String stoneType; // e.g., Natural Emerald, Diamond, Ruby
    private String shape;
    private Integer pieceCount;
    private BigDecimal totalCaratWeight;
    private String settingType;

    // Per-stone grading (docs/BUSINESS_GAPS.md, catalogue row). All nullable so
    // ddl-auto=update adds the columns; caratWeight is per stone when
    // pieceCount > 1 (row total = caratWeight x pieceCount), otherwise the row.
    private BigDecimal caratWeight;
    private String clarity; // FL, IF, VVS1 ... I3 for diamonds; free text otherwise
    private String colour; // D-Z for diamonds; trade term for coloured stones
    private String cut; // Excellent, Very Good, Good, Fair, Poor
    private String certificateLab; // GIA, IGI, GRS, SSEF, Gubelin, GII, IGL, Other
    private String certificateNumber;
    private BigDecimal ratePerCarat;
    private String origin; // Colombia, Burma, Kashmir, Zambia ...
    private String treatment; // None, Heated, Oiled, Filled ...
    private String position; // Centre, Halo, Shank, Side, Accent
}
