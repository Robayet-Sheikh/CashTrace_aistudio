import {LanguageCode} from '../types';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/**
 * Converts Bengali numerals (০-৯) to standard ASCII digits (0-9) and parses float safely.
 */
export function parseLocaleNumber(raw: string | number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const normalized = String(raw)
    .trim()
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)))
    .replace(/,/g, '');
  if (!normalized) return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Converts ASCII digits to Bengali numerals when language === 'bn'.
 */
export function normalizeDigits(raw: string, language: LanguageCode = 'bn'): string {
  if (language !== 'bn') return raw;
  return raw.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);
}

/**
 * Normalizes a 4-digit PIN input from either Bengali or English keyboard to ASCII digits.
 */
export function normalizePinDigits(raw: string): string {
  return raw
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)))
    .replace(/[^0-9]/g, '')
    .slice(0, 4);
}

/**
 * Timezone-safe YYYY-MM key from local Date. Never uses toISOString() which shifts to UTC.
 */
export function getLocalMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Timezone-safe YYYY-MM-DD string from local Date.
 */
export function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses YYYY-MM into a local Date on the 1st of that month.
 */
export function parseMonthKey(monthKey: string): Date {
  const [yStr, mStr] = monthKey.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || 1;
  return new Date(year, month - 1, 1);
}

/**
 * Returns formatted month title e.g. "নভেম্বর ২০২৬" or "November 2026".
 */
export function formatMonthTitle(monthKey: string, language: LanguageCode = 'bn'): string {
  const dateObj = parseMonthKey(monthKey);
  try {
    return dateObj.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthKey;
  }
}

/**
 * Returns short month label for charts (e.g., "নভে", "ডিসে" or "Nov", "Dec").
 */
export function formatShortMonth(monthKey: string, language: LanguageCode = 'bn'): string {
  const dateObj = parseMonthKey(monthKey);
  try {
    return dateObj.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      month: 'short',
    });
  } catch {
    return monthKey.slice(5);
  }
}

/**
 * Generates last N month keys ending at `endMonthKey`.
 */
export function getTrailingMonthKeys(endMonthKey: string, count: number): string[] {
  const base = parseMonthKey(endMonthKey);
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    result.push(getLocalMonthKey(d));
  }
  return result;
}

/**
 * Formats currency with tabular numerals & optional privacy mask.
 */
export function formatMoney(
  amount: number,
  currency: string = '৳',
  language: LanguageCode = 'bn',
  hideBalance: boolean = false
): string {
  if (hideBalance) return `${currency} •••••`;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatted = Math.abs(safeAmount).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', {
    maximumFractionDigits: 2,
  });
  const sign = safeAmount < 0 ? '-' : '';
  return `${sign}${currency} ${formatted}`;
}

/**
 * Formats a YYYY-MM-DD date into readable local format.
 */
export function formatDisplayDate(dateStr: string, language: LanguageCode = 'bn'): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  try {
    return d.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}
