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
  /** Never sent by the checkout: the server prices the order from its own cart. */
  total?: number;
  paymentDetails?: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  } | {};
  /**
   * Buyer tax identifiers (GST contract). Upper-cased and trimmed by the
   * checkout. The server answers 400 with a `message` when the PAN is missing
   * on a payable total of 2,00,000 INR or more (Income-tax Rule 114B), when
   * cash on delivery is chosen at that level (Section 269ST), or when either
   * value is malformed.
   */
  buyerGstin?: string;
  buyerPan?: string;
}

/** Client-side format checks mirroring the server's (GST contract). */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Payable total (INR, before gift card) from which a PAN is mandatory and COD is barred. */
export const PAN_REQUIRED_FROM_INR = 200000;

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
