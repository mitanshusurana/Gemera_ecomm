package com.jewelry.backend.util;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Maps the free-text "state" a customer types into an address to the
 * two-digit GST state code used for place of supply.
 *
 * Addresses are captured as plain strings (AddressDTO.state), so the same
 * state arrives as "Uttar Pradesh", "UP", "uttar pradesh " or even "09".
 * Lookups are case-insensitive, "&" and "and" are interchangeable, and the
 * bare code is accepted so an admin can store the code itself. Unknown text
 * yields null; the caller decides the fallback (InvoiceService uses the
 * seller's own state, which makes the supply intra-state).
 */
public final class GstStateCodes {

    private static final Map<String, String> BY_NAME = new HashMap<>();
    private static final Map<String, String> NAME_BY_CODE = new HashMap<>();

    private static final Set<String> VALID_CODES = Set.of(
            "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
            "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
            "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
            "31", "32", "33", "34", "35", "36", "37", "38", "97");

    static {
        register("01", "Jammu and Kashmir", "Jammu & Kashmir", "J&K", "JK");
        register("02", "Himachal Pradesh", "HP");
        register("03", "Punjab", "PB");
        register("04", "Chandigarh", "CH");
        register("05", "Uttarakhand", "Uttaranchal", "UK", "UA");
        register("06", "Haryana", "HR");
        register("07", "Delhi", "New Delhi", "NCT of Delhi", "National Capital Territory of Delhi", "DL");
        register("08", "Rajasthan", "RJ");
        register("09", "Uttar Pradesh", "UP");
        register("10", "Bihar", "BR");
        register("11", "Sikkim", "SK");
        register("12", "Arunachal Pradesh", "AR");
        register("13", "Nagaland", "NL");
        register("14", "Manipur", "MN");
        register("15", "Mizoram", "MZ");
        register("16", "Tripura", "TR");
        register("17", "Meghalaya", "ML");
        register("18", "Assam", "AS");
        register("19", "West Bengal", "WB");
        register("20", "Jharkhand", "JH");
        register("21", "Odisha", "Orissa", "OD", "OR");
        register("22", "Chhattisgarh", "Chattisgarh", "CG", "CT");
        register("23", "Madhya Pradesh", "MP");
        register("24", "Gujarat", "GJ");
        // 25 (Daman and Diu) merged into 26 in 2020; both names resolve to 26.
        register("26", "Dadra and Nagar Haveli and Daman and Diu", "Dadra and Nagar Haveli",
                "Daman and Diu", "DNHDD", "DN", "DD");
        register("27", "Maharashtra", "MH");
        register("29", "Karnataka", "KA");
        register("30", "Goa", "GA");
        register("31", "Lakshadweep", "LD");
        register("32", "Kerala", "KL");
        register("33", "Tamil Nadu", "Tamilnadu", "TN");
        register("34", "Puducherry", "Pondicherry", "PY");
        register("35", "Andaman and Nicobar Islands", "Andaman and Nicobar", "Andaman & Nicobar Islands", "AN");
        register("36", "Telangana", "Telengana", "TS", "TG");
        register("37", "Andhra Pradesh", "AP", "AD");
        register("38", "Ladakh", "LA");
        register("97", "Other Territory");
    }

    private GstStateCodes() {
    }

    private static void register(String code, String canonicalName, String... aliases) {
        NAME_BY_CODE.put(code, canonicalName);
        BY_NAME.put(normalize(canonicalName), code);
        for (String alias : aliases) {
            BY_NAME.put(normalize(alias), code);
        }
    }

    private static String normalize(String raw) {
        String s = raw.trim().toLowerCase(Locale.ROOT).replace("&", " and ");
        // Drop punctuation and collapse whitespace so "tamil-nadu" and
        // "Tamil  Nadu" meet in the middle.
        s = s.replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim();
        return s;
    }

    /** GST state code for a state/UT name, abbreviation or code; null when unknown. */
    public static String codeFor(String stateOrCode) {
        if (stateOrCode == null) {
            return null;
        }
        String trimmed = stateOrCode.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.matches("\\d{1,2}")) {
            String code = trimmed.length() == 1 ? "0" + trimmed : trimmed;
            return VALID_CODES.contains(code) ? code : null;
        }
        return BY_NAME.get(normalize(trimmed));
    }

    /** Canonical state name for a code (for printing); null when unknown. */
    public static String nameFor(String code) {
        return code == null ? null : NAME_BY_CODE.get(code.trim());
    }
}
