/**
 * Indian financial year and GST return period helpers.
 *
 * Eleven screens opened with a date literal frozen in their source --
 * '2026-04-01' for the year-to-date filters, '2026-08' for the GST and banking
 * periods -- and the sidebar told every user they were in "FY 2026-27"
 * regardless. On 1 April 2027 all of them would quietly show the wrong year:
 * the registers would open on a closed period and report nothing, with no
 * error and nothing on screen to say which period was being shown.
 *
 * The Indian financial year runs 1 April to 31 March, so the year a date
 * belongs to is not its calendar year for the first three months.
 */

/** The month the Indian financial year begins (1-indexed). */
const FY_START_MONTH = 4;

/** The calendar year the financial year containing `on` began in. */
export function financialYearStartYear(on: Date = new Date()): number {
  const year = on.getFullYear();
  // January to March still belong to the year that opened last April.
  return on.getMonth() + 1 >= FY_START_MONTH ? year : year - 1;
}

/** First day of the current financial year, as YYYY-MM-DD. */
export function financialYearStart(on: Date = new Date()): string {
  return `${financialYearStartYear(on)}-04-01`;
}

/** Last day of the current financial year, as YYYY-MM-DD. */
export function financialYearEnd(on: Date = new Date()): string {
  return `${financialYearStartYear(on) + 1}-03-31`;
}

/** The label the business uses for it, e.g. "2026-27". */
export function financialYearLabel(on: Date = new Date()): string {
  const start = financialYearStartYear(on);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** A date as YYYY-MM-DD, in local time rather than UTC. */
export function isoDate(on: Date = new Date()): string {
  const m = String(on.getMonth() + 1).padStart(2, '0');
  const d = String(on.getDate()).padStart(2, '0');
  return `${on.getFullYear()}-${m}-${d}`;
}

/** Today, as YYYY-MM-DD. */
export function today(): string {
  return isoDate(new Date());
}

/** The current GST return period, as YYYY-MM. */
export function currentPeriod(on: Date = new Date()): string {
  return `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}`;
}

/** A date range, as YYYY-MM-DD strings. */
export interface DateRange {
  from: string;
  to: string;
  /** Where the range came from: the company's active fiscal year, or the calendar fallback. */
  label: string;
}

/**
 * The company's ACTIVE fiscal year as the default ledger range, falling back
 * to the Indian financial year containing today when the API cannot answer.
 *
 * Ledgers and books must open on the year the company is working in, not on
 * the current month: a statement that starts on the 1st of this month hides
 * every earlier voucher and shows a running balance that agrees with nothing.
 * The "to" date is today when today falls inside the year (so future-dated
 * vouchers do not appear), otherwise the year's last day.
 */
export async function activeFiscalYearRange(): Promise<DateRange> {
  const fallback: DateRange = { from: financialYearStart(), to: today(), label: `FY ${financialYearLabel()} (calendar)` };
  try {
    const { fiscalYearsApi } = await import('./api');
    const res = await fiscalYearsApi.list();
    const years = res.data?.fiscal_years || [];
    const active = years.find((y) => y.is_active) || years.find((y) => y.start_date <= today() && today() <= y.end_date);
    if (!active) return fallback;
    const t = today();
    const to = t >= active.start_date && t <= active.end_date ? t : active.end_date;
    return { from: active.start_date, to, label: `FY ${active.year_label}` };
  } catch {
    return fallback;
  }
}

/**
 * The period a return is normally being prepared for: the month just gone.
 *
 * GSTR-1 for a month is filed by the 11th of the next one, so a compliance
 * screen opened mid-month is usually wanted for the previous period.
 */
export function previousPeriod(on: Date = new Date()): string {
  const d = new Date(on.getFullYear(), on.getMonth() - 1, 1);
  return currentPeriod(d);
}
