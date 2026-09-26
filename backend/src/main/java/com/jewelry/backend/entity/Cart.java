package com.jewelry.backend.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "carts")
@Data
@EqualsAndHashCode(callSuper = true)
public class Cart extends BaseEntity {
    @OneToOne
    private User user;

    @OneToMany(mappedBy = "cart", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    private List<CartItem> items = new ArrayList<>();

    private BigDecimal subtotal = BigDecimal.ZERO;
    private BigDecimal tax = BigDecimal.ZERO;
    private BigDecimal shipping = BigDecimal.ZERO;
    private BigDecimal total = BigDecimal.ZERO;
    private BigDecimal discount = BigDecimal.ZERO;
    private String appliedCoupon;

    // Gift card redemption: the applied code and how much of the total it covers.
    private String appliedGiftCard;
    private BigDecimal giftCardAmount = BigDecimal.ZERO;

    // Treasure plan redemption: the matured account and how much of the total
    // it covers. A payment like the gift card, applied before it.
    private UUID appliedTreasureAccountId;
    private BigDecimal treasureAmount = BigDecimal.ZERO;

    // Loyalty points burned on this cart and their rupee value. Unlike the
    // gift card and treasure this is a DISCOUNT: it lowers the taxable value
    // and is folded into `discount` by CartService.recalculateCart.
    private Integer loyaltyPointsRedeemed = 0;
    private BigDecimal loyaltyDiscount = BigDecimal.ZERO;

    private boolean giftWrap;

    @Column(columnDefinition = "boolean default false")
    private boolean abandonmentEmailSent = false;

    @Transient
    private List<Product> wishlist;
}
