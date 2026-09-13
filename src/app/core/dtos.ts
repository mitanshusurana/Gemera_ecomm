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

// Gift-card DTOs (API contract, section 4). Amounts are whole INR except
// GiftCardPurchaseResponse.amount, which is paise for Razorpay.
export type GiftCardTheme = 'classic' | 'gold' | 'ruby';
export type GiftCardStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'DEPLETED' | 'DISABLED';

export const GIFT_CARD_AMOUNT = {
  min: 500,
  max: 100000,
  presets: [500, 1000, 2500, 5000, 10000, 25000],
} as const;

export interface GiftCardPurchaseRequest {
  amount: number;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail: string;
  message?: string;
  theme: GiftCardTheme;
}

export interface GiftCardPurchaseResponse {
  giftCardId: string;
  razorpayOrderId: string;
  /** Paise. */
  amount: number;
  currency: string;
}

export interface GiftCardConfirmRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface GiftCardDTO {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  currency: string;
  recipientName: string;
  recipientEmail: string;
  message?: string;
  theme: GiftCardTheme;
  status: GiftCardStatus;
  expiresAt: string;
  createdAt: string;
}

export interface GiftCardBalanceResponse {
  /** Masked by the server: "CL-****-****-1234". */
  code: string;
  balance: number;
  currency: string;
  status: GiftCardStatus;
  expiresAt: string;
}
