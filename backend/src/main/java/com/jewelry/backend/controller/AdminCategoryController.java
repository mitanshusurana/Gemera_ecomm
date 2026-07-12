package com.jewelry.backend.controller;

import com.jewelry.backend.dto.CategoryDTO;
import com.jewelry.backend.dto.CategoryResponse;
import com.jewelry.backend.entity.Category;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.CategoryRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/v1/admin/categories")
@Tag(name = "Admin Categories", description = "Admin API for managing categories")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
public class AdminCategoryController {

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private EntityMapper entityMapper;

    @GetMapping
    @Operation(summary = "Get all categories (including inactive)")
    public ResponseEntity<CategoryResponse> getAllCategories() {
        List<Category> allCategories = categoryRepository.findAll();
        List<Category> roots = allCategories.stream()
                .filter(c -> c.getParent() == null)
                .collect(Collectors.toList());
        return ResponseEntity.ok(new CategoryResponse(roots.stream().map(entityMapper::toCategoryDTO).collect(Collectors.toList())));
    }

    @PostMapping
    @Operation(summary = "Create a category")
    public ResponseEntity<CategoryDTO> createCategory(@RequestBody CategoryDTO dto) {
        Category category = entityMapper.toCategoryEntity(dto);
        if (dto.getParentId() != null) {
            Category parent = categoryRepository.findById(dto.getParentId())
                    .orElseThrow(() -> new RuntimeException("Parent category not found"));
            category.setParent(parent);
        }
        Category saved = categoryRepository.save(category);
        return ResponseEntity.ok(entityMapper.toCategoryDTO(saved));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a category")
    public ResponseEntity<CategoryDTO> updateCategory(@PathVariable UUID id, @RequestBody CategoryDTO dto) {
        Category existing = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found"));

        existing.setName(dto.getName());
        existing.setDisplayName(dto.getDisplayName());
        existing.setImage(dto.getImage());
        existing.setActive(dto.isActive());
        existing.setShowJewelryFields(dto.isShowJewelryFields());
        existing.setShowGemstoneFields(dto.isShowGemstoneFields());
        existing.setShowComponentFields(dto.isShowComponentFields());
        existing.setShowIdolFields(dto.isShowIdolFields());
        existing.setShowRoughFields(dto.isShowRoughFields());

        if (dto.getParentId() != null) {
            if (existing.getParent() == null || !existing.getParent().getId().equals(dto.getParentId())) {
                Category parent = categoryRepository.findById(dto.getParentId())
                        .orElseThrow(() -> new RuntimeException("Parent category not found"));
                // Prevent cyclic dependency for basic case
                if (parent.getId().equals(existing.getId())) {
                    throw new RuntimeException("Category cannot be its own parent");
                }
                existing.setParent(parent);
            }
        } else {
            existing.setParent(null);
        }

        Category saved = categoryRepository.save(existing);
        return ResponseEntity.ok(entityMapper.toCategoryDTO(saved));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a category")
    public ResponseEntity<Void> deleteCategory(@PathVariable UUID id) {
        if (!categoryRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        categoryRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
