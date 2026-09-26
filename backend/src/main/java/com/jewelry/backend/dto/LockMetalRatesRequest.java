package com.jewelry.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Body of {@code POST /api/v1/admin/metal-rates/lock}. Any metal/purity the
 * request leaves out is derived from the metal's fine-label rate in the
 * request (24K, 999 or 950); a metal with no line at all is filled from the
 * live feed. An empty list locks the live board as it stands.
 */
@Data
public class LockMetalRatesRequest {
    private List<Line> rates = new ArrayList<>();
    private String note;

    @Data
    public static class Line {
        private String metal;
        private String purity;
        private BigDecimal ratePerGram;
    }
}
