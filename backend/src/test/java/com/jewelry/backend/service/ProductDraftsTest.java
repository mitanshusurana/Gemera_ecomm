package com.jewelry.backend.service;

import com.jewelry.backend.entity.Product;
import com.jewelry.backend.specification.ProductSpecifications.ProductFilter;
import com.jewelry.backend.specification.ProductSpecifications.Visibility;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drafts must never reach the storefront by accident: a filter built without
 * saying anything about visibility shows published products only, and a
 * product is a draft only when {@code published} is explicitly false.
 */
class ProductDraftsTest {

    @Test
    void theLegacyFilterHidesDrafts() {
        ProductFilter legacy = new ProductFilter(null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null);
        assertThat(legacy.visibility()).isEqualTo(Visibility.PUBLISHED);
    }

    @Test
    void onlyAnExplicitFalseIsADraft() {
        Product product = new Product();
        product.setPublished(null); // rows older than the column
        assertThat(ProductService.isDraft(product)).isFalse();
        product.setPublished(Boolean.TRUE);
        assertThat(ProductService.isDraft(product)).isFalse();
        product.setPublished(Boolean.FALSE);
        assertThat(ProductService.isDraft(product)).isTrue();
        assertThat(ProductService.isDraft(null)).isFalse();
    }

    @Test
    void publishingFillsTheStonePlaceholderInADraftSku() {
        Product product = new Product();
        assertThat(ProductService.skuWithStone("ST-PR-XXX-45ED", product)).isEqualTo("ST-PR-XXX-45ED");
        product.setSpecies("Corundum");
        assertThat(ProductService.skuWithStone("ST-PR-XXX-45ED", product)).isEqualTo("ST-PR-COR-45ED");
        product.setVariety("Yellow Sapphire"); // the variety is what the trade calls it, so it wins
        assertThat(ProductService.skuWithStone("ST-PR-XXX-45ED", product)).isEqualTo("ST-PR-YEL-45ED");
        // A SKU that was typed by hand, or already names its stone, is left alone.
        assertThat(ProductService.skuWithStone("ST-PR-EME-45ED", product)).isEqualTo("ST-PR-EME-45ED");
        assertThat(ProductService.skuWithStone("RING-001", product)).isEqualTo("RING-001");
        assertThat(ProductService.skuWithStone(null, product)).isNull();
    }
}
