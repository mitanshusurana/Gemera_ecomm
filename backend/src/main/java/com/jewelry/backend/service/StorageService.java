package com.jewelry.backend.service;

import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;

public interface StorageService {
    String uploadFile(MultipartFile file) throws IOException;
    String uploadFileFromPath(java.nio.file.Path filePath, String contentType) throws IOException;
}