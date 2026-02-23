package com.jewelry.backend.repository;

import com.jewelry.backend.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ProductRepository extends JpaRepository<Product, UUID> {
  @Query("SELECT DISTINCT p FROM Product p " +
    "LEFT JOIN p.occasions o " +
    "LEFT JOIN p.styles s " +
    "WHERE " +
    "(:category IS NULL OR p.category = :category) AND " +
    "(:priceMin IS NULL OR p.price >= :priceMin) AND " +
    "(:priceMax IS NULL OR p.price <= :priceMax) AND " +
    "(:search IS NULL OR " +
    "LOWER(CAST(p.name AS text)) LIKE LOWER(CONCAT('%', CAST(:search AS text), '%')) OR " +
    "LOWER(CAST(p.description AS text)) LIKE LOWER(CONCAT('%', CAST(:search AS text), '%'))) AND " +
    "(:occasions IS NULL OR o IN :occasions) AND " +
    "(:styles IS NULL OR s IN :styles)")
  Page<Product> findWithFilters(
    @Param("category") String category,
    @Param("priceMin") BigDecimal priceMin,
    @Param("priceMax") BigDecimal priceMax,
    @Param("search") String search,
    @Param("occasions") List<String> occasions,
    @Param("styles") List<String> styles,
    Pageable pageable);

    @Query("SELECT DISTINCT p.category FROM Product p")
    List<String> findAllCategories();
}
