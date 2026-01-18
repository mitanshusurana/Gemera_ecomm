export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  videoUrl?: string;
  category: string;
  subcategory: string;
  gemstones: string[];
  metal: string;
  weight: number;
  stock: number;
  sku: string;
  certifications: string[];
  createdAt: string;
  updatedAt: string;
  specifications?: {
    carat?: number;
    clarity?: string;
    color?: string;
    cut?: string;
    origin?: string;
    metal?: string;
  };
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
}

export interface ProductDetail extends Product {
  images: { url: string; alt: string }[];
  relatedProducts: string[];
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
  giftWrap?: boolean;
  wishlist?: Product[];
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  user?: User;
  items: OrderItem[];
  status: string;
  total: number;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  displayName: string;
  image: string;
  subcategories?: Array<{ id: string; name: string; displayName: string }>;
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
  token?: string; // specific for auth response convenience sometimes
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
}
