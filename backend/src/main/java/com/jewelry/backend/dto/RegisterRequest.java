package com.jewelry.backend.dto;

import lombok.Data;

@Data
public class RegisterRequest {
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    private String phone;
    /** Optional: another customer's referral code (LoyaltyService); unknown codes are ignored. */
    private String referralCode;
}
