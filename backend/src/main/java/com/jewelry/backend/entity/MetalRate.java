package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One line of the locked rate board: the rupee-per-gram rate of a metal and
 * purity for one day (IST). A day's board is the set of rows sharing
 * {@code rateDate}; locking rewrites them in place. {@code source} is LIVE
 * when the figure came from the feed (auto-lock or filled in from it) and
 * MANUAL when staff typed it or it derives from a typed figure.
 */
@Entity
@Table(name = "metal_rates",
        uniqueConstraints = @UniqueConstraint(name = "uk_metal_rates_date_metal_purity",
                columnNames = {"rate_date", "metal", "purity"}),
        indexes = @Index(name = "ix_metal_rates_metal_purity_date", columnList = "metal, purity, rate_date"))
@Data
@EqualsAndHashCode(callSuper = true)
public class MetalRate extends BaseEntity {

    public static final String SOURCE_LIVE = "LIVE";
    public static final String SOURCE_MANUAL = "MANUAL";

    @Column(name = "rate_date", nullable = false)
    private LocalDate rateDate;

    @Column(nullable = false, length = 16)
    private String metal; // GOLD | SILVER | PLATINUM

    @Column(nullable = false, length = 8)
    private String purity; // 24K, 22K, 18K, 14K, 999, 925, 950

    @Column(precision = 6, scale = 4)
    private BigDecimal purityFraction;

    @Column(precision = 14, scale = 2)
    private BigDecimal ratePerGram;

    @Column(length = 8)
    private String source; // LIVE | MANUAL

    private String lockedBy;
    private LocalDateTime lockedAt;

    @Column(length = 500)
    private String note;
}
