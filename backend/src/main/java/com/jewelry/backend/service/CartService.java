package com.jewelry.backend.service;

import com.jewelry.backend.dto.AddToCartRequest;
import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.entity.CartItem;
import com.jewelry.backend.entity.Product;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.*;
import com.jewelry.backend.entity.Wishlist;
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

    @Transactional
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

    @Transactional
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
        return cartRepository.save(cart);
    }

    @Transactional
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

    @Transactional
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

    @Transactional
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
        return cartRepository.save(cart);
    }

    @Transactional
    public Cart removeItem(String userEmail, UUID itemId) {
        return updateItemQuantity(userEmail, itemId, 0);
    }

    @Transactional
    public Cart updateCartOptions(String userEmail, boolean giftWrap) {
        Cart cart = getCart(userEmail);
        cart.setGiftWrap(giftWrap);
        recalculateCart(cart);
        return cartRepository.save(cart);
    }

    @Transactional
    public Cart applyCoupon(String userEmail, String code) {
        Cart cart = getCart(userEmail);
        if ("DISCOUNT10".equalsIgnoreCase(code)) {
            cart.setAppliedCoupon(code);
        } else {
             if (code == null || code.isEmpty()) {
                 cart.setAppliedCoupon(null);
             } else {
                 throw new RuntimeException("Invalid coupon code");
             }
        }
        recalculateCart(cart);
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
        if ("DISCOUNT10".equalsIgnoreCase(cart.getAppliedCoupon())) {
             discount = subtotal.multiply(new BigDecimal("0.10"));
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
        cart.setTotal(total);
    }
}
