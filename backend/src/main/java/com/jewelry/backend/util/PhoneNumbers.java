package com.jewelry.backend.util;

/**
 * Phone number normalisation for the messaging channels. Customers type
 * numbers every way imaginable ("98765 43210", "0-9876543210", "+91 98765
 * 43210"); providers want E.164 ("+919876543210"). Indian numbers are the
 * default: a bare 10-digit number starting 6-9 gets +91, a leading 0 is a
 * trunk prefix and is dropped, "91" + 10 digits is already Indian.
 */
public final class PhoneNumbers {

    public static final String DEFAULT_COUNTRY_CODE = "+91";

    private PhoneNumbers() {
    }

    /** E.164 form with +91 as the default country code, or null when the input cannot be a phone number. */
    public static String toE164(String raw) {
        return toE164(raw, DEFAULT_COUNTRY_CODE);
    }

    public static String toE164(String raw, String defaultCountryCode) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        boolean plus = trimmed.startsWith("+") || trimmed.startsWith("00");
        StringBuilder digits = new StringBuilder();
        for (char c : trimmed.toCharArray()) {
            if (c >= '0' && c <= '9') {
                digits.append(c);
            }
        }
        String d = digits.toString();
        if (plus && trimmed.startsWith("00")) {
            d = d.substring(2);
        }
        if (d.isEmpty()) {
            return null;
        }
        String cc = defaultCountryCode == null ? DEFAULT_COUNTRY_CODE : defaultCountryCode.trim();
        String ccDigits = cc.replace("+", "");

        String result;
        if (plus) {
            result = d;
        } else if (d.length() == 10 && d.charAt(0) >= '6' && d.charAt(0) <= '9') {
            // Bare Indian mobile.
            result = ccDigits + d;
        } else if (d.length() == 11 && d.charAt(0) == '0') {
            // Trunk prefix.
            result = ccDigits + d.substring(1);
        } else if (d.length() == 12 && d.startsWith(ccDigits) && ccDigits.length() == 2) {
            result = d;
        } else if (d.length() > 10 && d.length() <= 15) {
            // Already carries a country code without the plus.
            result = d;
        } else {
            return null;
        }
        if (result.length() < 8 || result.length() > 15) {
            return null;
        }
        return "+" + result;
    }

    /** E.164 without the plus, the form Meta and MSG91 expect in "to"/"mobiles". */
    public static String digitsOnly(String e164) {
        if (e164 == null) {
            return null;
        }
        return e164.startsWith("+") ? e164.substring(1) : e164;
    }

    /** "+91******3210": country code, stars, last four digits. Safe for logs. */
    public static String mask(String phone) {
        if (phone == null || phone.isBlank()) {
            return "";
        }
        String p = phone.trim();
        if (p.length() <= 4) {
            return "****";
        }
        int keepPrefix = p.startsWith("+") ? Math.min(3, p.length() - 4) : 0;
        StringBuilder sb = new StringBuilder();
        sb.append(p, 0, keepPrefix);
        for (int i = keepPrefix; i < p.length() - 4; i++) {
            sb.append('*');
        }
        sb.append(p.substring(p.length() - 4));
        return sb.toString();
    }

    /** "m***@example.com". Safe for logs. */
    public static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return "";
        }
        String e = email.trim();
        int at = e.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return e.charAt(0) + "***" + e.substring(at);
    }
}
