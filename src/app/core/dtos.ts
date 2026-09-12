import { CartItem } from './models';

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

// Order DTOs
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
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
