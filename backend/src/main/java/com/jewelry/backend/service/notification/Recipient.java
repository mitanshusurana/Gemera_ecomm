package com.jewelry.backend.service.notification;

import com.jewelry.backend.entity.User;
import com.jewelry.backend.util.PhoneNumbers;

/**
 * Who a message goes to and on which channels they agreed to receive it.
 * Built from a {@link User} (their stored preferences) or from the contact
 * details a guest typed (default preferences: e-mail on, WhatsApp on when a
 * phone exists, SMS off). The phone is normalised to E.164 here, once.
 *
 * @param reference business key for the log: order number, job number, ...
 */
public record Recipient(
        String name,
        String email,
        String phone,
        boolean notifyEmail,
        boolean notifyWhatsapp,
        boolean notifySms,
        String reference) {

    /** Default when a user has never touched the toggles. */
    public static boolean defaultEmail(User user) {
        return user == null || user.getNotifyEmail() == null || user.getNotifyEmail();
    }

    public static boolean defaultWhatsapp(User user) {
        if (user == null || user.getNotifyWhatsapp() == null) {
            return user != null && PhoneNumbers.toE164(user.getPhone()) != null;
        }
        return user.getNotifyWhatsapp();
    }

    public static boolean defaultSms(User user) {
        return user != null && user.getNotifySms() != null && user.getNotifySms();
    }

    /** A signed-in customer with their stored preferences. */
    public static Recipient of(User user, String reference) {
        if (user == null) {
            return new Recipient(null, null, null, false, false, false, reference);
        }
        String name = join(user.getFirstName(), user.getLastName());
        return new Recipient(
                name.isEmpty() ? "Customer" : name,
                blankToNull(user.getEmail()),
                PhoneNumbers.toE164(user.getPhone()),
                defaultEmail(user),
                defaultWhatsapp(user),
                defaultSms(user),
                reference);
    }

    /**
     * A signed-in customer, but with contact details taken from the business
     * object when the profile lacks them (repair/exchange forms ask for a phone
     * even when signed in).
     */
    public static Recipient of(User user, String fallbackName, String fallbackEmail, String fallbackPhone, String reference) {
        if (user == null) {
            return guest(fallbackName, fallbackEmail, fallbackPhone, reference);
        }
        Recipient base = of(user, reference);
        String email = base.email() != null ? base.email() : blankToNull(fallbackEmail);
        String phone = base.phone() != null ? base.phone() : PhoneNumbers.toE164(fallbackPhone);
        boolean whatsapp = user.getNotifyWhatsapp() == null ? phone != null : user.getNotifyWhatsapp();
        String name = "Customer".equals(base.name()) && fallbackName != null && !fallbackName.isBlank()
                ? fallbackName.trim() : base.name();
        return new Recipient(name, email, phone, base.notifyEmail(), whatsapp, base.notifySms(), reference);
    }

    /** Guest (no account): the details they gave, default preferences. */
    public static Recipient guest(String name, String email, String phone, String reference) {
        String e164 = PhoneNumbers.toE164(phone);
        return new Recipient(
                name == null || name.isBlank() ? "Customer" : name.trim(),
                blankToNull(email),
                e164,
                true,
                e164 != null,
                false,
                reference);
    }

    /** Same recipient, different business reference. */
    public Recipient withReference(String newReference) {
        return new Recipient(name, email, phone, notifyEmail, notifyWhatsapp, notifySms, newReference);
    }

    public boolean hasEmail() {
        return email != null && !email.isBlank();
    }

    public boolean hasPhone() {
        return phone != null && !phone.isBlank();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String join(String a, String b) {
        String left = a == null ? "" : a.trim();
        String right = b == null ? "" : b.trim();
        if (left.isEmpty()) return right;
        if (right.isEmpty()) return left;
        return left + " " + right;
    }
}
