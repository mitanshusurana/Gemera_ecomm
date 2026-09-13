package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ProductRepository extends JpaRepository<Product, UUID>, JpaSpecificationExecutor<Product> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdWithPessimisticWrite(@Param("id") UUID id);

    // Listing filters live in ProductSpecifications (Specification<Product>);
    // the old findWithFilters JPQL was removed with them.

    @Query("SELECT DISTINCT p.category FROM Product p")
    List<String> findAllCategories();

    // ----- Facet sources for GET /api/v1/products/facets -----

    @Query("SELECT DISTINCT p.subCategory FROM Product p WHERE p.subCategory IS NOT NULL AND TRIM(p.subCategory) <> ''")
    List<String> findDistinctSubCategories();

    @Query("SELECT DISTINCT m.metalType FROM Product p JOIN p.metalDetails m WHERE m.metalType IS NOT NULL AND TRIM(m.metalType) <> ''")
    List<String> findDistinctMetalTypes();

    @Query("SELECT DISTINCT s.stoneType FROM Product p JOIN p.stoneDetails s WHERE s.stoneType IS NOT NULL AND TRIM(s.stoneType) <> ''")
    List<String> findDistinctStoneTypes();

    @Query("SELECT DISTINCT p.species FROM Product p WHERE p.species IS NOT NULL AND TRIM(p.species) <> ''")
    List<String> findDistinctSpecies();

    @Query("SELECT DISTINCT p.designStyle FROM Product p WHERE p.designStyle IS NOT NULL AND TRIM(p.designStyle) <> ''")
    List<String> findDistinctDesignStyles();

    @Query("SELECT DISTINCT o FROM Product p JOIN p.occasions o WHERE o IS NOT NULL AND TRIM(o) <> ''")
    List<String> findDistinctOccasions();

    @Query("SELECT DISTINCT s FROM Product p JOIN p.styles s WHERE s IS NOT NULL AND TRIM(s) <> ''")
    List<String> findDistinctStyles();

    @Query("SELECT MIN(p.price) FROM Product p")
    BigDecimal findMinPrice();

    @Query("SELECT MAX(p.price) FROM Product p")
    BigDecimal findMaxPrice();

    @Query("SELECT p FROM Product p WHERE p.category = :category AND p.id != :excludeId AND p.price BETWEEN :minPrice AND :maxPrice")
    Page<Product> findSimilarProducts(
        @Param("category") String category,
        @Param("excludeId") UUID excludeId,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        Pageable pageable);
}
