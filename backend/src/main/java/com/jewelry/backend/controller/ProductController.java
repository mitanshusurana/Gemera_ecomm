package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CategoryResponse;
import com.jewelry.backend.dto.DeliveryAvailability;
import com.jewelry.backend.dto.ProductDTO;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.ProductService;
import com.jewelry.backend.service.StorageService;
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

@RestController
@RequestMapping("/api/v1/products")
@CrossOrigin(origins = "*")
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
        return ResponseEntity.ok(entityMapper.toProductDTO(productService.getProductById(id)));
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
        try {
            String fileUrl = storageService.uploadFile(file);
            return ResponseEntity.ok(Map.of("url", fileUrl));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file"));
        }
    }
}
