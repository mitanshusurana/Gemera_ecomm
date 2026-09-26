export interface ProductSpecifications {
  [key: string]: any; // Allow flexibility for now

  // Legacy fields (kept for backward compatibility with QuickView/Builder)
  carat?: number;
  clarity?: string;
  color?: string;
  cut?: string;
  origin?: string;
  metal?: string;

  // New Structured Fields
  diamondDetails?: {
    type?: string;
    carat?: number;
    clarity?: string;
    color?: string;
    cut?: string;
    shape?: string;
    count?: number;
    settingType?: string;
    totalWeight?: number;
  }[];
  metalDetails?: {
    type: string;
    purity: string;
    weight: number; // in grams
  }[];
  productDetails?: {
    sku?: string;
    width?: string;
    height?: string;
    grossWeight?: number;
    styleNo?: string;
  };
}

/** One stone row of a studded piece (backend StoneDetailDTO). caratWeight is per stone; totalCaratWeight the row. */
export interface StoneDetail {
  id?: string;
  stoneType?: string;
  shape?: string;
  pieceCount?: number;
  totalCaratWeight?: number;
  settingType?: string;
  caratWeight?: number;
  clarity?: string;
  colour?: string;
  cut?: string;
  certificateLab?: string;
  certificateNumber?: string;
  ratePerCarat?: number;
  origin?: string;
  treatment?: string;
  position?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  /** False blocks a return or exchange on this piece; absent means returnable. */
  returnable?: boolean;
  originalPrice?: number;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  videoUrl?: string;
  featured?: boolean;
  isBestSeller?: boolean;
  category: string;
  subcategory?: string;
  gemstones?: string[];
  metal?: string;
  weight?: number;
  stock: number;
  sku?: string;
  certifications?: string[];
  createdAt: string;
  updatedAt: string;
  images?: string[];
  specifications?: ProductSpecifications;

  // Specific Category fields
  metalColor?: string;
  grossWeight?: number;
  dimensions?: string;
  bisHallmark?: boolean;
  huid?: string;

  metalDetails?: {
    id?: string;
    metalType?: string;
    metalPurity?: string;
    netWeight?: number;
  };

  stoneDetails?: StoneDetail[];

  species?: string;
  variety?: string;
  shape?: string;
  cut?: string;
  caratWeight?: number;
  colorHue?: string;
  colorTradeTerm?: string;
  clarity?: string;
  measurements?: string;
  treatmentStatus?: string;
  originProvenance?: string;
  labReportNumber?: string;
  /** Image (or scan) of the grading certificate; opens full size on the product page. */
  certificateImage?: string;
  /** Issuing laboratory: GIA, IGI, GRS, SSEF, Gubelin, GII, IGL, Other. */
  certificateLab?: string;

  // Inventory contract §3: sale mode and per-item-type fields
  /** PER_PIECE | PER_CARAT | PER_GRAM | PER_LOT | PER_STRAND (default PER_PIECE). */
  saleMode?: string;
  /** Price per ct / g / piece behind a derived `price`. */
  unitPrice?: number;
  /** Stones / beads / pieces in a lot, strand or component pack. */
  pieceCount?: number;
  lotTotalCaratWeight?: number;
  /** ct, = lotTotalCaratWeight / pieceCount. */
  averagePieceWeight?: number;
  /** e.g. "3-4 mm", "6x4 mm". */
  sizeRange?: string;
  calibrated?: boolean;
  beadSizeMm?: number;
  strandLengthInches?: number;
  /** Strands per item (multi-line necklaces). */
  strandCount?: number;
  heightInches?: number;
  /** Polki, Kundan, Meenakari, Jadau, Filigree, Temple, Antique, Plain, Other. */
  craft?: string;
  /** PLAIN | STUDDED. */
  plainOrStudded?: string;
  /** PRECIOUS | SEMI_PRECIOUS | ORGANIC | LAB_GROWN. */
  gemGrade?: string;

  // Existing DTO fields for rough, idol/carving, strand and component items
  roughMaterial?: string;
  /** ct */
  roughWeight?: number;
  lotNumber?: string;
  mineOrigin?: string;
  matrixParentRock?: string;
  crystalMorphology?: string;
  manufacturingStage?: string;
  gemstoneMaterial?: string;
  subjectDeityName?: string;
  carvingStyle?: string;
  carvingTechnique?: string;
  artistName?: string;
  asana?: string;
  mudra?: string;
  ayudha?: string;
  vahana?: string;
  /** Bead or component material. */
  material?: string;
  purity?: string;
  beadStyle?: string;
  layoutPattern?: string;
  componentType?: string;
  /** Legacy component count (mirrors pieceCount). */
  quantityPcs?: number;
  /** g */
  weightPerPiece?: number;
  /** g */
  totalWeight?: number;

