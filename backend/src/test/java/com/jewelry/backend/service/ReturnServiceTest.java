package com.jewelry.backend.service;

import com.jewelry.backend.dto.ReturnDtos.EligibilityDTO;
import com.jewelry.backend.entity.Order;
import com.jewelry.backend.entity.OrderItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.ReturnLine;
import com.jewelry.backend.entity.ReturnRequest;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.ReturnRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Return valuation and eligibility rules of {@link ReturnService}; repositories mocked. */
class ReturnServiceTest {

    private ReturnService service;
    private ReturnRequestRepository returns;

    @BeforeEach
    void setUp() {
        returns = mock(ReturnRequestRepository.class);
        when(returns.findByOrderIdAndStatusIn(any(), any())).thenReturn(List.of());
        GlobalSettingRepository settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        service = new ReturnService();
        service.returnRepository = returns;
        service.globalSettingRepository = settings;
    }

    private static Product product(String name, Boolean returnable) {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName(name);
        p.setPrice(new BigDecimal("1000"));
        p.setReturnable(returnable);
        return p;
    }

    private static OrderItem item(Product p, int qty, String price) {
        OrderItem i = new OrderItem();
        i.setId(UUID.randomUUID());
        i.setProduct(p);
        i.setQuantity(qty);
        i.setPrice(new BigDecimal(price));
        return i;
    }

    /** Two lines 1000x2 and 3000x1, a 500 discount, 3% tax on the net 4500 = 135, shipping 50: total 4685. */
    private static Order order(String status) {
        Order o = new Order();
        o.setId(UUID.randomUUID());
        o.setOrderNumber("ORD-1");
        o.setStatus(status);
        o.setItems(new ArrayList<>());
        o.getItems().add(item(product("Ring", null), 2, "1000"));
        o.getItems().add(item(product("Pendant", true), 1, "3000"));
        o.setSubtotal(new BigDecimal("5000"));
        o.setDiscount(new BigDecimal("500"));
        o.setTax(new BigDecimal("135"));
        o.setShipping(new BigDecimal("50"));
        o.setTotal(new BigDecimal("4685"));
        o.setDeliveredAt(LocalDateTime.now().minusDays(2));
        return o;
    }

    private static ReturnLine line(OrderItem item, int qty) {
        ReturnLine l = new ReturnLine();
        l.setOrderItem(item);
        l.setQuantity(qty);
        l.setUnitPrice(item.getPrice());
        return l;
    }

    @Test
    void valueIsThePriceShareAfterDiscountPlusTaxShare() {
        Order o = order("DELIVERED");
        // One ring: 1000 x 0.9 (discount share) x 1.03 (tax share) = 927.00
        assertThat(ReturnService.value(o, List.of(line(o.getItems().get(0), 1)))).isEqualByComparingTo("927.00");
        // Everything: 5000 x 0.9 x 1.03 = 4635 (the shipping is not refunded)
        assertThat(ReturnService.value(o, List.of(line(o.getItems().get(0), 2), line(o.getItems().get(1), 1))))
                .isEqualByComparingTo("4635.00");
    }

    @Test
    void valueIsCappedAtTheInvoiceValue() {
        Order o = order("DELIVERED");
        o.setTotal(new BigDecimal("500"));
        assertThat(ReturnService.value(o, List.of(line(o.getItems().get(1), 1)))).isEqualByComparingTo("500.00");
    }

    @Test
    void eligibilityNeedsDeliveryAndTheWindow() {
        EligibilityDTO paid = service.eligibility(order("PAID"));
        assertThat(paid.isEligible()).isFalse();
        assertThat(paid.getReason()).contains("delivered");

        Order late = order("DELIVERED");
        late.setDeliveredAt(LocalDateTime.now().minusDays(9));
        EligibilityDTO closed = service.eligibility(late);
        assertThat(closed.isEligible()).isFalse();
        assertThat(closed.getReason()).contains("7-day return window closed");

        EligibilityDTO ok = service.eligibility(order("DELIVERED"));
        assertThat(ok.isEligible()).isTrue();
        assertThat(ok.getWindowDays()).isEqualTo(7);
        assertThat(ok.getLines()).hasSize(2);
        assertThat(ok.getLines().get(0).getReturnableQuantity()).isEqualTo(2);
    }

    @Test
    void nonReturnableProductsAndOpenReturnsReduceWhatCanComeBack() {
        Order o = order("DELIVERED");
        o.getItems().get(1).getProduct().setReturnable(false);
        ReturnRequest open = new ReturnRequest();
        open.setId(UUID.randomUUID());
        open.setStatus(ReturnRequest.STATUS_REQUESTED);
        open.getLines().add(line(o.getItems().get(0), 1));
        when(returns.findByOrderIdAndStatusIn(any(), any())).thenReturn(List.of(open));

        EligibilityDTO e = service.eligibility(o);
        assertThat(e.isEligible()).isTrue();
        assertThat(e.getLines().get(0).getReturnableQuantity()).isEqualTo(1);
        assertThat(e.getLines().get(1).isReturnable()).isFalse();
        assertThat(e.getLines().get(1).getReason()).contains("not returnable");
    }

    @Test
    void deliveredAtFallsBackToTheRowTimestamps() {
        Order o = new Order();
        o.setCreatedAt(LocalDateTime.of(2026, 1, 1, 10, 0));
        assertThat(ReturnService.deliveredAt(o)).isEqualTo(LocalDateTime.of(2026, 1, 1, 10, 0));
        o.setUpdatedAt(LocalDateTime.of(2026, 1, 5, 10, 0));
        assertThat(ReturnService.deliveredAt(o)).isEqualTo(LocalDateTime.of(2026, 1, 5, 10, 0));
        o.setDeliveredAt(LocalDateTime.of(2026, 1, 3, 10, 0));
        assertThat(ReturnService.deliveredAt(o)).isEqualTo(LocalDateTime.of(2026, 1, 3, 10, 0));
    }

    @Test
    void cancellableOnlyWhileRequestedOrApproved() {
        ReturnRequest r = new ReturnRequest();
        r.setStatus(ReturnRequest.STATUS_REQUESTED);
        assertThat(ReturnService.cancellable(r)).isTrue();
        r.setStatus(ReturnRequest.STATUS_APPROVED);
        assertThat(ReturnService.cancellable(r)).isTrue();
        r.setStatus(ReturnRequest.STATUS_RECEIVED);
        assertThat(ReturnService.cancellable(r)).isFalse();
    }
}
