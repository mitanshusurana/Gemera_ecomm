package com.jewelry.backend.service;

import com.jewelry.backend.dto.AddToCartRequest;
import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.entity.CartItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.*;
import com.jewelry.backend.entity.Wishlist;
import com.jewelry.backend.entity.Coupon;
import com.jewelry.backend.entity.GiftCard;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.UUID;

@Service
public class CartService {

    @Value("${app.cart.shipping-threshold:1000}")
    private BigDecimal shippingThreshold;

    @Value("${app.cart.standard-shipping-fee:50}")
    private BigDecimal standardShippingFee;

    @Value("${app.cart.gift-wrap-fee:5}")
    private BigDecimal giftWrapFee;

    @Autowired
    CartRepository cartRepository;

    @Autowired
    CartItemRepository cartItemRepository;

    @Autowired
    ProductRepository productRepository;

    @Autowired
    GlobalSettingRepository globalSettingRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    WishlistRepository wishlistRepository;

    @Autowired
    CouponRepository couponRepository;

    @Autowired
    GiftCardService giftCardService;

    @Transactional(rollbackFor = Exception.class)
    public Cart getCart(String userEmail) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Cart cart = cartRepository.findByUser(user).orElseGet(() -> {
            Cart newCart = new Cart();
            newCart.setUser(user);
            return cartRepository.save(newCart);
        });

        // Populate wishlist
        wishlistRepository.findByUser(user).ifPresentOrElse(
            w -> cart.setWishlist(w.getProducts()),
            () -> cart.setWishlist(Collections.emptyList())
        );

        return cart;
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart addItemToCart(String userEmail, AddToCartRequest request) {
        Cart cart = getCart(userEmail);
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new RuntimeException("Product not found"));

        CartItem existingItem = cart.getItems().stream()
                .filter(item -> item.getProduct().getId().equals(product.getId()) &&
                                ((item.getOptions() == null && request.getOptions() == null) ||
                                 (item.getOptions() != null && item.getOptions().equals(request.getOptions()))))
                .findFirst()
                .orElse(null);

        // Defence in depth: bean validation covers the HTTP path, but this method
        // must never accept a non-positive quantity from any caller.
        if (request.getQuantity() < 1) {
            throw new IllegalArgumentException("Quantity must be at least 1");
        }

        if (existingItem != null) {
            existingItem.setQuantity(existingItem.getQuantity() + request.getQuantity());
            cartItemRepository.save(existingItem);
        } else {
            CartItem newItem = new CartItem();
            newItem.setCart(cart);
            newItem.setProduct(product);
            newItem.setQuantity(request.getQuantity());
            newItem.setOptions(request.getOptions());

            cart.getItems().add(newItem);
            cartItemRepository.save(newItem);
        }

        recalculateCart(cart);
        // Reset abandonment flag if they add a new item
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart addToWishlist(String userEmail, UUID productId) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

        Wishlist wishlist = wishlistRepository.findByUser(user)
                .orElseGet(() -> {
                    Wishlist w = new Wishlist();
                    w.setUser(user);
                    return wishlistRepository.save(w);
                });

        if (!wishlist.getProducts().contains(product)) {
            wishlist.getProducts().add(product);
            wishlistRepository.save(wishlist);
        }

        return getCart(userEmail);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart removeFromWishlist(String userEmail, UUID productId) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

        wishlistRepository.findByUser(user).ifPresent(wishlist -> {
            if (wishlist.getProducts().remove(product)) {
                wishlistRepository.save(wishlist);
            }
        });

