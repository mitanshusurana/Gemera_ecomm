package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CategoryResponse;
import com.jewelry.backend.dto.DeliveryAvailability;
import com.jewelry.backend.dto.ProductDTO;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.ProductService;
import com.jewelry.backend.service.StorageService;
import com.jewelry.backend.util.CustomMultipartFile;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/v1/products")

@Tag(name = "Products", description = "Product catalog APIs")
public class ProductController {

    @Autowired
    ProductService productService;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    StorageService storageService;

    @GetMapping
    @Operation(summary = "Get paginated products")
    public ResponseEntity<Page<ProductDTO>> getAllProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal priceMin,
            @RequestParam(required = false) BigDecimal priceMax,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) List<String> occasions,
            @RequestParam(required = false) List<String> styles,
            @Parameter(hidden = true) Pageable pageable) {
        Page<Product> products = productService.getAllProducts(category, priceMin, priceMax, search, occasions, styles, pageable);
        return ResponseEntity.ok(products.map(entityMapper::toProductDTO));
    }

    @GetMapping("/delivery-availability")
    @Operation(summary = "Check delivery availability")
    public ResponseEntity<DeliveryAvailability> checkDelivery(@RequestParam String pincode) {
        return ResponseEntity.ok(productService.checkDeliveryAvailability(pincode));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get product details")
    public ResponseEntity<ProductDTO> getProductById(@PathVariable UUID id) {
        ProductDTO productDTO = entityMapper.toProductDTO(productService.getProductById(id));
        return ResponseEntity.ok()
                .header("Link", "<https://www.caratloop.com/products/" + id + ">; rel=\"canonical\"")
                .header("X-Robots-Tag", "index, follow")
                .body(productDTO);
    }

    @GetMapping("/categories")
    @Operation(summary = "Get all categories")
    public ResponseEntity<CategoryResponse> getCategories() {
        return ResponseEntity.ok(productService.getCategories());
    }

    @GetMapping("/search")
    @Operation(summary = "Search products")
    public ResponseEntity<Map<String, List<ProductDTO>>> searchProducts(
            @RequestParam String query,
            @RequestParam(defaultValue = "10") int limit) {
        Page<Product> page = productService.getAllProducts(null, null, null, query, null, null, PageRequest.of(0, limit));
        List<ProductDTO> dtos = page.getContent().stream().map(entityMapper::toProductDTO).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("results", dtos));
    }

    // Helper to seed data
    @PostMapping
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Create product (Admin)")
    public ResponseEntity<ProductDTO> createProduct(@RequestBody @jakarta.validation.Valid ProductDTO productDTO) {
        Product product = entityMapper.toProductEntity(productDTO);
        Product created = productService.createProduct(product);
        return ResponseEntity.status(201).body(entityMapper.toProductDTO(created));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Update product (Admin)")
    public ResponseEntity<ProductDTO> updateProduct(@PathVariable UUID id, @RequestBody @jakarta.validation.Valid ProductDTO productDTO) {
        Product product = entityMapper.toProductEntity(productDTO);
        Product updated = productService.updateProduct(id, product);
        return ResponseEntity.ok(entityMapper.toProductDTO(updated));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Delete product (Admin)")
    public ResponseEntity<Void> deleteProduct(@PathVariable UUID id) {
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/upload-image")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Upload image to Cloudflare R2")
    public ResponseEntity<Map<String, String>> uploadImage(@RequestParam("file") MultipartFile file) {
        Path tempInputFile = null;
        Path tempWebpFile = null;
        try {
            String contentType = file.getContentType();
            if (contentType != null && contentType.startsWith("image/") && !contentType.equals("image/webp")) {

                String originalExtension = ".jpg";
                if (file.getOriginalFilename() != null && file.getOriginalFilename().contains(".")) {
                    originalExtension = file.getOriginalFilename().substring(file.getOriginalFilename().lastIndexOf("."));
                }
                tempInputFile = Files.createTempFile("image_in_", originalExtension);
                tempWebpFile = Files.createTempFile("image_out_", ".webp");
                file.transferTo(tempInputFile.toFile());

                // Execute ImageMagick to optimize and convert to WebP
                // Using parameters to preserve quality, natural lighting, and enhance jewelry sparkle
                ProcessBuilder processBuilder = new ProcessBuilder(
                        "magick", tempInputFile.toAbsolutePath().toString(),
                        "-quality", "85",
                        "-auto-level",
                        "-enhance",
                        tempWebpFile.toAbsolutePath().toString()
                );
                processBuilder.redirectErrorStream(true);
                Process process = processBuilder.start();

                // Consume process output to prevent deadlocks
                java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
                executor.submit(() -> {
                    try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()))) {
                        String line;
                        java.util.logging.Logger logger = java.util.logging.Logger.getLogger(ProductController.class.getName());
                        while ((line = reader.readLine()) != null) {
                            logger.fine("imagemagick: " + line);
                        }
                    } catch (IOException e) {
                        java.util.logging.Logger.getLogger(ProductController.class.getName()).severe("Error reading imagemagick output: " + e.getMessage());
                    }
                });

                try {
                    int exitCode = process.waitFor();
                    executor.shutdown();
                    if (exitCode == 0 && Files.exists(tempWebpFile) && Files.size(tempWebpFile) > 0) {
                        CustomMultipartFile customFile = new CustomMultipartFile(tempWebpFile, "image/webp");
                        String fileUrl = storageService.uploadFile(customFile);
                        return ResponseEntity.ok(Map.of("url", fileUrl));
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return ResponseEntity.internalServerError().body(Map.of("error", "Image processing interrupted"));
                }
            }

            // Fallback to original
            String fileUrl = storageService.uploadFile(file);
            return ResponseEntity.ok(Map.of("url", fileUrl));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file"));
        } finally {
            if (tempInputFile != null) {
                try {
                    Files.deleteIfExists(tempInputFile);
                } catch (IOException ignored) {}
            }
            if (tempWebpFile != null) {
                try {
                    Files.deleteIfExists(tempWebpFile);
                } catch (IOException ignored) {}
            }
        }
    }

    @PostMapping("/upload-video")
    @PreAuthorize("hasAuthority('ADMIN')")
    @Operation(summary = "Upload video and strip audio asynchronously")
    public ResponseEntity<Map<String, String>> uploadVideo(@RequestParam("file") MultipartFile file) {
        Path tempInputFile = null;
        Path tempOutputFile = null;
        try {
            // Write the uploaded video to a temporary file
            tempInputFile = Files.createTempFile("video_in_", ".mp4");
            tempOutputFile = Files.createTempFile("video_out_", ".mp4");
            file.transferTo(tempInputFile.toFile());

            // Synchronously process video with fast ffmpeg operation
            ProcessBuilder processBuilder = new ProcessBuilder(
                    "ffmpeg", "-y", "-i", tempInputFile.toAbsolutePath().toString(),
                    "-c", "copy", "-an", tempOutputFile.toAbsolutePath().toString()
            );
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();

            // Consume the process output on a separate thread to avoid deadlocks
            java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
            executor.submit(() -> {
                try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()))) {
                    String line;
                    java.util.logging.Logger logger = java.util.logging.Logger.getLogger(ProductController.class.getName());
                    while ((line = reader.readLine()) != null) {
                        logger.fine("ffmpeg: " + line); // Log instead of silently ignoring
                    }
                } catch (IOException e) {
                    java.util.logging.Logger.getLogger(ProductController.class.getName()).severe("Error reading ffmpeg output: " + e.getMessage());
                }
            });

            try {
                int exitCode = process.waitFor();
                executor.shutdown();
                if (exitCode != 0) {
                    // Fall back to original file if ffmpeg fails (e.g. format issues, or existing no-audio)
                    CustomMultipartFile customFile = new CustomMultipartFile(tempInputFile, file.getContentType() != null ? file.getContentType() : "video/mp4");
                    String fallbackUrl = storageService.uploadFile(customFile);
                    return ResponseEntity.ok(Map.of("url", fallbackUrl));
                }

                // Upload the processed video
                CustomMultipartFile customFile = new CustomMultipartFile(tempOutputFile, "video/mp4");
                String fileUrl = storageService.uploadFile(customFile);

                return ResponseEntity.ok(Map.of("url", fileUrl));

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return ResponseEntity.internalServerError().body(Map.of("error", "Video processing interrupted"));
            }

        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file"));
        } finally {
            // Cleanup temporary files
            if (tempInputFile != null) {
                try {
                    Files.deleteIfExists(tempInputFile);
                } catch (IOException ignored) {}
            }
            if (tempOutputFile != null) {
                try {
                    Files.deleteIfExists(tempOutputFile);
                } catch (IOException ignored) {}
            }
        }
    }
}
