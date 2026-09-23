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
