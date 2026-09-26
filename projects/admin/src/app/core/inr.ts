/**
 * Indian number formatting for the analytics pages: ₹12,34,567 (lakh/crore
 * grouping) and a compact form (₹1.2 L, ₹3.4 Cr) for chart axes. Built on
 * Intl with en-IN, which every supported browser groups the Indian way.
 */

const FULL = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const TWO = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹12,34,567 (no paise). Null and undefined become an em dash. */
export function inr(value: number | string | null | undefined, paise = false): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + '₹' + (paise ? TWO : FULL).format(Math.abs(n));
}

/** ₹950, ₹12.5 K, ₹1.2 L, ₹3.4 Cr: short labels for axes and tiles. */
export function inrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);
  const fmt = (v: number, unit: string) => {
    const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return sign + '₹' + s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1') + unit;
  };
  if (n >= 1e7) return fmt(n / 1e7, ' Cr');
  if (n >= 1e5) return fmt(n / 1e5, ' L');
  if (n >= 1e3) return fmt(n / 1e3, ' K');
  return sign + '₹' + FULL.format(n);
}

/** 12,34,567 without the rupee sign, for counts. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return FULL.format(value);
}

/** "+12.5%" / "-3.0%" / "—" for a percentage delta. */
export function pct(value: number | null | undefined, signed = true): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  const s = value.toFixed(1).replace(/\.0$/, '');
  return (signed && value > 0 ? '+' : '') + s + '%';
}
