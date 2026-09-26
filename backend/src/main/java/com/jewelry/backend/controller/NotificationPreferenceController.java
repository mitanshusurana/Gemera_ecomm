package com.jewelry.backend.controller;

import com.jewelry.backend.dto.NotificationDtos.Preferences;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.service.notification.Recipient;
import com.jewelry.backend.util.PhoneNumbers;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;

/**
 * The signed-in customer's channel toggles. Null columns mean "never set";
 * the response resolves them to the effective defaults (e-mail on, WhatsApp
 * on when a phone exists, SMS off) so the storefront shows what will happen.
 */
@RestController
@RequestMapping("/api/v1/users/me/notification-preferences")
@Tag(name = "Notification preferences", description = "E-mail, WhatsApp and SMS toggles of the signed-in customer")
public class NotificationPreferenceController {

    @Autowired
    UserRepository userRepository;

    @GetMapping
    @Operation(summary = "Effective notification preferences of the signed-in user")
    public ResponseEntity<Preferences> get(Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElseThrow();
        return ResponseEntity.ok(toDto(user));
    }

    @PutMapping
    @Transactional
    @Operation(summary = "Update notification preferences; a phone, when given, is stored on the profile in E.164")
    public ResponseEntity<Preferences> update(@RequestBody Preferences body, Principal principal) {
        User user = userRepository.findByEmail(principal.getName()).orElseThrow();
        if (body == null) {
            return ResponseEntity.ok(toDto(user));
        }
        if (body.phone() != null) {
            String raw = body.phone().trim();
            if (raw.isEmpty()) {
                user.setPhone(null);
            } else {
                String e164 = PhoneNumbers.toE164(raw);
                if (e164 == null) {
                    throw new IllegalArgumentException("Enter a valid mobile number (10 digits, or with country code).");
                }
                user.setPhone(e164);
            }
        }
        if (body.notifyEmail() != null) {
            user.setNotifyEmail(body.notifyEmail());
        }
        if (body.notifyWhatsapp() != null) {
            user.setNotifyWhatsapp(body.notifyWhatsapp());
        }
        if (body.notifySms() != null) {
            user.setNotifySms(body.notifySms());
        }
        boolean hasPhone = PhoneNumbers.toE164(user.getPhone()) != null;
        if (!hasPhone && (Boolean.TRUE.equals(user.getNotifyWhatsapp()) || Boolean.TRUE.equals(user.getNotifySms()))) {
            throw new IllegalArgumentException("Add a mobile number to receive WhatsApp or SMS messages.");
        }
        return ResponseEntity.ok(toDto(userRepository.save(user)));
    }

    static Preferences toDto(User user) {
        String phone = PhoneNumbers.toE164(user.getPhone());
        return new Preferences(
                Recipient.defaultEmail(user),
                Recipient.defaultWhatsapp(user),
                Recipient.defaultSms(user),
                phone != null ? phone : (user.getPhone() == null ? "" : user.getPhone()));
    }
}
