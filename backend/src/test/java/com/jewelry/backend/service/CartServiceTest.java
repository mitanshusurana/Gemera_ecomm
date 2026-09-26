package com.jewelry.backend.service;

import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.entity.CartItem;
import com.jewelry.backend.entity.Coupon;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.CartRepository;
import com.jewelry.backend.repository.CouponRepository;
import com.jewelry.backend.repository.GlobalSettingRepository;
import com.jewelry.backend.repository.UserRepository;
import com.jewelry.backend.repository.WishlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Coupon rules of {@code recalculateCart}. The method is private, so the
 * tests reach it through {@code applyCoupon} (validation on entry) and
 * {@code updateCartOptions} (a later recalculation that must drop a coupon
 * that has stopped being valid).
 */
class CartServiceTest {

    private static final String EMAIL = "shopper@test.local";

    private CartService service;
    private CouponRepository couponRepository;
    private Cart cart;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(EMAIL);
        cart = new Cart();
        cart.setId(UUID.randomUUID());
        cart.setUser(user);

        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        CartRepository cartRepository = mock(CartRepository.class);
        when(cartRepository.findByUser(user)).thenReturn(Optional.of(cart));
        when(cartRepository.save(any(Cart.class))).thenAnswer(inv -> inv.getArgument(0));
        WishlistRepository wishlistRepository = mock(WishlistRepository.class);
        when(wishlistRepository.findByUser(user)).thenReturn(Optional.empty());
        GlobalSettingRepository settings = mock(GlobalSettingRepository.class);
        when(settings.findBySettingKey(anyString())).thenReturn(Optional.empty());
        couponRepository = mock(CouponRepository.class);
        when(couponRepository.findByCodeIgnoreCase(anyString())).thenReturn(Optional.empty());

