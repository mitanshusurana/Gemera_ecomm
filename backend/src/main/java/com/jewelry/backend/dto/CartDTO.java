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
    private boolean giftWrap;
    private List<ProductDTO> wishlist;
}
