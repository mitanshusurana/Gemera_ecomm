package com.jewelry.backend.controller;

import com.jewelry.backend.dto.RepairJobDTO;
import com.jewelry.backend.dto.RepairRequests;
import com.jewelry.backend.dto.RepairTrackingDTO;
import com.jewelry.backend.service.RepairJobService;
import com.jewelry.backend.service.StorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Customer side of repair and service jobs. Guests may book, track and
 * approve with the job number and phone; signed-in customers also get
 * {@code /mine}. Public paths are opened in SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/repairs")
@Tag(name = "Repairs", description = "Repair and service jobs: request, track, approve estimate")
public class RepairController {

    private static final long MAX_PHOTO_BYTES = 8L * 1024 * 1024;
    private static final Set<String> PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif");

    @Autowired
    RepairJobService repairJobService;

    @Autowired
    StorageService storageService;

    @PostMapping("/requests")
    @Operation(summary = "Book a repair or service job (signed in or guest with name, phone and email)")
    public ResponseEntity<RepairJobDTO> create(@Valid @RequestBody RepairRequests.Create request, Principal principal) {
        return ResponseEntity.status(201).body(repairJobService.create(request, principal == null ? null : principal.getName()));
    }

    @GetMapping("/mine")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "The signed-in customer's repair jobs, newest first")
    public ResponseEntity<List<RepairJobDTO>> mine(Principal principal) {
        return ResponseEntity.ok(repairJobService.mine(principal.getName()));
    }

    @GetMapping("/track/{jobNumber}")
    @Operation(summary = "Track a job by number and phone (public); the signed-in owner needs no phone")
    public ResponseEntity<RepairTrackingDTO> track(@PathVariable String jobNumber,
                                                   @RequestParam(required = false) String phone,
                                                   Principal principal) {
        return ResponseEntity.ok(repairJobService.track(jobNumber, phone, principal == null ? null : principal.getName()));
    }

    @PostMapping("/{jobNumber}/approve-estimate")
    @Operation(summary = "Customer approves the estimate: ASSESSED to APPROVED")
    public ResponseEntity<RepairTrackingDTO> approveEstimate(@PathVariable String jobNumber,
                                                             @RequestParam(required = false) String phone,
                                                             Principal principal) {
        return ResponseEntity.ok(repairJobService.approveEstimate(jobNumber, phone, principal == null ? null : principal.getName()));
    }

    /**
     * Photo of the piece for the request form. Images only, 8 MB max, stored
     * through the same StorageService the product images use.
     */
    @PostMapping("/photos")
    @Operation(summary = "Upload a photo for a repair request; returns its URL")
    public ResponseEntity<Map<String, String>> uploadPhoto(@RequestParam("file") MultipartFile file) {
        String type = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (file.isEmpty() || !PHOTO_TYPES.contains(type)) {
            throw new IllegalArgumentException("Please upload a JPEG, PNG or WebP photo");
        }
        if (file.getSize() > MAX_PHOTO_BYTES) {
            throw new IllegalArgumentException("Photos must be 8 MB or smaller");
        }
        try {
            return ResponseEntity.ok(Map.of("url", storageService.uploadFile(file)));
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("Photo upload is not available right now; you can send the request without photos");
        }
    }
}
