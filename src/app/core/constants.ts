export enum ProductCategory {
  FINISHED_JEWELRY = 'Jewelry',
  LOOSE_GEMSTONES = 'Gemstones',
  RELIGIOUS_IDOLS = 'Spiritual Idols',
  ROUGH_MATERIALS = 'Materials & Roughs',
  COMPONENTS_MATERIALS = 'Components',
  BESPOKE_CUSTOM = 'Custom Made',
  RING_SETTINGS = 'Settings'
}

export const APP_CATEGORIES = [
  { id: '1', name: 'jewelry', displayName: 'Jewelry', value: ProductCategory.FINISHED_JEWELRY },
  { id: '2', name: 'gemstones', displayName: 'Gemstones', value: ProductCategory.LOOSE_GEMSTONES },
  { id: '3', name: 'spiritual-idols', displayName: 'Spiritual Idols', value: ProductCategory.RELIGIOUS_IDOLS },
  { id: '4', name: 'materials-&-roughs', displayName: 'Materials & Roughs', value: ProductCategory.ROUGH_MATERIALS },
  { id: '5', name: 'components', displayName: 'Components', value: ProductCategory.COMPONENTS_MATERIALS },
  { id: '6', name: 'custom-made', displayName: 'Custom Made', value: ProductCategory.BESPOKE_CUSTOM },
  { id: '7', name: 'settings', displayName: 'Settings', value: ProductCategory.RING_SETTINGS }
];

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

export const RING_CATEGORIES = [
  'Engagement Ring',
  'Gemstone Ring',
  'Ring Setting',
  'Ring'
];
