/**
 * Label / SKU helpers (OPERATIONS-CONTRACT §1). Pure functions, no Angular.
 */
import { ITEM_TYPE_LABEL, ItemType, SaleMode, UNIT_PRICE_SUFFIX, isItemType } from './item-types';

/** `{storefrontUrl}/p/{sku}` — what every printed QR encodes. */
export function productQrUrl(storefrontUrl: string, sku: string): string {
  return `${storefrontUrl.replace(/\/+$/, '')}/p/${encodeURIComponent(sku)}`;
}

/**
 * A scanner may deliver either a raw SKU or a URL containing `/p/{sku}`;
 * return the SKU either way (trimmed, URL-decoded), or '' for empty input.
 */
export function extractSku(input: string | null | undefined): string {
  const text = (input ?? '').trim();
  if (!text) return '';
  const m = text.match(/\/p\/([^/?#]+)/i);
  if (m) {
    try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); }
  }
  return text;
}

/**
 * ProductDTO carries no itemType; infer it from `itemType` when present,
 * otherwise from the type-scoped fields that only one section fills in.
 */
export function inferItemType(p: any): ItemType | null {
  if (!p) return null;
  if (isItemType(p.itemType)) return p.itemType;
  const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  if (has(p.componentType)) return 'COMPONENT';
  if (has(p.strandLengthInches) || has(p.beadSizeMm) || has(p.beadStyle)) return 'STRAND_BEADS';
  if (has(p.roughWeight) || has(p.roughMaterial)) return 'ROUGH';
  if (has(p.subjectDeityName) || has(p.carvingStyle) || has(p.gemstoneMaterial)) return 'IDOL_CARVING';
  if (has(p.lotTotalCaratWeight) || (has(p.pieceCount) && has(p.species))) return 'GEMSTONE_LOT';
  if (has(p.caratWeight) || has(p.species) || has(p.variety)) return 'LOOSE_GEMSTONE';
  if (has(p.metalDetails?.metalType) || has(p.grossWeight) || has(p.stoneDetails)) return 'JEWELLERY';
  return null;
}

export function itemTypeBadge(p: any): string {
  const t = inferItemType(p);
  return t ? ITEM_TYPE_LABEL[t] : (p?.category || '');
}

/** Money as `₹1,23,456` (no decimals when whole). */
export function formatInr(value: unknown): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return '';
  const digits = Number.isInteger(n) ? 0 : 2;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * The price line for a label: the unit price with its suffix when the item is
 * sold by carat / gram / lot / strand and a unit price is set, else the price.
 */
export function labelPrice(p: any): string {
  const mode = (p?.saleMode || 'PER_PIECE') as SaleMode;
  const suffix = UNIT_PRICE_SUFFIX[mode];
  if (mode !== 'PER_PIECE' && p?.unitPrice != null && p.unitPrice !== '') {
    return `${formatInr(p.unitPrice)} ${suffix}`;
  }
  return formatInr(p?.price);
}

function qty(v: unknown, unit: string, dp = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return '';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(dp).replace(/\.?0+$/, '');
  return `${s} ${unit}`;
}

/**
 * Key weight per §1: carat for stones / lots / rough, gross grams for
 * jewellery (and sets, idols), length for strands, total grams for components.
 */
export function keyWeight(p: any): string {
  switch (inferItemType(p)) {
    case 'LOOSE_GEMSTONE': return qty(p.caratWeight, 'ct');
    case 'GEMSTONE_LOT': return qty(p.lotTotalCaratWeight ?? p.totalCaratWeight, 'ct');
    case 'ROUGH': return qty(p.roughWeight, 'ct');
    case 'STRAND_BEADS': return qty(p.strandLengthInches, 'in');
    case 'COMPONENT': return qty(p.totalWeight ?? p.grossWeight, 'g');
    case 'JEWELLERY':
    case 'SET':
    case 'IDOL_CARVING': return qty(p.grossWeight ?? p.metalDetails?.netWeight, 'g');
    default:
      return qty(p?.caratWeight, 'ct') || qty(p?.grossWeight, 'g');
  }
}

/** §5 client-side low-stock rule: `stock <= (reorderPointAlert ?? 1)`. */
export function isLowStock(p: any): boolean {
  const stock = Number(p?.stock ?? 0);
  const point = p?.reorderPointAlert == null ? 1 : Number(p.reorderPointAlert);
  return Number.isFinite(stock) && stock <= point;
}
