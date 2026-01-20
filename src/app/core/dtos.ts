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

import { CartItem } from './models';

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
  items: CartItem[];
  total: number;
  paymentDetails?: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };
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

export interface CreateRazorpayOrderRequest {
  amount: number;
  currency: string;
}

export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export interface TransactionFailureRequest {
  error_code: string;
  error_description: string;
  error_source?: string;
  error_step?: string;
  error_reason?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
}
