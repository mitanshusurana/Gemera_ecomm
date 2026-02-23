package com.jewelry.backend.controller;

import com.jewelry.backend.dto.*;
import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.CartService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cart")
@Tag(name = "Cart", description = "Cart management APIs")
public class CartController {

    @Autowired
    CartService cartService;

    @Autowired
    EntityMapper entityMapper;

    @GetMapping
    @Operation(summary = "Get current user's cart")
    public ResponseEntity<CartDTO> getCart(Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.getCart(principal.getName())));
    }

    @PostMapping("/items")
    @Operation(summary = "Add item to cart")
    public ResponseEntity<CartDTO> addItem(@RequestBody AddToCartRequest request, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.addItemToCart(principal.getName(), request)));
    }

    @PutMapping("/items/{itemId}")
    @Operation(summary = "Update item quantity")
    public ResponseEntity<CartDTO> updateQuantity(
            @PathVariable UUID itemId,
            @RequestBody UpdateCartItemRequest request,
            Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.updateItemQuantity(principal.getName(), itemId, request.getQuantity())));
    }

    @DeleteMapping("/items/{itemId}")
    @Operation(summary = "Remove item from cart")
    public ResponseEntity<CartDTO> removeItem(@PathVariable UUID itemId, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.removeItem(principal.getName(), itemId)));
    }

    @PostMapping("/apply-coupon")
    @Operation(summary = "Apply discount code")
    public ResponseEntity<CartDTO> applyCoupon(@RequestBody ApplyCouponRequest request, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.applyCoupon(principal.getName(), request.getCode())));
    }

    @PostMapping("/options")
    @Operation(summary = "Update cart options (e.g. Gift Wrap)")
    public ResponseEntity<CartDTO> updateOptions(@RequestBody CartOptionsRequest request, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.updateCartOptions(principal.getName(), request.isGiftWrap())));
    }

    @PostMapping("/wishlist")
    @Operation(summary = "Add item to wishlist")
    public ResponseEntity<CartDTO> addToWishlist(@RequestBody WishlistRequest request, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.addToWishlist(principal.getName(), UUID.fromString(request.getProductId()))));
    }

    @DeleteMapping("/wishlist/{productId}")
    @Operation(summary = "Remove item from wishlist")
    public ResponseEntity<CartDTO> removeFromWishlist(@PathVariable UUID productId, Principal principal) {
        return ResponseEntity.ok(entityMapper.toCartDTO(cartService.removeFromWishlist(principal.getName(), productId)));
    }
}
