package com.jewelry.backend.util;

import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

public class CustomMultipartFile implements MultipartFile {

    private final Path filePath;
    private final String contentType;
    private final String originalFilename;

    public CustomMultipartFile(Path filePath, String contentType) {
        this.filePath = filePath;
        this.contentType = contentType;
        this.originalFilename = filePath.getFileName().toString();
    }

    @Override
    public String getName() {
        return originalFilename;
    }

    @Override
    public String getOriginalFilename() {
        return originalFilename;
    }

    @Override
    public String getContentType() {
        return contentType;
    }

    @Override
    public boolean isEmpty() {
        try {
            return Files.size(filePath) == 0;
        } catch (IOException e) {
            return true;
        }
    }

    @Override
    public long getSize() {
        try {
            return Files.size(filePath);
        } catch (IOException e) {
            return 0;
        }
    }

    @Override
    public byte[] getBytes() throws IOException {
        return Files.readAllBytes(filePath);
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return Files.newInputStream(filePath);
    }

    @Override
    public void transferTo(File dest) throws IOException, IllegalStateException {
        Files.copy(filePath, dest.toPath());
    }
}
