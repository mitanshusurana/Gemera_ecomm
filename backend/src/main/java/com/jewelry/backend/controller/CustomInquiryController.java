package com.jewelry.backend.controller;

import com.jewelry.backend.entity.CustomInquiry;
import com.jewelry.backend.service.CustomInquiryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/inquiries")
@RequiredArgsConstructor
public class CustomInquiryController {

    private final CustomInquiryService customInquiryService;

    @PostMapping
    public ResponseEntity<CustomInquiry> createInquiry(
            @RequestParam("name") String name,
            @RequestParam("email") String email,
            @RequestParam("phone") String phone,
            @RequestParam("concept") String concept,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.ok(customInquiryService.createInquiry(name, email, phone, concept, file));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<List<CustomInquiry>> getAllInquiries() {
        return ResponseEntity.ok(customInquiryService.getAllInquiries());
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<CustomInquiry> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(customInquiryService.updateStatus(id, payload.get("status")));
    }
}
