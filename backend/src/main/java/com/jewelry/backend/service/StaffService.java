package com.jewelry.backend.service;

import com.jewelry.backend.dto.StaffRequests;
import com.jewelry.backend.dto.StaffRequests.StaffUserDTO;
import com.jewelry.backend.entity.AuditLog;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.AuditLogRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.security.AccessService;
import com.jewelry.backend.security.StaffPermissions;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Back-office accounts: anyone whose role is not USER. The owner (ADMIN)
 * creates them, changes their role, switches them off and resets passwords.
 *
 * Two invariants keep the owner from locking everyone out: you cannot demote
 * or deactivate yourself, and the last active ADMIN cannot be demoted or
 * deactivated. Every change lands in the audit log under the real principal.
 */
@Service
public class StaffService {

    @Autowired
    UserRepository userRepository;

    @Autowired
    AuditLogRepository auditLogRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    AccessService access;

    @Transactional(readOnly = true)
    public List<StaffUserDTO> list() {
        return userRepository.findByRoleNotOrderByCreatedAtAsc(StaffPermissions.ROLE_USER).stream()
                .map(StaffService::toDto)
                .collect(Collectors.toList());
    }

    public List<StaffRequests.RoleInfo> roles() {
        return StaffPermissions.STAFF_ROLES.stream()
                .map(r -> new StaffRequests.RoleInfo(r, StaffPermissions.describe(r),
                        List.copyOf(StaffPermissions.permissionsFor(r))))
                .collect(Collectors.toList());
    }

    @Transactional
    public StaffUserDTO create(StaffRequests.Create req) {
        String role = requireStaffRole(req.role());
        String email = req.email().trim().toLowerCase();
        if (userRepository.findByEmail(email).isPresent()) {
            throw new IllegalArgumentException("An account with that email already exists.");
        }

        String[] names = splitName(req.name());
        User user = new User();
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setFirstName(names[0]);
        user.setLastName(names[1]);
        user.setRole(role);
        user.setActive(true);
        User saved = userRepository.save(user);

        audit("STAFF_CREATE", "Created staff account " + email + " with role " + role + ".");
        return toDto(saved);
    }

    @Transactional
    public StaffUserDTO changeRole(UUID id, String newRole) {
        String role = requireStaffRole(newRole);
        User user = staff(id);
        String oldRole = StaffPermissions.normalizeRole(user.getRole());
        if (role.equals(oldRole)) {
            return toDto(user);
        }
        if (isSelf(user)) {
            throw new IllegalArgumentException("You cannot change your own role.");
        }
        if (StaffPermissions.ROLE_ADMIN.equals(oldRole) && user.isActiveAccount() && countActiveAdmins() <= 1) {
            throw new IllegalArgumentException("This is the last active ADMIN account; promote someone else first.");
        }
        user.setRole(role);
        userRepository.save(user);
        audit("STAFF_ROLE", "Changed role of " + user.getEmail() + " from " + oldRole + " to " + role + ".");
        return toDto(user);
    }

    @Transactional
    public StaffUserDTO setActive(UUID id, boolean active) {
        User user = staff(id);
        if (user.isActiveAccount() == active) {
            return toDto(user);
        }
        if (!active) {
            if (isSelf(user)) {
                throw new IllegalArgumentException("You cannot deactivate your own account.");
            }
            if (StaffPermissions.ROLE_ADMIN.equals(StaffPermissions.normalizeRole(user.getRole()))
                    && countActiveAdmins() <= 1) {
                throw new IllegalArgumentException("This is the last active ADMIN account; it cannot be deactivated.");
            }
        }
        user.setActive(active);
        userRepository.save(user);
        audit(active ? "STAFF_ACTIVATE" : "STAFF_DEACTIVATE",
                (active ? "Reactivated " : "Deactivated ") + user.getEmail() + ".");
        return toDto(user);
    }

    @Transactional
    public void resetPassword(UUID id, String password) {
        User user = staff(id);
        user.setPassword(passwordEncoder.encode(password));
        user.setResetToken(null);
        user.setResetTokenExpiry(null);
        userRepository.save(user);
        audit("STAFF_PASSWORD_RESET", "Reset the password of " + user.getEmail() + ".");
    }

    // ---- helpers ---------------------------------------------------------

    private User staff(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Staff account not found: " + id));
        if (!StaffPermissions.isStaffRole(user.getRole())) {
            throw new EntityNotFoundException("Staff account not found: " + id);
        }
        return user;
    }

    private boolean isSelf(User user) {
        String me = access.currentEmail();
        return me != null && me.equalsIgnoreCase(user.getEmail());
    }

    private long countActiveAdmins() {
        return userRepository.findByRoleNotOrderByCreatedAtAsc(StaffPermissions.ROLE_USER).stream()
                .filter(u -> StaffPermissions.ROLE_ADMIN.equals(StaffPermissions.normalizeRole(u.getRole())))
                .filter(User::isActiveAccount)
                .count();
    }

    private static String requireStaffRole(String role) {
        String r = StaffPermissions.normalizeRole(role);
        if (r == null || !StaffPermissions.isStaffRole(r)) {
            throw new IllegalArgumentException("Role must be one of " + StaffPermissions.STAFF_ROLES + ".");
        }
        return r;
    }

    private static String[] splitName(String name) {
        String n = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        int i = n.indexOf(' ');
        if (i < 0) {
            return new String[] { n, "" };
        }
        return new String[] { n.substring(0, i), n.substring(i + 1) };
    }

    private void audit(String type, String details) {
        AuditLog log = new AuditLog();
        log.setEventType(type);
        log.setDetails(details);
        log.setUserEmail(access.currentEmailOr("system"));
        auditLogRepository.save(log);
    }

    static StaffUserDTO toDto(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String name = (first + " " + last).trim();
        return new StaffUserDTO(
                u.getId(),
                name.isEmpty() ? u.getEmail() : name,
                first,
                last,
                u.getEmail(),
                StaffPermissions.normalizeRole(u.getRole()),
                u.isActiveAccount(),
                u.getCreatedAt());
    }
}
