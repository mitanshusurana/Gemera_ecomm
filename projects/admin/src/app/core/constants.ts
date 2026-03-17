export enum ProductCategory {
  FINISHED_JEWELRY = 'Finished Jewelry',
  LOOSE_GEMSTONES = 'Loose Gemstones',
  RELIGIOUS_IDOLS = 'Religious Idols & Gemstone Carvings',
  ROUGH_MATERIALS = 'Manufacturing & Rough Materials',
  COMPONENTS_MATERIALS = 'Components & Materials',
  BESPOKE_CUSTOM = 'Custom',
  RING_SETTINGS = 'Ring Setting'
}

export const APP_CATEGORIES = [
  { id: '1', name: 'finished-jewelry', displayName: 'Finished Jewelry', value: ProductCategory.FINISHED_JEWELRY },
  { id: '2', name: 'loose-gemstones', displayName: 'Loose Gemstones', value: ProductCategory.LOOSE_GEMSTONES },
  { id: '3', name: 'spiritual-idols', displayName: 'Religious Idols & Gemstone Carvings', value: ProductCategory.RELIGIOUS_IDOLS },
  { id: '4', name: 'rough-materials', displayName: 'Manufacturing & Rough Materials', value: ProductCategory.ROUGH_MATERIALS },
  { id: '5', name: 'components-materials', displayName: 'Components & Materials', value: ProductCategory.COMPONENTS_MATERIALS },
  { id: '6', name: 'bespoke-custom', displayName: 'Bespoke Custom', value: ProductCategory.BESPOKE_CUSTOM },
  { id: '7', name: 'ring-settings', displayName: 'Ring Settings', value: ProductCategory.RING_SETTINGS }
];

export const SUB_CATEGORIES_MAP: { [key: string]: string[] } = {
  [ProductCategory.FINISHED_JEWELRY]: [
    'Rings (Engagement, Wedding, Cocktail, Signet, Eternity, Birthstone)',
    'Necklaces (Choker, Pendant, Statement, Chain, Lariat, Bar Necklace)',
    'Earrings (Studs, Hoops, Drops, Dangles, Jackets, Bali, Ear Cuffs)',
    'Bracelets (Bangles, Cuffs, Tennis, Beaded, Bolo, Bajuband)',
    'Pendants/Other (Brooches, Watches)'
  ],
  [ProductCategory.LOOSE_GEMSTONES]: [
    'Diamonds',
    'Emeralds',
    'Rubies',
    'Blue Sapphire',
    'Yellow Sapphire',
    'Pearl',
    'Coral',
    "Cat's Eye",
    'Gomedak',
    'Other Colored Gemstones'
  ],
  [ProductCategory.RELIGIOUS_IDOLS]: [
    'Murtis (Ganesh, Krishna, Shiva, Lakshmi)'
  ],
  [ProductCategory.ROUGH_MATERIALS]: [
    'Rough Parcels',
    'Single Rough Crystals'
  ],
  [ProductCategory.COMPONENTS_MATERIALS]: [
    'Findings (Clasps, Hooks)',
    'Beads',
    'Silver Wire'
  ]
};

export enum Occasion {
  ENGAGEMENT = 'Engagement',
  WEDDING = 'Wedding',
  ANNIVERSARY = 'Anniversary',
  DAILY_WEAR = 'Daily Wear'
}

export const OCCASIONS_LIST = [
  Occasion.ENGAGEMENT,
  Occasion.WEDDING,
  Occasion.ANNIVERSARY,
  Occasion.DAILY_WEAR
];

export enum Style {
  MODERN = 'Modern',
  VINTAGE = 'Vintage',
  CLASSIC_SOLITAIRE = 'Classic Solitaire',
  HALO = 'Halo'
}

export const STYLES_LIST = [
  Style.MODERN,
  Style.VINTAGE,
  Style.CLASSIC_SOLITAIRE,
  Style.HALO
];
