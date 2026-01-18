import { Product, ProductDetail, Category } from '../core/models';

export const MOCK_CATEGORIES: Category[] = [
  {
    id: "1",
    name: "engagement-rings",
    displayName: "Engagement Rings",
    image: "",
    subcategories: []
  },
  {
    id: "2",
    name: "loose-gemstones",
    displayName: "Loose Gemstones",
    image: "",
  },
  {
    id: "3",
    name: "spiritual-idols",
    displayName: "Spiritual Idols",
    image: "",
  },
  {
    id: "4",
    name: "gemstone-jewelry",
    displayName: "Gemstone Jewelry",
    image: "",
  },
  {
    id: "5",
    name: "precious-metals",
    displayName: "Precious Metals",
    image: "",
  },
  {
    id: "6",
    name: "bespoke-custom",
    displayName: "Bespoke Custom",
    image: "",
  },
  {
    id: "7",
    name: "ring-settings",
    displayName: "Ring Settings",
    image: "",
  }
];

export const MOCK_PRODUCTS: ProductDetail[] = [
  {
    id: "1",
    name: "1.5 Carat Diamond Solitaire",
    price: 45000,
    originalPrice: 50000,
    category: "Engagement Ring",
    subcategory: "Diamond",
    rating: 4.9,
    reviewCount: 245,
    description: "VS1 clarity, G color, excellent cut - GIA certified. This exquisite diamond solitaire ring features a stunning 1.5 carat diamond with excellent cut quality. Certified by GIA, this diamond showcases exceptional clarity and color grading. Set in lustrous 18K white gold, this timeless piece is perfect for engagements, anniversaries, or as a symbol of your refined taste.",
    imageUrl: "https://images.unsplash.com/photo-1515562141207-6461823488d2?w=600&h=400&fit=crop",
    stock: 3,
    specifications: {
      productDetails: {
        sku: "DS-001",
        grossWeight: 5.5,
        width: "2.1 mm",
        height: "22 mm",
        styleNo: "JR00451-1W0000"
      },
      metalDetails: [
        { type: "18K White Gold", purity: "750", weight: 3.5 }
      ],
      diamondDetails: [
        { type: "Solitaire", carat: 1.5, clarity: "VS1", color: "G", cut: "Excellent", shape: "Round", count: 1, settingType: "Prong", totalWeight: 1.5 },
        { type: "Accents", carat: 0.2, clarity: "SI", color: "H", shape: "Round", count: 10, settingType: "Pave", totalWeight: 0.2 }
      ]
    },
    images: [
      "https://images.unsplash.com/photo-1515562141207-6461823488d2?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1701097046878-e2e5e6ca2a15?w=600&h=400&fit=crop"
    ],
    gemstones: ["Diamond"],
    metal: "18K White Gold",
    weight: 5.5,
    sku: "DS-001",
    certifications: ["GIA"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["2", "4"],
    priceBreakup: {
      metal: 10000,
      gemstone: 30000,
      makingCharges: 3000,
      tax: 2000,
      total: 45000
    },
    customizationOptions: [
      { id: "m1", name: "18K White Gold", priceModifier: 0, type: "metal" },
      { id: "m2", name: "14K White Gold", priceModifier: -2000, type: "metal" },
      { id: "m3", name: "Platinum", priceModifier: 5000, type: "metal" },
      { id: "m4", name: "18K Yellow Gold", priceModifier: 0, type: "metal" },
      { id: "d1", name: "IJ-SI (Good)", priceModifier: -5000, type: "diamond" },
      { id: "d2", name: "GH-VS (Better)", priceModifier: 0, type: "diamond" },
      { id: "d3", name: "EF-VVS (Best)", priceModifier: 10000, type: "diamond" }
    ]
  },
  {
    id: "2",
    name: "Colombian Emerald Loose Stone",
    price: 32000,
    category: "Loose Gemstone",
    subcategory: "Emerald",
    rating: 4.8,
    reviewCount: 156,
    description: "Museum-grade, 5.2 carats, vivid green",
    imageUrl: "",
    stock: 2,
    specifications: {
      productDetails: {
        sku: "CE-002",
        grossWeight: 2.1,
        width: "5 mm",
        height: "7 mm",
        styleNo: "GEM-002"
      },
      metalDetails: [],
      diamondDetails: [
        { type: "Emerald", carat: 5.2, clarity: "VS2", color: "Vivid Green", shape: "Emerald", count: 1, settingType: "Loose", totalWeight: 5.2 }
      ]
    },
    images: [],
    gemstones: ["Emerald"],
    metal: "",
    weight: 2.1,
    sku: "CE-002",
    certifications: ["IGI"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["4", "7"]
  },
  {
    id: "3",
    name: "Hand-Carved Ganesha Idol",
    price: 18000,
    category: "Spiritual Idol",
    subcategory: "Quartz",
    rating: 5.0,
    reviewCount: 89,
    description: "Crystal quartz, artisan-carved, 6 inches",
    imageUrl: "",
    stock: 8,
    specifications: {
        productDetails: {
            sku: "GI-003",
            grossWeight: 1200,
            width: "4 inches",
            height: "6 inches",
            styleNo: "IDOL-003"
        }
    },
    images: [],
    gemstones: ["Crystal Quartz"],
    metal: "",
    weight: 1200,
    sku: "GI-003",
    certifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["6"]
  },
  {
    id: "4",
    name: "Kashmir Sapphire - Loose",
    price: 28000,
    originalPrice: 35000,
    category: "Loose Gemstone",
    subcategory: "Sapphire",
    rating: 4.9,
    reviewCount: 203,
    description: "3.8 carats, deep blue, IGI certified",
    imageUrl: "",
    stock: 4,
    specifications: {
        productDetails: { sku: "KS-004", grossWeight: 1.9 },
        diamondDetails: [{ type: "Sapphire", carat: 3.8, clarity: "VS1", color: "Deep Blue", shape: "Oval", count: 1, settingType: "Loose" }]
    },
    images: [],
    gemstones: ["Sapphire"],
    metal: "",
    weight: 1.9,
    sku: "KS-004",
    certifications: ["IGI"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["2", "5"]
  },
  {
    id: "5",
    name: "Padparadsha Sapphire Ring",
    price: 42000,
    category: "Gemstone Ring",
    subcategory: "Sapphire",
    rating: 4.7,
    reviewCount: 78,
    description: "Pink-orange Ceylon sapphire, 18K gold",
    imageUrl: "",
    stock: 6,
    specifications: {
        productDetails: { sku: "PS-005", grossWeight: 4.8 },
        metalDetails: [{ type: "18K Gold", purity: "750", weight: 4.0 }],
        diamondDetails: [{ type: "Sapphire", carat: 2.5, clarity: "Eye Clean", color: "Padparadsha", shape: "Cushion", count: 1, settingType: "Prong" }]
    },
    images: [],
    gemstones: ["Sapphire"],
    metal: "18K Gold",
    weight: 4.8,
    sku: "PS-005",
    certifications: ["GIA"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["4"]
  },
  {
    id: "6",
    name: "Lord Shiva Crystal Idol",
    price: 12000,
    category: "Spiritual Idol",
    subcategory: "Quartz",
    rating: 4.8,
    reviewCount: 124,
    description: "Clear quartz, hand-polished, meditation quality",
    imageUrl: "",
    stock: 12,
    specifications: {},
    images: [],
    gemstones: ["Clear Quartz"],
    metal: "",
    weight: 800,
    sku: "LS-006",
    certifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["3"]
  },
  {
    id: "7",
    name: "Ruby Burma Loose Stone",
    price: 55000,
    category: "Loose Gemstone",
    subcategory: "Ruby",
    rating: 5.0,
    reviewCount: 92,
    description: "Pigeon blood red, 2.1 carats, unheated",
    imageUrl: "",
    stock: 1,
    specifications: {
        productDetails: { sku: "RB-007", grossWeight: 1.05 },
        diamondDetails: [{ type: "Ruby", carat: 2.1, clarity: "VS2", color: "Pigeon Blood Red", shape: "Round", count: 1, settingType: "Loose" }]
    },
    images: [],
    gemstones: ["Ruby"],
    metal: "",
    weight: 1.05,
    sku: "RB-007",
    certifications: ["GIA"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: ["2"]
  },
  {
    id: "8",
    name: "Pure 24K Gold Bangle",
    price: 38000,
    category: "Precious Metal",
    subcategory: "Gold",
    rating: 4.6,
    reviewCount: 167,
    description: "10 grams, hallmarked, traditional design",
    imageUrl: "",
    stock: 5,
    specifications: {},
    images: [],
    gemstones: [],
    metal: "24K Pure Gold",
    weight: 10,
    sku: "GB-008",
    certifications: ["Hallmark"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    relatedProducts: []
  },
  // Adding more items from ProductsComponent
  { id: "9", name: "Emerald Statement Necklace", price: 35000, category: "Gemstone Jewelry", subcategory: "Necklace", rating: 4.9, reviewCount: 89, stock: 5, imageUrl: "", description: "Stunning emerald necklace", gemstones: ["Emerald"], metal: "Gold", weight: 20, sku: "EN-009", certifications: [], createdAt: "", updatedAt: "", specifications: {}, images: [], relatedProducts: [] },
  { id: "10", name: "Sapphire Drop Earrings", price: 28000, category: "Gemstone Jewelry", subcategory: "Earrings", rating: 4.7, reviewCount: 156, stock: 8, imageUrl: "", description: "Elegant sapphire earrings", gemstones: ["Sapphire"], metal: "Platinum", weight: 5, sku: "SE-010", certifications: [], createdAt: "", updatedAt: "", specifications: {}, images: [], relatedProducts: [] },
  { id: "11", name: "Gold Engagement Ring", price: 55000, category: "Engagement Ring", subcategory: "Gold", rating: 4.9, reviewCount: 203, stock: 2, imageUrl: "", description: "Classic gold engagement ring", gemstones: ["Diamond"], metal: "Gold", weight: 4, sku: "GR-011", certifications: [], createdAt: "", updatedAt: "", specifications: {}, images: [], relatedProducts: [] },
  {
    id: "12",
    name: "Classic Solitaire Setting",
    price: 15000,
    category: "Ring Setting",
    subcategory: "Solitaire",
    rating: 4.8,
    reviewCount: 45,
    stock: 10,
    imageUrl: "",
    description: "A timeless six-prong solitaire setting in 18K White Gold.",
    gemstones: [],
    metal: "18K White Gold",
    weight: 3.5,
    sku: "SET-001",
    certifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
        productDetails: { sku: "SET-001", grossWeight: 3.5 },
        metalDetails: [{ type: "18K White Gold", purity: "750", weight: 3.5 }]
    },
    images: [],
    relatedProducts: []
  },
  {
    id: "13",
    name: "Halo Diamond Setting",
    price: 25000,
    category: "Ring Setting",
    subcategory: "Halo",
    rating: 4.9,
    reviewCount: 32,
    stock: 8,
    imageUrl: "",
    description: "Elegant pave halo setting that enhances the center stone size.",
    gemstones: ["Diamond Accents"],
    metal: "Platinum",
    weight: 4.2,
    sku: "SET-002",
    certifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
        productDetails: { sku: "SET-002", grossWeight: 4.2 },
        metalDetails: [{ type: "Platinum", purity: "950", weight: 4.2 }],
        diamondDetails: [{ type: "Accent Diamonds", carat: 0.3, clarity: "VS", color: "G", shape: "Round", count: 20, settingType: "Pave" }]
    },
    images: [],
    relatedProducts: []
  }
];
