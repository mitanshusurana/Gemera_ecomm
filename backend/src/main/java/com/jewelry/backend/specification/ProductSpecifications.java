package com.jewelry.backend.specification;

import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.StoneDetail;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Criteria-based filtering for {@code GET /api/v1/products}.
 *
 * Every filter is optional; list filters are matched case-insensitively against
 * lower-cased values, and any list entry may itself be a comma-separated string
 * (Spring already splits {@code ?metals=Gold,Platinum}, but repeated params and
 * pre-split arrays are normalised the same way here).
 */
public final class ProductSpecifications {

    private ProductSpecifications() {
    }

    /** All optional filters accepted by the product listing. */
    public record ProductFilter(
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
            Boolean featured) {
    }

    public static Specification<Product> withFilter(ProductFilter f) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            boolean joinedCollection = false;

            if (hasText(f.category())) {
                predicates.add(cb.equal(cb.lower(root.get("category")), f.category().trim().toLowerCase(Locale.ROOT)));
            }

            List<String> subCategories = normalize(f.subCategories());
            if (!subCategories.isEmpty()) {
                predicates.add(cb.lower(root.get("subCategory")).in(subCategories));
            }

            List<String> metals = normalize(f.metals());
            if (!metals.isEmpty()) {
                Join<Product, MetalDetail> metal = root.join("metalDetails", JoinType.LEFT);
                predicates.add(cb.lower(metal.get("metalType")).in(metals));
            }

            List<String> stones = normalize(f.stones());
            if (!stones.isEmpty()) {
                Join<Product, StoneDetail> stone = root.join("stoneDetails", JoinType.LEFT);
                joinedCollection = true;
                predicates.add(cb.or(
                        cb.lower(stone.get("stoneType")).in(stones),
                        cb.lower(root.get("species")).in(stones)));
            }

            List<String> designStyles = normalize(f.designStyles());
            if (!designStyles.isEmpty()) {
                predicates.add(cb.lower(root.get("designStyle")).in(designStyles));
            }

            List<String> occasions = normalize(f.occasions());
            if (!occasions.isEmpty()) {
                Join<Product, String> occasion = root.join("occasions", JoinType.LEFT);
                joinedCollection = true;
                predicates.add(cb.lower(occasion).in(occasions));
            }

            List<String> styles = normalize(f.styles());
            if (!styles.isEmpty()) {
                Join<Product, String> style = root.join("styles", JoinType.LEFT);
                joinedCollection = true;
                predicates.add(cb.lower(style).in(styles));
            }

            List<String> gemGrades = normalize(f.gemGrades());
            if (!gemGrades.isEmpty()) {
                predicates.add(cb.lower(root.get("gemGrade")).in(gemGrades));
            }

            List<String> crafts = normalize(f.crafts());
            if (!crafts.isEmpty()) {
                predicates.add(cb.lower(root.get("craft")).in(crafts));
            }

            List<String> saleModes = normalize(f.saleModes());
            if (!saleModes.isEmpty()) {
                predicates.add(cb.lower(root.get("saleMode")).in(saleModes));
            }

            if (f.priceMin() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("price"), f.priceMin()));
            }
            if (f.priceMax() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("price"), f.priceMax()));
            }

            if (hasText(f.search())) {
                String pattern = "%" + f.search().trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("sku")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)));
            }

            if (Boolean.TRUE.equals(f.certified())) {
                predicates.add(cb.or(
                        notBlank(cb, root.get("labReportNumber")),
                        notBlank(cb, root.get("certificateImage"))));
            }

            if (Boolean.TRUE.equals(f.featured())) {
                predicates.add(cb.isTrue(root.get("featured")));
            }

            if (joinedCollection) {
                // Joining a to-many association can duplicate rows; the count
                // query sees this flag too and switches to count(distinct).
                query.distinct(true);
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * Splits every entry on commas, trims, drops blanks, lower-cases and de-duplicates.
     * Returns an empty list when nothing usable remains.
     */
    public static List<String> normalize(Collection<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        Set<String> result = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null) {
                continue;
            }
            for (String part : value.split(",")) {
                String trimmed = part.trim();
                if (!trimmed.isEmpty()) {
                    result.add(trimmed.toLowerCase(Locale.ROOT));
                }
            }
        }
        return new ArrayList<>(result);
    }

    private static Predicate notBlank(CriteriaBuilder cb, Expression<String> path) {
        return cb.and(cb.isNotNull(path), cb.notEqual(cb.trim(path), ""));
    }

    private static boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