        return getCart(userEmail);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart updateItemQuantity(String userEmail, UUID itemId, int quantity) {
        Cart cart = getCart(userEmail);
        CartItem item = cartItemRepository.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Item not found"));

        if (!item.getCart().getId().equals(cart.getId())) {
             throw new RuntimeException("Item does not belong to user cart");
        }

        if (quantity <= 0) {
            cart.getItems().remove(item);
            cartItemRepository.delete(item);
        } else {
            item.setQuantity(quantity);
            cartItemRepository.save(item);
        }

        recalculateCart(cart);
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart removeItem(String userEmail, UUID itemId) {
        return updateItemQuantity(userEmail, itemId, 0);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart updateCartOptions(String userEmail, boolean giftWrap) {
        Cart cart = getCart(userEmail);
        cart.setGiftWrap(giftWrap);
        recalculateCart(cart);
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart applyCoupon(String userEmail, String code) {
        Cart cart = getCart(userEmail);
        
        if (code == null || code.isEmpty()) {
            cart.setAppliedCoupon(null);
        } else {
            Coupon coupon = couponRepository.findByCodeIgnoreCase(code)
                .orElseThrow(() -> new RuntimeException("Invalid coupon code"));
                
            if (!coupon.getActive()) {
                throw new RuntimeException("Coupon is no longer active");
            }
            if (coupon.getExpiryDate() != null && coupon.getExpiryDate().isBefore(LocalDateTime.now())) {
                throw new RuntimeException("Coupon has expired");
            }
            if (coupon.getUsageLimit() != null && coupon.getTimesUsed() >= coupon.getUsageLimit()) {
                throw new RuntimeException("Coupon usage limit reached");
            }
            // Explicit here so the shopper learns the floor instead of the
            // code silently doing nothing in recalculateCart.
            BigDecimal currentSubtotal = cart.getSubtotal() == null ? BigDecimal.ZERO : cart.getSubtotal();
            if (coupon.getMinOrderValue() != null && currentSubtotal.compareTo(coupon.getMinOrderValue()) < 0) {
                throw new RuntimeException("This coupon needs a minimum order of "
                        + coupon.getMinOrderValue().setScale(2, RoundingMode.HALF_UP).toPlainString());
            }

            cart.setAppliedCoupon(coupon.getCode());
        }
        recalculateCart(cart);
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart applyGiftCard(String userEmail, String code) {
        Cart cart = getCart(userEmail);
        // Throws IllegalArgumentException (400) with a customer-facing reason
        // when the card is unknown, unpaid, disabled, depleted or expired.
        GiftCard card = giftCardService.requireRedeemable(code);
        cart.setAppliedGiftCard(card.getCode());
        recalculateCart(cart);
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    @Transactional(rollbackFor = Exception.class)
    public Cart removeGiftCard(String userEmail) {
        Cart cart = getCart(userEmail);
        cart.setAppliedGiftCard(null);
        cart.setGiftCardAmount(BigDecimal.ZERO);
        recalculateCart(cart);
        cart.setAbandonmentEmailSent(false);
        return cartRepository.save(cart);
    }

    private void recalculateCart(Cart cart) {
        BigDecimal subtotal = BigDecimal.ZERO;
        for (CartItem item : cart.getItems()) {
            BigDecimal itemTotal = item.getProduct().getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
            subtotal = subtotal.add(itemTotal);
        }
        cart.setSubtotal(subtotal);

        BigDecimal discount = BigDecimal.ZERO;
        if (cart.getAppliedCoupon() != null) {
            Coupon coupon = couponRepository.findByCodeIgnoreCase(cart.getAppliedCoupon()).orElse(null);
            // A coupon with a minimum order value stops applying the moment
            // the cart drops below it (an item removed after the code was
            // entered), the same way an expired code is dropped.
            if (coupon != null && coupon.getActive() &&
               (coupon.getExpiryDate() == null || !coupon.getExpiryDate().isBefore(LocalDateTime.now())) &&
               (coupon.getUsageLimit() == null || coupon.getTimesUsed() < coupon.getUsageLimit()) &&
               (coupon.getMinOrderValue() == null || subtotal.compareTo(coupon.getMinOrderValue()) >= 0)) {
               
                if ("PERCENTAGE".equalsIgnoreCase(coupon.getDiscountType())) {
                    discount = subtotal.multiply(coupon.getDiscountValue().divide(new BigDecimal("100")));
                } else if ("FLAT".equalsIgnoreCase(coupon.getDiscountType())) {
                    discount = coupon.getDiscountValue();
                }
                
                // Cap discount at subtotal
                if (discount.compareTo(subtotal) > 0) {
                    discount = subtotal;
                }
            } else {
                // Invalid or expired, remove it
                cart.setAppliedCoupon(null);
            }
        }
        cart.setDiscount(discount);

        // Fetch tax rates
        BigDecimal taxRateJewelry = new BigDecimal(globalSettingRepository.findBySettingKey("taxRateJewelry").map(s -> s.getSettingValue()).orElse("0.03"));
        BigDecimal taxRateGemstones = new BigDecimal(globalSettingRepository.findBySettingKey("taxRateGemstones").map(s -> s.getSettingValue()).orElse("0.0025"));
        BigDecimal taxRateDefault = new BigDecimal(globalSettingRepository.findBySettingKey("taxRateDefault").map(s -> s.getSettingValue()).orElse("0.03"));

        BigDecimal totalTax = BigDecimal.ZERO;

        if (subtotal.compareTo(BigDecimal.ZERO) > 0) {
            // Distribute discount proportionally and calculate tax
            for (CartItem item : cart.getItems()) {
                BigDecimal itemTotal = item.getProduct().getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                BigDecimal proportion = itemTotal.divide(subtotal, 4, java.math.RoundingMode.HALF_UP);
                BigDecimal itemDiscount = discount.multiply(proportion);
                BigDecimal taxableAmount = itemTotal.subtract(itemDiscount);

                if (taxableAmount.compareTo(BigDecimal.ZERO) < 0) taxableAmount = BigDecimal.ZERO;

                String category = item.getProduct().getCategory();
                BigDecimal applicableTaxRate;
                if ("Jewelry".equalsIgnoreCase(category)) {
                    applicableTaxRate = taxRateJewelry;
                } else if ("Gemstones".equalsIgnoreCase(category)) {
                    applicableTaxRate = taxRateGemstones;
                } else {
                    applicableTaxRate = taxRateDefault;
                }

                totalTax = totalTax.add(taxableAmount.multiply(applicableTaxRate));
            }
        }

        cart.setTax(totalTax);

        cart.setShipping(subtotal.compareTo(shippingThreshold) > 0 ? BigDecimal.ZERO : standardShippingFee);

        BigDecimal total = cart.getSubtotal().subtract(cart.getDiscount()).add(cart.getTax()).add(cart.getShipping());
        if (cart.isGiftWrap()) {
            total = total.add(giftWrapFee);
        }
        // Money is 2 dp; tax multiplication above can produce more.
        total = total.setScale(2, RoundingMode.HALF_UP);

        // Gift card: cover as much of the total as the balance allows. The
        // amount still to be paid is what remains. A card that has stopped
        // being valid since it was applied is dropped silently.
        BigDecimal totalBeforeGiftCard = total;
        BigDecimal giftCardAmount = BigDecimal.ZERO;
        if (cart.getAppliedGiftCard() != null && !cart.getAppliedGiftCard().isBlank()) {
            GiftCard card = giftCardService.findRedeemable(cart.getAppliedGiftCard()).orElse(null);
            if (card != null) {
                BigDecimal balance = card.getBalance().setScale(2, RoundingMode.HALF_UP);
                giftCardAmount = balance.min(totalBeforeGiftCard).max(BigDecimal.ZERO);
            } else {
                cart.setAppliedGiftCard(null);
            }
        }
        cart.setGiftCardAmount(giftCardAmount);
        cart.setTotal(totalBeforeGiftCard.subtract(giftCardAmount));
    }
}
