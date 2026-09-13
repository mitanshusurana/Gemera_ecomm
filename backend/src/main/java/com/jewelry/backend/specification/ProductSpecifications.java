package com.jewelry.backend.specification;

import com.jewelry.backend.entity.MetalDetail;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.StoneDetail;
import com.jewelry.backend.search.SearchSynonyms;
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
            Boolean featured,
            Boolean lowStock,
            Integer lowStockThreshold) {

        /** Original filter set; low-stock filtering off. */
        public ProductFilter(
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
            this(category, subCategories, metals, stones, designStyles, occasions, styles,
                    gemGrades, crafts, saleModes, priceMin, priceMax, search, certified, featured,
                    null, null);
        }
    }

    /** Fields a free-text search term is matched against (case-insensitive contains). */
    private static final List<String> SEARCH_FIELDS = List.of(
            "name", "description", "sku", "category", "subCategory",
            "species", "variety", "material", "gemstoneMaterial");

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
                // One OR-group per query token (token + synonyms, see
                // SearchSynonyms); every term is tried against every
                // searchable field; the groups are ANDed together.
                for (List<String> group : SearchSynonyms.expand(f.search())) {
                    List<Predicate> alternatives = new ArrayList<>();
                    for (String term : group) {
                        String pattern = "%" + term + "%";
                        for (String field : SEARCH_FIELDS) {
                            alternatives.add(cb.like(cb.lower(root.get(field)), pattern));
                        }
                    }
                    if (!alternatives.isEmpty()) {
                        predicates.add(cb.or(alternatives.toArray(new Predicate[0])));
                    }
                }
            }

            if (Boolean.TRUE.equals(f.lowStock())) {
                // stock <= reorderPointAlert, or <= the global threshold when
                // the product has no reorder point of its own.
                int threshold = f.lowStockThreshold() == null ? 1 : f.lowStockThreshold();
                Expression<Integer> stock = root.get("stock");
                Expression<Integer> reorderPoint = root.get("reorderPointAlert");
                predicates.add(cb.and(
                        cb.isNotNull(stock),
                        cb.or(
                                cb.and(cb.isNotNull(reorderPoint), cb.lessThanOrEqualTo(stock, reorderPoint)),
                                cb.and(cb.isNull(reorderPoint), cb.lessThanOrEqualTo(stock, threshold)))));
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
