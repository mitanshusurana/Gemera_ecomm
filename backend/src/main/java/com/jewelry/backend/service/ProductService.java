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
        return productRepository.save(product);
    }

    public void deleteProduct(UUID id) {
        productRepository.deleteById(id);
    }
}
