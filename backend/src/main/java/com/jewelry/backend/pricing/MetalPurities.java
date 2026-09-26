package com.jewelry.backend.pricing;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The rate board's purity table: which metals and purities the shop quotes,
 * in board order, and the fine-metal fraction of each.
 *
 * <pre>
 *   GOLD      24K 0.999, 22K 0.916, 18K 0.750, 14K 0.585
 *   SILVER    999 0.999, 925 0.925
 *   PLATINUM  950 0.950
 * </pre>
 *
 * The first purity of each metal is its "fine" label: the rate the shop
 * enters for it is what every other purity of that metal derives from
 * (rate = fine rate x fraction, where fine rate = fine-label rate / its
 * fraction). Labels are normalised so "22k", "916" and " 22 K " all mean 22K.
 */
public final class MetalPurities {

    public static final String GOLD = "GOLD";
    public static final String SILVER = "SILVER";
    public static final String PLATINUM = "PLATINUM";

    public static final List<String> METALS = List.of(GOLD, SILVER, PLATINUM);

    /** One row of the purity table. */
    public record Purity(String metal, String label, BigDecimal fraction) {
    }

    public static final List<Purity> ALL;

    static {
        List<Purity> rows = new ArrayList<>();
        rows.add(new Purity(GOLD, "24K", new BigDecimal("0.999")));
        rows.add(new Purity(GOLD, "22K", new BigDecimal("0.916")));
        rows.add(new Purity(GOLD, "18K", new BigDecimal("0.750")));
        rows.add(new Purity(GOLD, "14K", new BigDecimal("0.585")));
        rows.add(new Purity(SILVER, "999", new BigDecimal("0.999")));
        rows.add(new Purity(SILVER, "925", new BigDecimal("0.925")));
        rows.add(new Purity(PLATINUM, "950", new BigDecimal("0.950")));
        ALL = Collections.unmodifiableList(rows);
    }

    private MetalPurities() {
    }

    /** "Gold", " gold ", "AU" and "GOLD" all normalise to GOLD; null when unknown or blank. */
    public static String normalizeMetal(String metal) {
        if (metal == null) {
            return null;
        }
        String m = metal.trim().toUpperCase(Locale.ROOT).replace(" ", "");
        return switch (m) {
            case "GOLD", "AU", "XAU", "YELLOWGOLD", "WHITEGOLD", "ROSEGOLD" -> GOLD;
            case "SILVER", "AG", "XAG", "STERLINGSILVER" -> SILVER;
            case "PLATINUM", "PT", "XPT" -> PLATINUM;
            default -> METALS.contains(m) ? m : null;
        };
    }

    /**
     * Normalises a purity label for a (normalised) metal to the table's
     * spelling: gold "916"/"22k"/"22 K" to 22K, "999" to 24K; silver
     * "sterling" to 925; platinum "pt950"/"950" to 950. Null when the label
     * is not on the table for that metal.
     */
    public static String normalizePurity(String metal, String purity) {
        if (metal == null || purity == null) {
            return null;
        }
        String p = purity.trim().toUpperCase(Locale.ROOT).replace(" ", "").replace("KT", "K").replace("CT", "K");
        if (p.isEmpty()) {
            return null;
        }
        switch (metal) {
            case GOLD -> {
                switch (p) {
                    case "999", "24", "24K", "999.9", "24KT" -> p = "24K";
                    case "916", "22", "22K" -> p = "22K";
                    case "750", "18", "18K" -> p = "18K";
                    case "585", "14", "14K" -> p = "14K";
                    default -> { }
                }
            }
            case SILVER -> {
                if ("STERLING".equals(p) || "92.5".equals(p) || "925S".equals(p)) {
                    p = "925";
                } else if ("FINE".equals(p) || "99.9".equals(p)) {
                    p = "999";
                }
            }
            case PLATINUM -> {
                if (p.startsWith("PT")) {
                    p = p.substring(2);
                }
                if ("95".equals(p) || "PLATINUM".equals(p)) {
                    p = "950";
                }
            }
            default -> {
                return null;
            }
        }
        for (Purity row : ALL) {
            if (row.metal().equals(metal) && row.label().equals(p)) {
                return row.label();
            }
        }
        return null;
    }

    /** The table row for a normalised metal and label, if any. */
    public static Optional<Purity> find(String metal, String purity) {
        String m = normalizeMetal(metal);
        String p = normalizePurity(m, purity);
        if (m == null || p == null) {
            return Optional.empty();
        }
        for (Purity row : ALL) {
            if (row.metal().equals(m) && row.label().equals(p)) {
                return Optional.of(row);
            }
        }
        return Optional.empty();
    }

    /** Fine-metal fraction for a metal and purity label, or null when off the table. */
    public static BigDecimal fraction(String metal, String purity) {
        return find(metal, purity).map(Purity::fraction).orElse(null);
    }

    /** The purities of one metal in board order; empty for an unknown metal. */
    public static List<Purity> forMetal(String metal) {
        String m = normalizeMetal(metal);
        List<Purity> rows = new ArrayList<>();
        if (m == null) {
            return rows;
        }
        for (Purity row : ALL) {
            if (row.metal().equals(m)) {
                rows.add(row);
            }
        }
        return rows;
    }

    /** The first (finest) purity of a metal: 24K, 999 or 950. Null for an unknown metal. */
    public static Purity fine(String metal) {
        List<Purity> rows = forMetal(metal);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Label of {@link #fine(String)}, or null. */
    public static String fineLabel(String metal) {
        Purity fine = fine(metal);
        return fine == null ? null : fine.label();
    }
}
