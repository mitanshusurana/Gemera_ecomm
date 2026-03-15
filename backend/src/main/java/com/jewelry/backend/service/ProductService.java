package com.jewelry.backend.service;

import com.jewelry.backend.dto.CategoryResponse;
import com.jewelry.backend.dto.DeliveryAvailability;
import com.jewelry.backend.entity.Category;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.CategoryRepository;
import com.jewelry.backend.repository.ProductRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProductService {

    @Autowired
    ProductRepository productRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    EntityMapper entityMapper;

    public Page<Product> getAllProducts(
            String category,
            BigDecimal priceMin,
            BigDecimal priceMax,
            String search,
            List<String> occasions,
            List<String> styles,
            Pageable pageable) {

        return productRepository.findWithFilters(category, priceMin, priceMax, search, occasions, styles, pageable);
    }

    public DeliveryAvailability checkDeliveryAvailability(String pincode) {
        // Simple logic: allow if pincode is not null/empty
        if (pincode == null || pincode.length() < 6) {
             return new DeliveryAvailability(false, null, "Invalid Pincode");
        }
        // Mock availability
        return new DeliveryAvailability(true, "2023-12-31", "Delivery available in 3-5 days");
    }

    public Product getProductById(UUID id) {
        return productRepository.findById(id).orElseThrow(() -> new RuntimeException("Product not found"));
    }

    public CategoryResponse getCategories() {
        List<Category> allCategories = categoryRepository.findAll();
        // Return only root categories to avoid duplication (children are included in parents)
        List<Category> roots = allCategories.stream()
                .filter(c -> c.getParent() == null)
                .collect(Collectors.toList());
        return new CategoryResponse(roots.stream().map(entityMapper::toCategoryDTO).collect(Collectors.toList()));
    }

    // Admin only - strictly for seeding/testing
    public Product createProduct(Product product) {
        if (product.getSku() == null || product.getSku().trim().isEmpty()) {
            product.setSku(generateSku(product));
        }
        return productRepository.save(product);
    }

    private String generateSku(Product product) {
        // Generate SKU based on formula: [Category]-[Material]-[Purity]-[UniqueID]
        StringBuilder skuBuilder = new StringBuilder();

        // 1. Category Abbreviation
        String category = product.getCategory();
        if (category != null && !category.isEmpty()) {
            skuBuilder.append(category.substring(0, Math.min(category.length(), 2)).toUpperCase());
        } else {
            skuBuilder.append("UN"); // Unknown
        }
        skuBuilder.append("-");

        // 2. Material & 3. Purity
        if ("Finished Jewelry".equalsIgnoreCase(category) || "Ring Setting".equalsIgnoreCase(category)) {
            String material = product.getMetalType() != null ? product.getMetalType().substring(0, Math.min(product.getMetalType().length(), 2)).toUpperCase() : "XX";
            String purity = product.getMetalPurity() != null ? product.getMetalPurity().replaceAll("[^0-9]", "") : "00";
            skuBuilder.append(material).append(purity).append("-");
        } else if ("Loose Gemstone".equalsIgnoreCase(category)) {
            String variety = product.getVariety() != null ? product.getVariety().substring(0, Math.min(product.getVariety().length(), 3)).toUpperCase() : "XXX";
            skuBuilder.append(variety).append("-");
        } else if ("Spiritual Idol".equalsIgnoreCase(category)) {
            String material = product.getGemstoneMaterial() != null ? product.getGemstoneMaterial().substring(0, Math.min(product.getGemstoneMaterial().length(), 3)).toUpperCase() : "XXX";
            skuBuilder.append(material).append("-");
        } else if ("Precious Metal".equalsIgnoreCase(category) || "Component".equalsIgnoreCase(category)) {
             String material = product.getMaterial() != null ? product.getMaterial().substring(0, Math.min(product.getMaterial().length(), 2)).toUpperCase() : "XX";
             String purity = product.getPurity() != null ? product.getPurity().replaceAll("[^0-9]", "") : "00";
             skuBuilder.append(material).append(purity).append("-");
        } else {
             skuBuilder.append("XX00-");
        }

        // 4. Unique ID
        // Generate a random 4 digit hex or use database sequence (we use random hex for simplicity here since no sequence exists before save)
        String uniqueId = UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        skuBuilder.append(uniqueId);

        return skuBuilder.toString();
    }

    public void deleteProduct(UUID id) {
        productRepository.deleteById(id);
    }
}
