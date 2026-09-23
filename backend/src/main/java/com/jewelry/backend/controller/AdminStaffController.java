package com.jewelry.backend.controller;

import com.jewelry.backend.dto.StaffRequests;
import com.jewelry.backend.dto.StaffRequests.StaffUserDTO;
import com.jewelry.backend.service.StaffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Staff accounts (every user whose role is not USER). Owner only:
 * {@code staff.manage} is held by ADMIN alone.
 */
@RestController
@RequestMapping("/api/v1/admin/staff")
@PreAuthorize("@access.has('staff.manage')")
@Tag(name = "Admin Staff", description = "Back-office accounts, roles and access")
public class AdminStaffController {

    @Autowired
    StaffService staffService;

    @GetMapping
    @Operation(summary = "List staff accounts (id, name, email, role, active)")
    public ResponseEntity<List<StaffUserDTO>> list() {
        return ResponseEntity.ok(staffService.list());
    }

    @GetMapping("/roles")
    @Operation(summary = "Staff roles with a one-line scope description and their permission keys")
    public ResponseEntity<List<StaffRequests.RoleInfo>> roles() {
        return ResponseEntity.ok(staffService.roles());
    }

    @PostMapping
    @Operation(summary = "Create a staff account: {name, email, role, password}; role must be a staff role, email unique")
    public ResponseEntity<StaffUserDTO> create(@Valid @RequestBody StaffRequests.Create body) {
        return ResponseEntity.status(201).body(staffService.create(body));
    }

    @PutMapping("/{id}/role")
    @Operation(summary = "Change a staff account's role; refuses your own account and the last active ADMIN")
    public ResponseEntity<StaffUserDTO> changeRole(@PathVariable UUID id, @Valid @RequestBody StaffRequests.ChangeRole body) {
        return ResponseEntity.ok(staffService.changeRole(id, body.role()));
    }

    @PutMapping("/{id}/active")
    @Operation(summary = "Activate or deactivate; refuses your own account and the last active ADMIN")
    public ResponseEntity<StaffUserDTO> setActive(@PathVariable UUID id, @Valid @RequestBody StaffRequests.SetActive body) {
        return ResponseEntity.ok(staffService.setActive(id, body.active()));
    }

    @PostMapping("/{id}/reset-password")
    @Operation(summary = "Set a new password for a staff account")
    public ResponseEntity<Map<String, String>> resetPassword(@PathVariable UUID id, @Valid @RequestBody StaffRequests.ResetPassword body) {
        staffService.resetPassword(id, body.password());
        return ResponseEntity.ok(Map.of("message", "Password updated."));
    }
}
