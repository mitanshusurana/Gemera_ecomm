package com.jewelry.backend.service;

import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.RFQItem;
import com.jewelry.backend.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Spreading a quoted total over the RFQ lines ({@link RFQService#linesFor}). */
class RFQServiceTest {

    private RFQService service;
    private ProductRepository products;

    @BeforeEach
    void setUp() {
        products = mock(ProductRepository.class);
        when(products.findById(any())).thenReturn(Optional.empty());
        service = new RFQService();
        service.productRepository = products;
    }

    private static RFQ rfq() {
        RFQ rfq = new RFQ();
        rfq.setRfqNumber("RFQ-1");
        rfq.setItems(new ArrayList<>());
        return rfq;
    }

    private static RFQItem item(UUID productId, int qty, String target, String description) {
        RFQItem i = new RFQItem();
        i.setProductId(productId);
        i.setQuantity(qty);
        i.setTargetPrice(target == null ? null : new BigDecimal(target));
        i.setDescription(description);
        return i;
    }

    @Test
    void quoteIsSplitByTargetPriceAndAddsUpExactly() {
        RFQ rfq = rfq();
        rfq.getItems().add(item(null, 2, "1000", "Ring"));
        rfq.getItems().add(item(null, 1, "3000", "Pendant"));
        var lines = service.linesFor(rfq, new BigDecimal("4500"));
        assertThat(lines).hasSize(2);
        // 2000 / 5000 of 4500 = 1800 for two rings -> 900 each; the pendant gets the rest.
        assertThat(lines.get(0).unitPrice()).isEqualByComparingTo("900.00");
        assertThat(lines.get(1).unitPrice()).isEqualByComparingTo("2700.00");
        assertThat(lines.get(0).description()).isEqualTo("Ring");
        assertThat(lines.get(0).product()).isNull();
    }

    @Test
    void listPriceIsTheWeightWhenNoTargetWasGiven() {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName("Solitaire");
        p.setPrice(new BigDecimal("80000"));
        when(products.findById(p.getId())).thenReturn(Optional.of(p));
        RFQ rfq = rfq();
        rfq.getItems().add(item(p.getId(), 1, null, null));
        rfq.getItems().add(item(null, 1, "20000", "Custom band"));
        var lines = service.linesFor(rfq, new BigDecimal("90000"));
        assertThat(lines.get(0).product()).isSameAs(p);
        assertThat(lines.get(0).description()).isEqualTo("Solitaire");
        assertThat(lines.get(0).unitPrice()).isEqualByComparingTo("72000.00");
        assertThat(lines.get(1).unitPrice()).isEqualByComparingTo("18000.00");
    }

    @Test
    void noItemsBecomesOneCustomLineForTheWholeQuote() {
        var lines = service.linesFor(rfq(), new BigDecimal("12345.678"));
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).quantity()).isEqualTo(1);
        assertThat(lines.get(0).unitPrice()).isEqualByComparingTo("12345.68");
        assertThat(lines.get(0).description()).isEqualTo("Quote RFQ-1");
    }
}
