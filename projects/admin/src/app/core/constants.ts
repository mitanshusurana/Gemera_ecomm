export enum ProductCategory {
  FINISHED_JEWELRY = 'Jewelry',
  LOOSE_GEMSTONES = 'Gemstones',
  RELIGIOUS_IDOLS = 'Spiritual Idols',
  ROUGH_MATERIALS = 'Materials & Roughs',
  COMPONENTS_MATERIALS = 'Components',
  BESPOKE_CUSTOM = 'Custom Made',
  RING_SETTINGS = 'Settings'
}

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
