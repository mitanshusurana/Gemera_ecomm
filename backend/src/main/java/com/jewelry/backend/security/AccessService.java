package com.jewelry.backend.security;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Permission checks against the current request's Authentication.
 *
 * Registered as the {@code access} bean so controllers can write
 * {@code @PreAuthorize("@access.has('orders.write')")}. The role is read from
 * the {@code ROLE_*} authority that {@link com.jewelry.backend.service.UserDetailsServiceImpl}
 * grants; the matrix is {@link StaffPermissions}.
 */
@Component("access")
public class AccessService {

    /** True when the signed-in principal's role carries {@code permission}. */
    public boolean has(String permission) {
        return StaffPermissions.roleHas(currentRole(), permission);
    }

    /** True when the principal has at least one of the permissions. */
    public boolean hasAny(String... permissions) {
        String role = currentRole();
        for (String p : permissions) {
            if (StaffPermissions.roleHas(role, p)) {
                return true;
            }
        }
        return false;
    }

    /** True for every back-office role (anything but USER / anonymous). */
    public boolean isStaff() {
        return StaffPermissions.isStaffRole(currentRole());
    }

    /** "ADMIN", "SALES", "USER", ... without the ROLE_ prefix; null when unauthenticated. */
    public String currentRole() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return null;
        }
        for (GrantedAuthority a : auth.getAuthorities()) {
            String name = a.getAuthority();
            if (name != null && name.startsWith("ROLE_")) {
                return StaffPermissions.normalizeRole(name);
            }
        }
        return null;
    }

    /** Email (JWT subject) of the signed-in principal, or null. */
    public String currentEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return null;
        }
        return auth.getName();
    }

    /** Email of the signed-in principal, or {@code fallback} for system / unauthenticated calls. */
    public String currentEmailOr(String fallback) {
        String email = currentEmail();
        return email == null || email.isBlank() ? fallback : email;
    }

    /** True when there is no signed-in principal at all (scheduler, webhook, startup). */
    public boolean isSystemContext() {
        return currentRole() == null && currentEmail() == null;
    }

    public Set<String> currentPermissions() {
        return StaffPermissions.permissionsFor(currentRole());
    }
}
