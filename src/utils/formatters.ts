import {LanguageCode} from '../types';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/**
 * Safely evaluates basic arithmetic (+, -, *, /) without eval().
 */
function evaluateSimpleExpression(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!cleaned) return NaN;
  if (/[^0-9.+\-*/()]/.test(cleaned)) return NaN;

  // Fast path for plain numbers
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  let pos = 0;

  function parseExpression(): number {
    let val = parseTerm();
    while (pos < cleaned.length && (cleaned[pos] === '+' || cleaned[pos] === '-')) {
      const op = cleaned[pos++];
      const rhs = parseTerm();
      if (!Number.isFinite(rhs)) return NaN;
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < cleaned.length && (cleaned[pos] === '*' || cleaned[pos] === '/')) {
      const op = cleaned[pos++];
      const rhs = parseFactor();
      if (!Number.isFinite(rhs)) return NaN;
      if (op === '/') {
        if (rhs === 0) return NaN;
        val = val / rhs;
      } else {
        val = val * rhs;
      }
    }
    return val;
  }

  function parseFactor(): number {
    if (pos >= cleaned.length) return NaN;
    if (cleaned[pos] === '+') {
      pos++;
      return parseFactor();
    }
    if (cleaned[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (cleaned[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (cleaned[pos] !== ')') return NaN;
      pos++;
      return val;
    }
    const start = pos;
    let hasDot = false;
    let hasDigit = false;
    while (pos < cleaned.length) {
      const ch = cleaned[pos];
      if (ch >= '0' && ch <= '9') {
        hasDigit = true;
        pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        pos++;
      } else {
        break;
      }
    }
    if (!hasDigit) return NaN;
    const num = Number(cleaned.slice(start, pos));
    return Number.isFinite(num) ? num : NaN;
  }

  const result = parseExpression();
  if (pos !== cleaned.length || !Number.isFinite(result)) return NaN;
  return Math.round(result * 100) / 100;
}

/**
 * Converts Bengali numerals (০-৯) to ASCII digits and evaluates numbers or simple math expressions (e.g. "120+45").
 */
export function parseLocaleNumber(raw: string | number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const normalized = String(raw)
    .trim()
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)))
    .replace(/,/g, '');
  if (!normalized) return NaN;
  return evaluateSimpleExpression(normalized);
}

/**
 * Returns true if the input contains arithmetic operators beyond a leading negative sign.
 */
export function hasMathOperators(raw: string): boolean {
  const trimmed = raw.trim().replace(/^[+-]/, '');
  return /[+\-*/×÷]/.test(trimmed);
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