  priceBreakup?: PriceBreakup;

  // Daily metal-rate pricing (metal-prices contract). FIXED products keep a
  // hand-typed price; METAL_RATE products are repriced from the locked board.
  pricingMode?: PricingMode;
  pricingMetal?: MetalCode;
  pricingPurity?: MetalPurity;
  /** g of metal the price is computed on (may differ from metalDetails.netWeight). */
  pricingNetWeightGrams?: number;
  makingChargeType?: MakingChargeType;
  makingChargeValue?: number;
  wastagePct?: number;
  stoneValue?: number;
  otherCharges?: number;
  /** INR per gram used at the last repricing. */
  metalRateUsed?: number;
  pricedAt?: string;
  /** Present only for METAL_RATE products that have been priced. */
  priceBreakdown?: PriceBreakdown | null;
}

// ---------------------------------------------------------------------------
// Metal rates (GET /metal-prices/today, /metal-prices/history)
// ---------------------------------------------------------------------------

export type MetalCode = 'GOLD' | 'SILVER' | 'PLATINUM';
export type MetalPurity = '24K' | '22K' | '18K' | '14K' | '999' | '925' | '950';
export type PricingMode = 'FIXED' | 'METAL_RATE';
export type MakingChargeType = 'PER_GRAM' | 'PERCENT' | 'FIXED';

/** One line of the rate board, INR per gram. */
export interface MetalRate {
  metal: MetalCode;
  purity: MetalPurity;
  /** 0.916 for 22K, 0.925 for sterling silver, ... */
  purityFraction: number;
  ratePerGram: number;
}

export interface MetalBoard {
  asOf: string;
  /** LOCKED: the rates the shop fixed for the day. LIVE: derived from the feed, indicative until locked. */
  source: 'LOCKED' | 'LIVE';
  lockedAt: string | null;
  indicative: boolean;
  fx: { usdInr: number; source: string };
  live: {
    goldUsdPerOunce: number;
    silverUsdPerOunce: number;
    platinumUsdPerOunce: number;
    updatedAt: string;
  } | null;
  rates: MetalRate[];
}

export interface MetalRateHistoryPoint {
  date: string;
  ratePerGram: number;
  source: string;
}

/** How a METAL_RATE product's price was built at its last repricing. */
export interface PriceBreakdown {
  metal: MetalCode;
  purity: MetalPurity;
  ratePerGram: number;
  netWeightGrams: number;
  wastagePct: number;
  /** ratePerGram x netWeightGrams x (1 + wastagePct / 100). */
  metalValue: number;
  makingChargeType: MakingChargeType;
  makingChargeValue: number;
  makingCharges: number;
  stoneValue: number;
  otherCharges: number;
  price: number;
  pricedAt: string;
}

export interface CustomizationOption {
  id: string;
  name: string;
  priceModifier: number;
  type: 'metal' | 'diamond' | 'size';
}

export interface PriceBreakup {
  metal: number;
  gemstone: number;
  makingCharges: number;
  tax: number;
  total: number;
  discount?: number;
  grandTotal?: number;
}

export interface ProductDetail extends Product {
  images?: string[];
  relatedProducts?: string[];
  customizationOptions?: CustomizationOption[];
  priceBreakup?: PriceBreakup;
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product: Product;
  selectedMetal?: string;
  selectedDiamond?: string;
  stoneId?: string;
  stoneName?: string;
  customization?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  appliedDiscount: number;
  discount?: number;
  giftWrap?: boolean;
  wishlist?: Product[];
  appliedGiftCard?: string;
  giftCardAmount?: number;
  /** total + treasureAmount + giftCardAmount: the invoice value before any prepayment. */
  totalBeforeGiftCard?: number;
  /** Matured Treasure plan applied as a payment (before the gift card). */
  appliedTreasureAccountId?: string | null;
  treasureAmount?: number;
  /** Loyalty points burned as a discount; loyaltyDiscount is already inside `discount`. */
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: number;
  /** Most points this cart could burn now (balance and the max-redeem cap). */
  loyaltyPointsAvailable?: number;
  loyaltyPointValue?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  user?: User;
  items: OrderItem[];
  status: string;
  total: number;
  // The API has always returned these (OrderDTO / EntityMapper), but the model
  // omitted them, so the confirmation page recomputed its own totals instead.
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  appliedGiftCard?: string;
  giftCardAmount?: number;
  treasureAmount?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: number;
  totalBeforeGiftCard?: number;
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt?: string;
  shippingAddress?: string;
  billingAddress?: string;
  paymentMethod?: string;
  shippingMethod?: string;

