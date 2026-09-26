package com.jewelry.backend.controller;

import com.jewelry.backend.dto.*;
import com.jewelry.backend.entity.Cart;
import com.jewelry.backend.mapper.EntityMapper;
import com.jewelry.backend.service.CartService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cart")
@Tag(name = "Cart", description = "Cart management APIs")
// Mapping Cart -> CartDTO touches lazy collections; open-in-view is off, so keep the session open here.
@Transactional
public class CartController {

    @Autowired
    CartService cartService;

    @Autowired
    EntityMapper entityMapper;

    /** Entity mapping plus the loyalty figures the checkout shows next to the points control. */
    private CartDTO dto(Cart cart) {
        CartDTO dto = entityMapper.toCartDTO(cart);
        dto.setLoyaltyPointsAvailable(cartService.loyaltyPointsAvailable(cart));
        dto.setLoyaltyPointValue(cartService.loyaltyPointValue());
        return dto;
    }

    @GetMapping
    @Operation(summary = "Get current user's cart")
    public ResponseEntity<CartDTO> getCart(Principal principal) {
        return ResponseEntity.ok(dto(cartService.getCart(principal.getName())));
    }

    @PostMapping("/apply-treasure")
    @Operation(summary = "Apply the caller's matured Treasure plan (a payment, like the gift card) to the cart")
    public ResponseEntity<CartDTO> applyTreasure(@Valid @RequestBody ApplyTreasureRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.applyTreasure(principal.getName(), request.getAccountId())));
    }

    @DeleteMapping("/treasure")
    @Operation(summary = "Remove the applied Treasure plan from the cart")
    public ResponseEntity<CartDTO> removeTreasure(Principal principal) {
        return ResponseEntity.ok(dto(cartService.removeTreasure(principal.getName())));
    }

    @PostMapping("/apply-points")
    @Operation(summary = "Use loyalty points as a discount (capped at the balance and loyaltyMaxRedeemPct of the subtotal)")
    public ResponseEntity<CartDTO> applyPoints(@Valid @RequestBody ApplyPointsRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.applyPoints(principal.getName(), request.getPoints())));
    }

    @DeleteMapping("/points")
    @Operation(summary = "Stop using loyalty points on the cart")
    public ResponseEntity<CartDTO> removePoints(Principal principal) {
        return ResponseEntity.ok(dto(cartService.removePoints(principal.getName())));
    }

    @PostMapping("/items")
    @Operation(summary = "Add item to cart")
    public ResponseEntity<CartDTO> addItem(@Valid @RequestBody AddToCartRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.addItemToCart(principal.getName(), request)));
    }

    @PutMapping("/items/{itemId}")
    @Operation(summary = "Update item quantity")
    public ResponseEntity<CartDTO> updateQuantity(
            @PathVariable UUID itemId,
            @Valid @RequestBody UpdateCartItemRequest request,
            Principal principal) {
        return ResponseEntity.ok(dto(cartService.updateItemQuantity(principal.getName(), itemId, request.getQuantity())));
    }

    @DeleteMapping("/items/{itemId}")
    @Operation(summary = "Remove item from cart")
    public ResponseEntity<CartDTO> removeItem(@PathVariable UUID itemId, Principal principal) {
        return ResponseEntity.ok(dto(cartService.removeItem(principal.getName(), itemId)));
    }

    @PostMapping("/apply-coupon")
    @Operation(summary = "Apply discount code")
    public ResponseEntity<CartDTO> applyCoupon(@RequestBody ApplyCouponRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.applyCoupon(principal.getName(), request.getCode())));
    }

    @PostMapping("/apply-gift-card")
    @Operation(summary = "Apply a gift card to the cart")
    public ResponseEntity<CartDTO> applyGiftCard(@Valid @RequestBody ApplyGiftCardRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.applyGiftCard(principal.getName(), request.getCode())));
    }

    @DeleteMapping("/gift-card")
    @Operation(summary = "Remove the applied gift card from the cart")
    public ResponseEntity<CartDTO> removeGiftCard(Principal principal) {
        return ResponseEntity.ok(dto(cartService.removeGiftCard(principal.getName())));
    }

    @PostMapping("/options")
    @Operation(summary = "Update cart options (e.g. Gift Wrap)")
    public ResponseEntity<CartDTO> updateOptions(@RequestBody CartOptionsRequest request, Principal principal) {
        return ResponseEntity.ok(dto(cartService.updateCartOptions(principal.getName(), request.isGiftWrap())));
    }

}
