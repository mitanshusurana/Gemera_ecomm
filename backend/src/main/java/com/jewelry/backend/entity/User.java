package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users")
@Data
@EqualsAndHashCode(callSuper = true)
public class User extends BaseEntity {
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    private String phone;
    private String role; // USER, or a staff role from StaffPermissions (ADMIN, MANAGER, SALES, INVENTORY, ACCOUNTS, SUPPORT)

    /**
     * Staff accounts can be switched off without deleting them (their audit
     * trail stays). Null (rows created before the column existed) counts as
     * active, see {@link #isActiveAccount()}.
     */
    private Boolean active = true;

    /** Current redeemable points balance; kept in step with the LoyaltyTransaction ledger by LoyaltyService. */
    private Integer loyaltyPoints = 0;

    /** Share code (e.g. PRIYA-7K2Q), generated once and unique; see LoyaltyService. */
    @Column(unique = true)
    private String referralCode;

    /** Customer who referred this one (their referralCode was entered at registration). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "referred_by_id")
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private User referredBy;

    /** True once both sides received the referral bonus (the referee's first paid order). */
    private Boolean referralBonusPaid;

    /**
     * Notification channel preferences (service/notification). Null means
     * "never set": e-mail on, WhatsApp on when a phone exists, SMS off; see
     * {@code Recipient.of(User, ...)}.
     */
    private Boolean notifyEmail;
    private Boolean notifyWhatsapp;
    private Boolean notifySms;

    private String resetToken;
    private java.time.LocalDateTime resetTokenExpiry;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @ToString.Exclude
    private List<Address> addresses = new ArrayList<>();

    public boolean isActiveAccount() {
        return active == null || active;
    }
}
