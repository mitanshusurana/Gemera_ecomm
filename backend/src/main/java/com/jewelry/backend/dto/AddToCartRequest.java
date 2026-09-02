package com.jewelry.backend.dto;

import com.jewelry.backend.entity.CartItem;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.UUID;

@Data
public class AddToCartRequest {
    @NotNull(message = "productId is required")
    private UUID productId;

    // A negative quantity previously reduced the order total and *raised* stock.
    @Min(value = 1, message = "quantity must be at least 1")
    @Max(value = 100, message = "quantity may not exceed 100")
    private int quantity;
    private CartItem.CartItemOptions options;
}
