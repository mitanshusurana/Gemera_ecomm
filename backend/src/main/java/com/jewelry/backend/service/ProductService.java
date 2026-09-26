package com.jewelry.backend.service;

import org.springframework.transaction.annotation.Transactional;

import com.jewelry.backend.dto.CategoryResponse;
import com.jewelry.backend.dto.DeliveryAvailability;
import com.jewelry.backend.dto.ProductFacetsDTO;
import com.jewelry.backend.entity.Category;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.repository.CategoryRepository;
import com.jewelry.backend.repository.ProductRepository;
import com.jewelry.backend.specification.ProductSpecifications;
import com.jewelry.backend.specification.ProductSpecifications.ProductFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;

import com.jewelry.backend.entity.UserProductView;
import com.jewelry.backend.repository.UserProductViewRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.entity.User;
import java.time.LocalDateTime;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;

import jakarta.persistence.EntityNotFoundException;

import java.math.BigDecimal;
import java.beans.PropertyDescriptor;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ProductService {

    @Autowired
    ProductRepository productRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    EntityMapper entityMapper;

    @Autowired
    UserProductViewRepository userProductViewRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ProductRulesService productRulesService;

    @Autowired
    InventoryAlertService inventoryAlertService;

    private static final Pattern NON_DIGIT_PATTERN = Pattern.compile("[^0-9]");

    /**
     * Legacy signature kept for callers that only know the original filters
     * (SitemapController, product search). Delegates to the full filter set.
     */
    @Transactional(readOnly = true)
    public Page<Product> getAllProducts(
            String category,
            BigDecimal priceMin,
            BigDecimal priceMax,
            String search,
            List<String> occasions,
            List<String> styles,
            Pageable pageable) {
        return getAllProducts(category, null, null, null, null, occasions, styles,
                null, null, null, priceMin, priceMax, search, null, null, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Product> getAllProducts(
            String category,
            List<String> subCategories,
            List<String> metals,
            List<String> stones,
            List<String> designStyles,
            List<String> occasions,
            List<String> styles,
            List<String> gemGrades,
            List<String> crafts,
            List<String> saleModes,
            BigDecimal priceMin,
            BigDecimal priceMax,
            String search,
            Boolean certified,
            Boolean featured,
            Pageable pageable) {
        return getAllProducts(category, subCategories, metals, stones, designStyles, occasions, styles,
                gemGrades, crafts, saleModes, priceMin, priceMax, search, certified, featured, null, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Product> getAllProducts(
            String category,
            List<String> subCategories,
            List<String> metals,
            List<String> stones,
            List<String> designStyles,
            List<String> occasions,
            List<String> styles,
            List<String> gemGrades,
            List<String> crafts,
            List<String> saleModes,
            BigDecimal priceMin,
            BigDecimal priceMax,
            String search,
            Boolean certified,
            Boolean featured,
            Boolean lowStock,
            Pageable pageable) {

        Integer lowStockThreshold = Boolean.TRUE.equals(lowStock)
                ? inventoryAlertService.lowStockThreshold()
                : null;
        ProductFilter filter = new ProductFilter(
                category, subCategories, metals, stones, designStyles, occasions, styles,
                gemGrades, crafts, saleModes,
                priceMin, priceMax, search, certified, featured,
                lowStock, lowStockThreshold);
        return productRepository.findAll(ProductSpecifications.withFilter(filter), pageable);
    }

    /** Label QR codes encode the SKU; match is case-insensitive and trimmed. 404 when unknown. */
    @Transactional(readOnly = true)
    public Product getProductBySku(String sku) {
        if (sku == null || sku.trim().isEmpty()) {
            throw new IllegalArgumentException("A SKU is required.");
        }
        return productRepository.findFirstBySkuIgnoreCase(sku.trim())
                .orElseThrow(() -> new EntityNotFoundException("No product with SKU " + sku.trim()));
    }

    @Transactional(readOnly = true)
    public ProductFacetsDTO getFacets() {
        ProductFacetsDTO facets = new ProductFacetsDTO();
        facets.setCategories(distinctSorted(productRepository.findAllCategories()));
        facets.setSubCategories(distinctSorted(productRepository.findDistinctSubCategories()));
        facets.setMetals(distinctSorted(productRepository.findDistinctMetalTypes()));

        List<String> stones = new java.util.ArrayList<>(productRepository.findDistinctStoneTypes());
        stones.addAll(productRepository.findDistinctSpecies());
        facets.setStones(distinctSorted(stones));

        facets.setDesignStyles(distinctSorted(productRepository.findDistinctDesignStyles()));
        facets.setOccasions(distinctSorted(productRepository.findDistinctOccasions()));
        facets.setStyles(distinctSorted(productRepository.findDistinctStyles()));
        facets.setGemGrades(distinctSorted(productRepository.findDistinctGemGrades()));
        facets.setCrafts(distinctSorted(productRepository.findDistinctCrafts()));
        facets.setSaleModes(distinctSorted(productRepository.findDistinctSaleModes()));
        facets.setPriceMin(productRepository.findMinPrice());
        facets.setPriceMax(productRepository.findMaxPrice());
        return facets;
    }

    /**
     * Trims, drops blanks, de-duplicates case-insensitively (first spelling wins)
     * and sorts case-insensitively.
     */
    private static List<String> distinctSorted(List<String> values) {
        if (values == null || values.isEmpty()) {
            return new java.util.ArrayList<>();
        }
        java.util.TreeSet<String> set = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (String value : values) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                set.add(trimmed);
            }
        }
        return new java.util.ArrayList<>(set);
    }

    public DeliveryAvailability checkDeliveryAvailability(String pincode) {
        // Simple logic: allow if pincode is not null/empty
        if (pincode == null || pincode.length() < 6) {
             return new DeliveryAvailability(false, null, "Invalid Pincode");
        }
        // Mock availability
        return new DeliveryAvailability(true, "2023-12-31", "Delivery available in 3-5 days");
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "products", key = "#id")
    public Product getProductById(UUID id) {
        return productRepository.findById(id).orElseThrow(() -> new RuntimeException("Product not found"));
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "categories")
    public CategoryResponse getCategories() {
        List<Category> allCategories = categoryRepository.findAll();
        // Return only active root categories to avoid duplication (children are included in parents)
        List<Category> roots = allCategories.stream()
                .filter(c -> c.getParent() == null && c.isActive())
                .collect(Collectors.toList());
        return new CategoryResponse(roots.stream().map(c -> filterInactiveSubcategoriesDTO(entityMapper.toCategoryDTO(c))).collect(Collectors.toList()));
    }

    private com.jewelry.backend.dto.CategoryDTO filterInactiveSubcategoriesDTO(com.jewelry.backend.dto.CategoryDTO dto) {
        if (dto.getSubcategories() != null) {
            List<com.jewelry.backend.dto.CategoryDTO> activeSubcategories = dto.getSubcategories().stream()
                    .filter(com.jewelry.backend.dto.CategoryDTO::isActive)
                    .map(this::filterInactiveSubcategoriesDTO)
                    .collect(Collectors.toList());
            dto.setSubcategories(activeSubcategories);
        }
        return dto;
    }

    // Admin only - strictly for seeding/testing
    @Transactional(rollbackFor = Exception.class)
    public Product createProduct(Product product) {
        // Item-type rules: sale mode, derived price, required fields (400 on violation)
        String itemType = productRulesService.applyRules(product);
        if (product.getSku() == null || product.getSku().trim().isEmpty()) {
            product.setSku(generateSku(product, itemType));
        }
        if (product.getFeatured() == null) {
            product.setFeatured(Boolean.FALSE); // column is NOT NULL
        }
        product.setCostUpdatedAt(product.getCostPrice() != null ? java.time.LocalDateTime.now() : null);
        return productRepository.save(product);
    }

    private String generateSku(Product product, String itemType) {
        // Formula: [ItemType prefix]-[Category letters]-[Material][Purity]-[UniqueID]
        // Prefixes (contract section 4): JW, ST, LT, RG, ID, SB, CP, SE; unknown -> JW.
        String effectiveType = itemType != null ? itemType : ProductRulesService.JEWELLERY;
        StringBuilder skuBuilder = new StringBuilder();

        // 0. Item type prefix
        skuBuilder.append(ProductRulesService.skuPrefix(effectiveType)).append("-");

        // 1. Category Abbreviation
        String category = product.getCategory();
        if (category != null && !category.isEmpty()) {
            skuBuilder.append(category.substring(0, Math.min(category.length(), 2)).toUpperCase());
        } else {
            skuBuilder.append("UN"); // Unknown
        }
        skuBuilder.append("-");

        // 2. Material & 3. Purity, chosen by item type
        switch (effectiveType) {
            case ProductRulesService.JEWELLERY, ProductRulesService.SET -> {
                String material = "XX";
                String purity = "00";
                if (product.getMetalDetails() != null) {
                    if (product.getMetalDetails().getMetalType() != null) {
                        material = abbreviate(product.getMetalDetails().getMetalType(), 2, "XX");
                    }
                    if (product.getMetalDetails().getMetalPurity() != null) {
                        purity = NON_DIGIT_PATTERN.matcher(product.getMetalDetails().getMetalPurity()).replaceAll("");
                    }
                }
                skuBuilder.append(material).append(purity).append("-");
            }
            case ProductRulesService.LOOSE_GEMSTONE, ProductRulesService.GEMSTONE_LOT -> {
                String stone = product.getVariety() != null && !product.getVariety().isEmpty() ? product.getVariety() : product.getSpecies();
                skuBuilder.append(abbreviate(stone, 3, "XXX")).append("-");
            }
            case ProductRulesService.IDOL_CARVING -> {
                skuBuilder.append(abbreviate(product.getGemstoneMaterial(), 3, "XXX")).append("-");
            }
            case ProductRulesService.ROUGH -> {
                skuBuilder.append(abbreviate(product.getRoughMaterial(), 2, "XX")).append("-");
            }
            case ProductRulesService.COMPONENT, ProductRulesService.STRAND_BEADS -> {
                String material = abbreviate(product.getMaterial(), 2, "XX");
                String purity = product.getPurity() != null && !product.getPurity().isEmpty() ? NON_DIGIT_PATTERN.matcher(product.getPurity()).replaceAll("") : "00";
                skuBuilder.append(material).append(purity).append("-");
            }
            default -> skuBuilder.append("XX00-");
        }

        // 4. Unique ID
        // Generate a random 4 digit hex
        String uniqueId = UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        skuBuilder.append(uniqueId);

        return skuBuilder.toString();
    }

    /** First {@code length} characters upper-cased, or {@code fallback} when blank. */
    private static String abbreviate(String value, int length, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.substring(0, Math.min(trimmed.length(), length)).toUpperCase();
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "products", key = "#id")
    public Product updateProduct(UUID id, Product updatedProduct) {
        return productRepository.findById(id).map(existing -> {
            String originalSku = existing.getSku();
            Integer stockBefore = existing.getStock();

            // Fix: Clear existing collections to let Hibernate manage orphanRemoval properly, rather than replacing the collection instance entirely.
            if (existing.getStoneDetails() != null) {
                existing.getStoneDetails().clear();
            }
            if (updatedProduct.getStoneDetails() != null) {
                if (existing.getStoneDetails() == null) {
                    existing.setStoneDetails(new java.util.ArrayList<>());
                }
                existing.getStoneDetails().addAll(updatedProduct.getStoneDetails());
            }

            // Exclude collections from BeanUtils.copyProperties to prevent "A collection with cascade=all delete-orphan was no longer referenced by the owning entity instance" error
            java.util.List<String> ignoredPropertiesList = new java.util.ArrayList<>(java.util.Arrays.asList(getNullPropertyNames(updatedProduct)));
            ignoredPropertiesList.add("stoneDetails");
            ignoredPropertiesList.add("id");
            ignoredPropertiesList.add("costUpdatedAt"); // server-stamped below
            java.math.BigDecimal costBefore = existing.getCostPrice();

            org.springframework.beans.BeanUtils.copyProperties(updatedProduct, existing, ignoredPropertiesList.toArray(new String[0]));

            existing.setId(id);
            if (updatedProduct.getSku() != null && updatedProduct.getSku().trim().isEmpty()) {
                existing.setSku(originalSku);
            }
            if (existing.getFeatured() == null) {
                existing.setFeatured(Boolean.FALSE); // column is NOT NULL
            }
            java.math.BigDecimal costAfter = existing.getCostPrice();
            boolean costChanged = costBefore == null ? costAfter != null
                    : (costAfter == null || costBefore.compareTo(costAfter) != 0);
            if (costChanged) {
                existing.setCostUpdatedAt(java.time.LocalDateTime.now());
            }

            // Item-type rules run on the merged record so partial updates are
            // validated against the full product, not just the fields sent.
            productRulesService.applyRules(existing);

            Product saved = productRepository.save(existing);

            // Back in stock: an admin update that takes stock from <= 0 to > 0
            // releases the waiting "notify me" subscriptions. Never fails the update.
            Integer stockAfter = saved.getStock();
            if (stockBefore != null && stockBefore <= 0 && stockAfter != null && stockAfter > 0) {
                inventoryAlertService.notifyBackInStock(saved);
            }
            return saved;
        }).orElseThrow(() -> new RuntimeException("Product not found"));
    }

    private String[] getNullPropertyNames(Object source) {
        final BeanWrapper src = new BeanWrapperImpl(source);
        java.beans.PropertyDescriptor[] pds = src.getPropertyDescriptors();

        Set<String> emptyNames = new HashSet<String>();
        for (java.beans.PropertyDescriptor pd : pds) {
            Object srcValue = src.getPropertyValue(pd.getName());
            if (srcValue == null) emptyNames.add(pd.getName());
        }

        String[] result = new String[emptyNames.size()];
        return emptyNames.toArray(result);
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "products", key = "#id")
    public void deleteProduct(UUID id) {
        productRepository.deleteById(id);
    }

    /**
     * CSV-style SKU to ERP material mapping (PUT /admin/inventory/erp-codes).
     * Each row names a SKU; a blank code clears the mapping. Unknown SKUs are
     * reported, not fatal, so one bad line does not lose the rest of a paste.
     * The whole product cache is dropped because many ids may have changed.
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "products", allEntries = true)
    public com.jewelry.backend.dto.ErpCodeMappingResultDTO bulkSetErpMaterialCodes(
            List<com.jewelry.backend.dto.ErpCodeMappingDTO> rows) {
        com.jewelry.backend.dto.ErpCodeMappingResultDTO result = new com.jewelry.backend.dto.ErpCodeMappingResultDTO();
        if (rows == null) {
            return result;
        }
        for (com.jewelry.backend.dto.ErpCodeMappingDTO row : rows) {
            String sku = row == null || row.getSku() == null ? "" : row.getSku().trim();
            String code = row == null || row.getErpMaterialCode() == null ? "" : row.getErpMaterialCode().trim().toUpperCase();
            if (sku.isEmpty()) {
                result.setInvalid(result.getInvalid() + 1);
                result.getRows().add(new com.jewelry.backend.dto.ErpCodeMappingResultDTO.Row(sku, code, "INVALID", null));
                continue;
            }
            Product product = productRepository.findFirstBySkuIgnoreCase(sku).orElse(null);
            if (product == null) {
                result.setNotFound(result.getNotFound() + 1);
                result.getRows().add(new com.jewelry.backend.dto.ErpCodeMappingResultDTO.Row(sku, code, "NOT_FOUND", null));
                continue;
            }
            String before = product.getErpMaterialCode();
            String after = code.isEmpty() ? null : code;
            String status;
            if (java.util.Objects.equals(before, after)) {
                status = "UNCHANGED";
                result.setUnchanged(result.getUnchanged() + 1);
            } else {
                product.setErpMaterialCode(after);
                productRepository.save(product);
                if (after == null) {
                    status = "CLEARED";
                    result.setCleared(result.getCleared() + 1);
                } else {
                    status = "UPDATED";
                    result.setUpdated(result.getUpdated() + 1);
                }
            }
            result.getRows().add(new com.jewelry.backend.dto.ErpCodeMappingResultDTO.Row(
                    product.getSku(), after, status, product.getName()));
        }
        return result;
    }

    /**
     * CSV-style SKU to landed cost (PUT /admin/inventory/cost-prices), the
     * twin of {@link #bulkSetErpMaterialCodes}. A null cost clears the
     * product's cost; a negative one is INVALID. Every change stamps
     * costUpdatedAt.
     */
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "products", allEntries = true)
    public com.jewelry.backend.dto.CostPriceImportResultDTO bulkSetCostPrices(
            List<com.jewelry.backend.dto.CostPriceImportDTO> rows) {
        com.jewelry.backend.dto.CostPriceImportResultDTO result = new com.jewelry.backend.dto.CostPriceImportResultDTO();
        if (rows == null) {
            return result;
        }
        for (com.jewelry.backend.dto.CostPriceImportDTO row : rows) {
            String sku = row == null || row.getSku() == null ? "" : row.getSku().trim();
            java.math.BigDecimal cost = row == null ? null : row.getCostPrice();
            if (sku.isEmpty() || (cost != null && cost.signum() < 0)) {
                result.setInvalid(result.getInvalid() + 1);
                result.getRows().add(new com.jewelry.backend.dto.CostPriceImportResultDTO.Row(sku, cost, "INVALID", null));
                continue;
            }
            Product product = productRepository.findFirstBySkuIgnoreCase(sku).orElse(null);
            if (product == null) {
                result.setNotFound(result.getNotFound() + 1);
                result.getRows().add(new com.jewelry.backend.dto.CostPriceImportResultDTO.Row(sku, cost, "NOT_FOUND", null));
                continue;
            }
            java.math.BigDecimal before = product.getCostPrice();
            boolean same = before == null ? cost == null : (cost != null && before.compareTo(cost) == 0);
            String status;
            if (same) {
                status = "UNCHANGED";
                result.setUnchanged(result.getUnchanged() + 1);
            } else {
                product.setCostPrice(cost);
                product.setCostUpdatedAt(java.time.LocalDateTime.now());
                productRepository.save(product);
                if (cost == null) {
                    status = "CLEARED";
                    result.setCleared(result.getCleared() + 1);
                } else {
                    status = "UPDATED";
                    result.setUpdated(result.getUpdated() + 1);
                }
            }
            result.getRows().add(new com.jewelry.backend.dto.CostPriceImportResultDTO.Row(
                    product.getSku(), cost, status, product.getName()));
        }
        return result;
    }

    public void logProductView(String email, UUID productId) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));
        Product product = getProductById(productId);

        UserProductView view = userProductViewRepository.findByUserIdAndProductId(user.getId(), productId)
            .orElse(new UserProductView());
            
        view.setUser(user);
        view.setProduct(product);
        view.setViewedAt(LocalDateTime.now());
        
        userProductViewRepository.save(view);
    }

    public Page<Product> getSimilarProducts(UUID productId, Pageable pageable) {
        Product product = getProductById(productId);
        if (product.getPrice() == null) {
             return Page.empty(); // Or fallback logic
        }
        
        BigDecimal minPrice = product.getPrice().multiply(new BigDecimal("0.8")); // -20%
        BigDecimal maxPrice = product.getPrice().multiply(new BigDecimal("1.2")); // +20%
        
        return productRepository.findSimilarProducts(product.getCategory(), productId, minPrice, maxPrice, pageable);
    }
}
