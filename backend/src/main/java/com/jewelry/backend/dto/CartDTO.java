package com.jewelry.backend.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.List;

@Data
public class CartDTO {
    private UUID id;
    private List<CartItemDTO> items;
    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal shipping;
    private BigDecimal total;
    private BigDecimal discount;
    private String appliedCoupon;
    private String appliedGiftCard;
    private BigDecimal giftCardAmount;
    /** total + treasureAmount + giftCardAmount: the invoice value before any prepayment is applied. */
    private BigDecimal totalBeforeGiftCard;

    // Treasure plan redemption (a payment, applied before the gift card).
    private UUID appliedTreasureAccountId;
    private BigDecimal treasureAmount;

    // Loyalty points burned (a discount; loyaltyDiscount is already inside `discount`).
    private Integer loyaltyPointsRedeemed;
    private BigDecimal loyaltyDiscount;
    /** The most points this cart could burn right now (balance and loyaltyMaxRedeemPct cap). */
    private Integer loyaltyPointsAvailable;
    private BigDecimal loyaltyPointValue;
    private boolean giftWrap;
    private List<ProductDTO> wishlist;
}
