/** Formatting helpers. Dates from the API are ISO strings; they are treated as calendar dates
 *  (no time zone shifts) so a vote on 2026-09-10 is always labelled Sep 10, 2026. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Parse YYYY-MM-DD (or an ISO timestamp) as a UTC calendar date. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Sep 10, 2026" */
export function formatDate(iso: string): string {
  const d = parseDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Thursday, Sep 10, 2026" */
export function formatLongDate(iso: string): string {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${formatDate(iso)}`;
}

/** "Sep 13, 2026 02:09 UTC" */
export function formatTimestampUtc(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${hh}:${mm} UTC`;
}

export function monthShort(date: Date): string {
  return MONTHS[date.getUTCMonth()];
}

/** 1 -> "1st", 119 -> "119th" */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Congress N convenes on January 3 of 1789 + 2(N - 1). */
export function congressStartDate(congress: number): Date {
  return new Date(Date.UTC(1789 + 2 * (congress - 1), 0, 3));
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatPercent(n: number | null): string {
  return n === null ? 'n/a' : `${n.toFixed(2)}%`;
}

/** Whole dollars: 5467777.07 -> "$5,467,777"; negative amounts keep the sign. */
export function formatMoney(n: number): string {
  const rounded = Math.round(Math.abs(n));
  return `${n < 0 ? '-' : ''}$${rounded.toLocaleString('en-US')}`;
}

/** One-decimal share: 4.63 -> "4.6%". */
export function formatShare(n: number | null): string {
  return n === null ? 'n/a' : `${n.toFixed(1)}%`;
}

const SMALL_WORDS = new Set(['for', 'of', 'the', 'and', 'to', 'a', 'an', 'in', 'on']);

/** "STEIL FOR WISCONSIN, INC." -> "Steil for Wisconsin, Inc."; "JULY QUARTERLY" -> "July Quarterly". */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.replace(/(^|[-(])(\p{L})/gu, (_m, p, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

/** 2026 -> "2025–26 cycle" */
export function cycleLabel(cycle: number): string {
  return `${cycle - 1}–${String(cycle).slice(2)} cycle`;
}

/** Route of a bill detail page: /bills/119/hr/4735 */
export function billPath(congress: number, billType: string, billNumber: string): string {
  return `/bills/${congress}/${billType}/${billNumber}`;
}

/** "119th Congress" */
export function congressLabel(congress: number): string {
  return `${ordinal(congress)} Congress`;
}
