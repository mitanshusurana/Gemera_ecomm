package com.jewelry.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.core.io.ByteArrayResource;

@Service
public class Product3DGenerationService {

    private final String THREE_D_SERVICE_URL = "http://jewelry-3d-service:8000/api/v1/generate3d";
    private final RestTemplate restTemplate;

    public Product3DGenerationService() {
        this.restTemplate = new RestTemplate();
    }

    public byte[] generate3DModel(MultipartFile imageFile) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        
        // Wrap the file byte array to pass it to RestTemplate
        ByteArrayResource fileAsResource = new ByteArrayResource(imageFile.getBytes()) {
            @Override
            public String getFilename() {
                return imageFile.getOriginalFilename();
            }
        };
        
        body.add("file", fileAsResource);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        ResponseEntity<byte[]> response = restTemplate.postForEntity(
            THREE_D_SERVICE_URL, 
            requestEntity, 
            byte[].class
        );

        if (response.getStatusCode().is2xxSuccessful()) {
            return response.getBody();
        } else {
            throw new RuntimeException("Failed to generate 3D model. Status: " + response.getStatusCode());
        }
    }
}