  // Tax invoice and accounting (GST contract). All optional: older orders and
  // unpaid orders have no invoice yet, and the ERP sync may never be queued.
  /** Buyer GSTIN for a B2B invoice, as entered at checkout. */
  buyerGstin?: string;
  /** Buyer PAN; mandatory from the server for payable totals of 2,00,000 INR or more (Rule 114B). */
  buyerPan?: string;
  /** e.g. "WEB/2026-27/000123"; absent until the invoice is issued. */
  invoiceNumber?: string;
  /** ISO date or datetime the invoice was issued. */
  invoiceDate?: string;
  erpSyncStatus?: ErpSyncStatus | null;
  /** The ERP's own document reference once SENT. */
  erpReference?: string;
  erpLastError?: string;
  razorpayRefundId?: string;
  /** Whole INR refunded through the gateway. */
  refundedAmount?: number;
  /** Razorpay order id when the order is awaiting an online payment. */
  razorpayOrderId?: string | null;
  /** The quote this order was created from, when any. */
  rfqId?: string | null;
  rfqNumber?: string | null;
  /** When the order was delivered; the returns window counts from here. */
  deliveredAt?: string | null;
  /** RMA numbers raised on this order. */
  returnNumbers?: string[];
}

/** Whether the order has been pushed to the accounting ERP. */
export type ErpSyncStatus = 'PENDING' | 'SENT' | 'FAILED';

/** Order statuses for which a tax invoice is (or will be) issued. */
export const INVOICED_ORDER_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'] as const;

/** True when the customer has paid and can expect a tax invoice. */
export function isPaidOrder(order: Pick<Order, 'status'> | null | undefined): boolean {
  return !!order && (INVOICED_ORDER_STATUSES as readonly string[]).includes(String(order.status || '').toUpperCase());
}

export interface OrderItem {
  id: string;
  /** Null for a custom line (an accepted quote for a made-to-order piece); read `description` then. */
  product: Product | null;
  description?: string | null;
  quantity: number;
  price: number;
  options?: any;
  selectedMetal?: any;
  selectedDiamond?: any;
  createdAt?: string;
  updatedAt?: string;
  shippingAddress?: string;
  billingAddress?: string;
  paymentMethod?: string;
  shippingMethod?: string;
}

export interface Category {
  id: string;
  name: string;
  displayName: string;
  image: string;
  /**
   * Effective item type, resolved through parent categories by the API:
   * JEWELLERY | LOOSE_GEMSTONE | GEMSTONE_LOT | ROUGH | IDOL_CARVING | STRAND_BEADS | COMPONENT | SET.
   */
  itemType?: string;
  subcategories?: Array<{ id: string; name: string; displayName: string }>;
}

/** Distinct filter values across all products, from GET /products/facets. */
export interface ProductFacets {
  categories: string[];
  subCategories: string[];
  metals: string[];
  stones: string[];
  designStyles: string[];
  occasions: string[];
  styles: string[];
  /** gemGrade codes (PRECIOUS, SEMI_PRECIOUS, ORGANIC, LAB_GROWN); optional until the API ships them. */
  gemGrades?: string[];
  crafts?: string[];
  /** saleMode codes (PER_PIECE, PER_CARAT, ...). */
  saleModes?: string[];
  priceMin: number | null;
  priceMax: number | null;
}

export interface Address {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
}

export interface TreasureChestAccount {
  id: string;
  planName: string;
  installmentAmount: number;
  installmentsPaid: number;
  totalInstallments: number;
  balance: number;
  status: 'ACTIVE' | 'MATURED' | 'REDEEMED' | 'CLOSED';
  startDate: string;
  nextDueDate: string;
  /** Bonus months x installment (finish contract, section 2). Optional until the backend ships it. */
  bonusAmount?: number;
  /** installment x totalInstallments + bonusAmount. */
  maturityAmount?: number;