        service = new CartService();
        service.userRepository = userRepository;
        service.cartRepository = cartRepository;
        service.wishlistRepository = wishlistRepository;
        service.globalSettingRepository = settings;
        service.couponRepository = couponRepository;
        service.giftCardService = mock(GiftCardService.class);
        ReflectionTestUtils.setField(service, "shippingThreshold", new BigDecimal("1000"));
        ReflectionTestUtils.setField(service, "standardShippingFee", new BigDecimal("50"));
        ReflectionTestUtils.setField(service, "giftWrapFee", new BigDecimal("5"));
    }

    private void item(String category, String price, int quantity) {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setCategory(category);
        p.setPrice(new BigDecimal(price));
        CartItem item = new CartItem();
        item.setCart(cart);
        item.setProduct(p);
        item.setQuantity(quantity);
        cart.getItems().add(item);
    }

    private Coupon coupon(String code, String type, String value) {
        Coupon c = new Coupon();
        c.setCode(code);
        c.setDiscountType(type);
        c.setDiscountValue(new BigDecimal(value));
        c.setActive(true);
        when(couponRepository.findByCodeIgnoreCase(code)).thenReturn(Optional.of(c));
        return c;
    }

    // ---- totals without a coupon ---------------------------------------------

    @Test
    void subtotalTaxShippingAndTotalAreComputedPerCategory() {
        item("Jewelry", "5000", 1);      // 3%
        item("Gemstones", "1000", 2);   // 0.25%
        Cart result = service.updateCartOptions(EMAIL, false);

        assertThat(result.getSubtotal()).isEqualByComparingTo("7000");
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
        assertThat(result.getTax()).isEqualByComparingTo("155.00"); // 150 + 5
        assertThat(result.getShipping()).as("above the free-shipping threshold").isEqualByComparingTo("0");
        assertThat(result.getTotal()).isEqualByComparingTo("7155.00");
    }

    @Test
    void smallOrdersPayShippingAndGiftWrapIsAFlatFee() {
        item("Other", "600", 1);         // default 3%
        Cart result = service.updateCartOptions(EMAIL, true);
        assertThat(result.getShipping()).isEqualByComparingTo("50");
        assertThat(result.getTax()).isEqualByComparingTo("18.00");
        assertThat(result.getTotal()).isEqualByComparingTo("673.00"); // 600 + 18 + 50 + 5
    }

    // ---- coupon rules ----------------------------------------------------------

    @Test
    void percentageCouponDiscountsTheSubtotalBeforeTax() {
        item("Jewelry", "10000", 1);
        coupon("TEN", "PERCENTAGE", "10");

        Cart result = service.applyCoupon(EMAIL, "TEN");

        assertThat(result.getAppliedCoupon()).isEqualTo("TEN");
        assertThat(result.getDiscount()).isEqualByComparingTo("1000");
        assertThat(result.getTax()).as("3% of 9000").isEqualByComparingTo("270.00");
        assertThat(result.getTotal()).isEqualByComparingTo("9270.00");
    }

    @Test
    void flatCouponIsCappedAtTheSubtotal() {
        item("Jewelry", "400", 1);
        coupon("BIG", "FLAT", "1000");

        Cart result = service.applyCoupon(EMAIL, "BIG");

        assertThat(result.getDiscount()).isEqualByComparingTo("400");
        assertThat(result.getTax()).isEqualByComparingTo("0");
        assertThat(result.getTotal()).as("only shipping remains").isEqualByComparingTo("50.00");
    }

    @Test
    void percentageAboveHundredIsCappedAtTheSubtotal() {
        item("Jewelry", "400", 1);
        coupon("ALL", "PERCENTAGE", "150");
        Cart result = service.applyCoupon(EMAIL, "ALL");
        assertThat(result.getDiscount()).isEqualByComparingTo("400");
    }

    @Test
    void expiredCouponIsRefusedOnEntry() {
        item("Jewelry", "1000", 1);
        coupon("OLD", "FLAT", "100").setExpiryDate(LocalDateTime.now().minusDays(1));
        assertThatThrownBy(() -> service.applyCoupon(EMAIL, "OLD"))
                .isInstanceOf(RuntimeException.class).hasMessage("Coupon has expired");
        assertThat(cart.getAppliedCoupon()).isNull();
    }

    @Test
    void couponOverItsUsageLimitIsRefusedOnEntry() {
        item("Jewelry", "1000", 1);
        Coupon c = coupon("USED", "FLAT", "100");
        c.setUsageLimit(5);
        c.setTimesUsed(5);
        assertThatThrownBy(() -> service.applyCoupon(EMAIL, "USED"))
                .isInstanceOf(RuntimeException.class).hasMessage("Coupon usage limit reached");
    }

    @Test
    void couponBelowItsMinimumOrderIsRefusedWithTheFloor() {
        item("Jewelry", "1000", 1);
        cart.setSubtotal(new BigDecimal("1000"));
        coupon("MIN", "FLAT", "100").setMinOrderValue(new BigDecimal("2500"));
        assertThatThrownBy(() -> service.applyCoupon(EMAIL, "MIN"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("This coupon needs a minimum order of 2500.00");
    }

    @Test
    void inactiveAndUnknownCouponsAreRefused() {
        item("Jewelry", "1000", 1);
        coupon("OFF", "FLAT", "100").setActive(false);
        assertThatThrownBy(() -> service.applyCoupon(EMAIL, "OFF")).hasMessage("Coupon is no longer active");
        assertThatThrownBy(() -> service.applyCoupon(EMAIL, "NOPE")).hasMessage("Invalid coupon code");
    }

    @Test
    void couponThatExpiresAfterBeingAppliedIsDroppedOnTheNextRecalculation() {
        item("Jewelry", "1000", 1);
        Coupon c = coupon("SOON", "FLAT", "100");
        service.applyCoupon(EMAIL, "SOON");
        assertThat(cart.getDiscount()).isEqualByComparingTo("100");

        c.setExpiryDate(LocalDateTime.now().minusMinutes(1));
        Cart result = service.updateCartOptions(EMAIL, false);

        assertThat(result.getAppliedCoupon()).isNull();
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
        assertThat(result.getTotal()).isEqualByComparingTo("1080.00"); // 1000 + 30 tax + 50 shipping
    }

    @Test
    void couponThatHitsItsUsageLimitAfterBeingAppliedIsDropped() {
        item("Jewelry", "1000", 1);
        Coupon c = coupon("LIMIT", "PERCENTAGE", "10");
        c.setUsageLimit(1);
        c.setTimesUsed(0);
        service.applyCoupon(EMAIL, "LIMIT");
        assertThat(cart.getDiscount()).isEqualByComparingTo("100");

        c.setTimesUsed(1);
        Cart result = service.updateCartOptions(EMAIL, false);
        assertThat(result.getAppliedCoupon()).isNull();
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
    }

    @Test
    void couponIsDroppedWhenTheCartFallsBelowItsMinimumOrder() {
        item("Jewelry", "3000", 1);
        cart.setSubtotal(new BigDecimal("3000"));
        coupon("MIN", "FLAT", "500").setMinOrderValue(new BigDecimal("2500"));
        service.applyCoupon(EMAIL, "MIN");
        assertThat(cart.getDiscount()).isEqualByComparingTo("500");

        cart.getItems().clear();
        item("Jewelry", "2000", 1);
        Cart result = service.updateCartOptions(EMAIL, false);
        assertThat(result.getAppliedCoupon()).isNull();
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
        assertThat(result.getSubtotal()).isEqualByComparingTo("2000");
    }

    @Test
    void couponDeletedSinceItWasAppliedIsDroppedSilently() {
        item("Jewelry", "1000", 1);
        cart.setAppliedCoupon("GONE");
        Cart result = service.updateCartOptions(EMAIL, false);
        assertThat(result.getAppliedCoupon()).isNull();
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
    }

    @Test
    void emptyCodeRemovesTheCoupon() {
        item("Jewelry", "1000", 1);
        coupon("TEN", "PERCENTAGE", "10");
        service.applyCoupon(EMAIL, "TEN");
        Cart result = service.applyCoupon(EMAIL, "");
        assertThat(result.getAppliedCoupon()).isNull();
        assertThat(result.getDiscount()).isEqualByComparingTo("0");
    }

    @Test
    void discountIsSpreadAcrossLinesInProportionForTax() {
        item("Jewelry", "6000", 1);     // 3%
        item("Gemstones", "4000", 1);   // 0.25%
        coupon("TEN", "PERCENTAGE", "10");
        Cart result = service.applyCoupon(EMAIL, "TEN");
        // Jewelry taxable 5400 -> 162; gemstones taxable 3600 -> 9
        assertThat(result.getDiscount()).isEqualByComparingTo("1000");
        assertThat(result.getTax()).isEqualByComparingTo("171.00");
        assertThat(result.getTotal()).isEqualByComparingTo("9171.00");
    }
}
