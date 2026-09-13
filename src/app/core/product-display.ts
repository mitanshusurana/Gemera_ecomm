import { Product } from './models';

/**
 * Presentation helpers for the inventory-contract sale modes and item-type
 * fields (INVENTORY-CONTRACT §3 / §6). Pure functions so the storefront cards,
 * quick view and detail page all print the same strings.
 */

/** Sale modes from the inventory contract. */
export type SaleMode = 'PER_PIECE' | 'PER_CARAT' | 'PER_GRAM' | 'PER_LOT' | 'PER_STRAND';

type P = Pick<
  Product,
  | 'price'
  | 'saleMode'
  | 'unitPrice'
  | 'pieceCount'
  | 'lotTotalCaratWeight'
  | 'strandLengthInches'
  | 'beadSizeMm'
  | 'strandCount'
> | null | undefined;

const UNIT_LABELS: Record<string, string> = {
  PER_CARAT: '/ ct',
  PER_GRAM: '/ g',
  PER_STRAND: '/ strand',
  PER_LOT: '/ lot',
};

export const SALE_MODE_LABELS: Record<string, string> = {
  PER_PIECE: 'Per piece',
  PER_CARAT: 'Per carat',
  PER_GRAM: 'Per gram',
  PER_LOT: 'Per lot',
  PER_STRAND: 'Per strand',
};

export const GEM_GRADE_LABELS: Record<string, string> = {
  PRECIOUS: 'Precious',
  SEMI_PRECIOUS: 'Semi-precious',
  ORGANIC: 'Organic',
  LAB_GROWN: 'Lab grown',
};

const PLAIN_OR_STUDDED_LABELS: Record<string, string> = {
  PLAIN: 'Plain',
  STUDDED: 'Studded',
};

/** "58", "7.2", "1,250" -- at most two decimals, no trailing zeros. */
export function fmtQty(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '';
  const v = typeof n === 'number' ? n : Number(n);
  if (!isFinite(v)) return String(n);
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Unit suffix for the sale mode: "/ ct" | "/ g" | "/ strand" | "/ lot" | "" (PER_PIECE or unknown). */
export function unitLabel(p: P): string {
  return UNIT_LABELS[p?.saleMode ?? ''] ?? '';
}

/**
 * The per-unit rate to print as "₹X / ct" or "₹X / g" beside the total.
 * Only PER_CARAT / PER_GRAM have a rate distinct from the price; null otherwise
 * (or when the backend sent no unitPrice).
 */
export function unitRate(p: P): number | null {
  if (!p) return null;
  if (p.saleMode !== 'PER_CARAT' && p.saleMode !== 'PER_GRAM') return null;
  const rate = Number(p.unitPrice);
  return rate > 0 ? rate : null;
}

/**
 * Suffix that applies to the price itself: "/ lot" or "/ strand" when the whole
 * item is the unit, "" otherwise. Distinct from unitLabel() so PER_CARAT totals
 * are never mislabelled as a per-carat figure.
 */
export function totalSuffix(p: P): string {
  const mode = p?.saleMode;
  return mode === 'PER_LOT' || mode === 'PER_STRAND' ? UNIT_LABELS[mode] : '';
}

/**
 * One-line card summary: lots -> "Lot of 42 · 58 ct"; strands -> "16 in · 4 mm beads"
 * (plus "· 3 strands" for multi-line pieces). "" when neither applies.
 */
export function secondaryLine(p: P): string {
  if (!p) return '';
  const isStrand =
    p.saleMode === 'PER_STRAND' || p.strandLengthInches != null || p.strandCount != null;
  const isLot = p.saleMode === 'PER_LOT' || p.lotTotalCaratWeight != null;

  if (isStrand) {
    const parts: string[] = [];
    if (p.strandLengthInches) parts.push(`${fmtQty(p.strandLengthInches)} in`);
    if (p.beadSizeMm) parts.push(`${fmtQty(p.beadSizeMm)} mm beads`);
    if (p.strandCount && p.strandCount > 1) parts.push(`${fmtQty(p.strandCount)} strands`);
    return parts.join(' · ');
  }
  if (isLot) {
    const parts: string[] = [];
    if (p.pieceCount) parts.push(`Lot of ${fmtQty(p.pieceCount)}`);
    if (p.lotTotalCaratWeight) parts.push(`${fmtQty(p.lotTotalCaratWeight)} ct`);
    return parts.join(' · ');
  }
  return '';
}

/** PRECIOUS -> "Precious", SEMI_PRECIOUS -> "Semi-precious", ORGANIC -> "Organic", LAB_GROWN -> "Lab grown". */
export function gemGradeLabel(code: string | null | undefined): string {
  if (!code) return '';
  return GEM_GRADE_LABELS[code] ?? titleCase(code);
}

/** PER_CARAT -> "Per carat", etc. */
export function saleModeLabel(code: string | null | undefined): string {
  if (!code) return '';
  return SALE_MODE_LABELS[code] ?? titleCase(code);
}

/** PLAIN -> "Plain", STUDDED -> "Studded". */
export function plainOrStuddedLabel(code: string | null | undefined): string {
  if (!code) return '';
  return PLAIN_OR_STUDDED_LABELS[code] ?? titleCase(code);
}

function titleCase(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
