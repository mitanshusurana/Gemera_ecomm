// Auth DTOs
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

// Cart DTOs
export interface AddToCartRequest {
  productId: string;
  quantity: number;
  options?: {
    metal?: string;
    diamond?: string;
    price?: number;
    stoneId?: string;
    stoneName?: string;
    customization?: string;
    engraving?: string;
  };
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface UpdateCartOptionsRequest {
  giftWrap: boolean;
}

export interface ApplyCouponRequest {
  couponCode: string;
}

// Order DTOs
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PaymentInfo {
  cardName: string;
  cardNumber: string;
  expiryDate: string;
  cvc: string;
}

export interface CreateOrderRequest {
  shippingAddress: ShippingAddress;
  billingAddress: ShippingAddress | {};
  paymentMethod: string;
  shippingMethod: string;
  items: any[]; // Ideally typed as CartItem[] but avoiding circular deps if complex
  total: number;
}

// Payment DTOs
export interface InitializePaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface VerifyPaymentRequest {
  paymentId: string;
  paymentToken: string;
}
