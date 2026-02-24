package com.jewelry.backend.dto;

import com.jewelry.backend.entity.CartItem;
import lombok.Data;
import java.util.UUID;

@Data
public class AddToCartRequest {
    private UUID productId;
    private int quantity;
    private CartItem.CartItemOptions options;
}
