package com.jewelry.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.UUID;

/** Request and response bodies of /api/v1/admin/staff. */
public final class StaffRequests {

    private StaffRequests() {
    }

    /** One back-office account as the staff page lists it. */
    public record StaffUserDTO(
            UUID id,
            String name,
            String firstName,
            String lastName,
            String email,
            String role,
            boolean active,
            LocalDateTime createdAt) {
    }

    /** POST /admin/staff */
    public record Create(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank String role,
            @NotBlank @Size(min = 8, max = 128) String password) {
    }

    /** PUT /admin/staff/{id}/role */
    public record ChangeRole(@NotBlank String role) {
    }

    /** PUT /admin/staff/{id}/active */
    public record SetActive(@NotNull Boolean active) {
    }

    /** POST /admin/staff/{id}/reset-password */
    public record ResetPassword(@NotBlank @Size(min = 8, max = 128) String password) {
    }

    /** One entry of the role picker: the role and a one-line scope description. */
    public record RoleInfo(String role, String description, java.util.List<String> permissions) {
    }
}