  // Gram accrual and gold rate protection.
  /** 24K grams the paid installments bought at each day's rate. */
  goldGramsAccrued?: number;
  /** Today's 24K rate, INR per gram. */
  ratePerGram?: number;
  rateIndicative?: boolean;
  /** goldGramsAccrued x ratePerGram. */
  goldValue?: number;
  /** max(balance, goldValue) once MATURED; null before. */
  redeemableValue?: number | null;
  redeemableBasis?: 'BALANCE' | 'GOLD';
  redeemedAmount?: number | null;
  redeemedOrderId?: string | null;
  redeemedOrderNumber?: string | null;
}

/** GET treasure/accounts/{id}/redeemable: the gold rate protection figure. */
export interface TreasureRedeemable {
  accountId: string;
  status: string;
  redeemable: boolean;
  balance: number;
  goldGramsAccrued: number;
  ratePerGram: number;
  rateIndicative: boolean;
  goldValue: number;
  redeemableValue: number;
  basis: 'BALANCE' | 'GOLD';
}

export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST' | 'REFERRAL';

export interface LoyaltyTransaction {
  id: string;
  type: LoyaltyTransactionType;
  /** Signed. */
  points: number;
  balanceAfter: number;
  orderId?: string | null;
  reference?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  createdAt: string;
}

/** GET loyalty/me. */
export interface LoyaltySummary {
  balance: number;
  balanceValue: number;
  lifetimeEarned: number;
  tier: 'SILVER' | 'GOLD' | 'PLATINUM';
  tierFloor: number;
  nextTier: 'GOLD' | 'PLATINUM' | null;
  nextTierAt: number | null;
  pointsToNextTier: number;
  expiringSoon: number;
  expiringSoonAt?: string | null;
  pointValue: number;
  pointsPer100: number;
  maxRedeemPct: number;
  expiryMonths: number;
  referralBonus: number;
  referralCode: string;
  referredByName?: string | null;
  history: {
    content: LoyaltyTransaction[];
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

/** One monthly payment towards a Treasure Plan (finish contract, section 2). Amounts are whole INR. */
export interface TreasureInstallment {
  id: string;
  installmentNumber: number;
  amount: number;
  method: 'RAZORPAY' | 'CASH' | 'ADMIN';
  status: 'PENDING' | 'PAID' | 'FAILED';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paidAt?: string;
  /** 24K grams this installment bought; absent on installments that pre-date the gram scheme. */
  goldGrams?: number | null;
  ratePerGram?: number | null;
  rateIndicative?: boolean;

  note?: string;
  createdAt?: string;
}

/** POST treasure/account/installments/order. `amount` is paise, for Razorpay. */
export interface TreasureInstallmentOrderResponse {
  installmentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
}

/** POST treasure/account/installments/{id}/confirm body. */
export interface TreasureInstallmentConfirmRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatar?: string;
  role?: 'ADMIN' | 'USER';
  addresses?: Address[];
  createdAt: string;
  token?: string;
  treasureChest?: TreasureChestAccount;
  loyaltyPoints?: number;
  referralCode?: string | null;

  // Customer preferences (growth contract, section 3). All optional: the
  // backend adds these columns as nullable and older responses omit them.
  /** `YYYY-MM-DD`. */
  birthday?: string | null;
  /** `YYYY-MM-DD`. */
  anniversary?: string | null;
  /** US ring size as a string, e.g. "6.5". */
  ringSize?: string | null;
  /** Gold, White Gold, Rose Gold, Platinum, Silver. */
  preferredMetal?: string | null;
  /** Comma-separated list, e.g. "Diamond,Ruby". */
  preferredStones?: string | null;
  marketingOptIn?: boolean | null;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface Pageable {
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  content: T[];
  pageable: Pageable;
  totalElements: number;
  totalPages: number;
}

export interface CertificateDetail {
  id: string;
  reportNumber: string;
  lab: string;
  dateIssued: string;
  productName: string;
  carat: number;
  color: string;
  clarity: string;
  cut: string;
  shape: string;
  imageUrl?: string;
  /** Set when the record was resolved from a product's lab report number. */
  productId?: string;
}

export interface DeliveryAvailability {
  available: boolean;
  estimatedDate?: string;
  message?: string;
}
