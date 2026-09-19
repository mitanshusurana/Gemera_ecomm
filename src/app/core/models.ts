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

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
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

  stoneDetails?: {
    id?: string;
    stoneType?: string;
    shape?: string;
    pieceCount?: number;
    totalCaratWeight?: number;
    settingType?: string;
  }[];

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
  totalBeforeGiftCard?: number;
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
  totalBeforeGiftCard?: number;
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt?: string;
  shippingAddress?: string;
  billingAddress?: string;
  paymentMethod?: string;
  shippingMethod?: string;
}

export interface OrderItem {
  id: string;
  product: Product;
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
  status: 'ACTIVE' | 'MATURED' | 'CLOSED';
  startDate: string;
  nextDueDate: string;
  /** Bonus months x installment (finish contract, section 2). Optional until the backend ships it. */
  bonusAmount?: number;
  /** installment x totalInstallments + bonusAmount. */
  maturityAmount?: number;
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
