package com.jewelry.backend.service;

import com.jewelry.backend.entity.CustomInquiry;
import com.jewelry.backend.repository.CustomInquiryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CustomInquiryService {

    private final CustomInquiryRepository customInquiryRepository;
    private final StorageService storageService;

    public CustomInquiry createInquiry(String name, String email, String phone, String concept, MultipartFile file) {
        CustomInquiry inquiry = new CustomInquiry();
        inquiry.setName(name);
        inquiry.setEmail(email);
        inquiry.setPhone(phone);
        inquiry.setConcept(concept);

        if (file != null && !file.isEmpty()) {
            try {
                String url = storageService.uploadFile(file);
                inquiry.setAttachmentUrl(url);
            } catch (Exception e) {
                java.util.logging.Logger.getLogger(CustomInquiryService.class.getName())
                    .log(java.util.logging.Level.WARNING, "Failed to upload file", e);
            }
        }

        return customInquiryRepository.save(inquiry);
    }

    public List<CustomInquiry> getAllInquiries() {
        return customInquiryRepository.findAll();
    }

    public CustomInquiry updateStatus(Long id, String status) {
        CustomInquiry inquiry = customInquiryRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Inquiry not found"));
        inquiry.setStatus(status);
        return customInquiryRepository.save(inquiry);
    }
}
