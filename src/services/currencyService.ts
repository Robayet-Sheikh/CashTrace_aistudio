export interface CurrencyInfo {
  code: string;
  symbol: string;
  nameBn: string;
  nameEn: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  {code: 'BDT', symbol: '৳', nameBn: 'বাংলাদেশি টাকা', nameEn: 'Bangladeshi Taka', flag: '🇧🇩'},
  {code: 'USD', symbol: '$', nameBn: 'মার্কিন ডলার', nameEn: 'US Dollar', flag: '🇺🇸'},
  {code: 'EUR', symbol: '€', nameBn: 'ইউরো', nameEn: 'Euro', flag: '🇪🇺'},
  {code: 'GBP', symbol: '£', nameBn: 'ব্রিটিশ পাউন্ড', nameEn: 'British Pound', flag: '🇬🇧'},
  {code: 'INR', symbol: '₹', nameBn: 'ভারতীয় রুপি', nameEn: 'Indian Rupee', flag: '🇮🇳'},
  {code: 'SAR', symbol: '﷼', nameBn: 'সৌদি রিয়াল', nameEn: 'Saudi Riyal', flag: '🇸🇦'},
  {code: 'AED', symbol: 'AED', nameBn: 'দিরহাম', nameEn: 'UAE Dirham', flag: '🇦🇪'},
  {code: 'MYR', symbol: 'RM', nameBn: 'মালয়েশিয়ান রিঙ্গিত', nameEn: 'Malaysian Ringgit', flag: '🇲🇾'},
  {code: 'SGD', symbol: 'S$', nameBn: 'সিঙ্গাপুর ডলার', nameEn: 'Singapore Dollar', flag: '🇸🇬'},
  {code: 'CAD', symbol: 'C$', nameBn: 'কানাডিয়ান ডলার', nameEn: 'Canadian Dollar', flag: '🇨🇦'},
  {code: 'AUD', symbol: 'A$', nameBn: 'অস্ট্রেলিয়ান ডলার', nameEn: 'Australian Dollar', flag: '🇦🇺'},
  {code: 'JPY', symbol: '¥', nameBn: 'জাপানি ইয়েন', nameEn: 'Japanese Yen', flag: '🇯🇵'},
];

// Fallback rates per 1 USD (offline safety net)
export const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  BDT: 121.5,
  EUR: 0.92,
  GBP: 0.79,
  INR: 85.4,
  SAR: 3.75,
  AED: 3.6725,
  MYR: 4.42,
  SGD: 1.34,
  CAD: 1.4,
  AUD: 1.54,
  JPY: 153.5,
};

const FX_STORAGE_KEY = 'cashtrace_fx_rates_v1';

export interface CachedRatesPayload {
  rates: Record<string, number>;
  updatedAt: number;
  source: 'live' | 'offline';
}

const SYMBOL_TO_CODE: Record<string, string> = {
  '৳': 'BDT',
  BDT: 'BDT',
  TK: 'BDT',
  $: 'USD',
  USD: 'USD',
  '€': 'EUR',
  EUR: 'EUR',
  '£': 'GBP',
  GBP: 'GBP',
  '₹': 'INR',
  INR: 'INR',
  RS: 'INR',
  '﷼': 'SAR',
  SAR: 'SAR',
  AED: 'AED',
  RM: 'MYR',
  MYR: 'MYR',
  S$: 'SGD',
  SGD: 'SGD',
  C$: 'CAD',
  CAD: 'CAD',
  A$: 'AUD',
  AUD: 'AUD',
  '¥': 'JPY',
  JPY: 'JPY',
};

export function resolveCurrencyCode(currencyOrSymbol: string | undefined): string {
  const raw = String(currencyOrSymbol || '৳').trim();
  const upper = raw.toUpperCase();
  if (SYMBOL_TO_CODE[raw]) return SYMBOL_TO_CODE[raw];
  if (SYMBOL_TO_CODE[upper]) return SYMBOL_TO_CODE[upper];
  return 'BDT';
}

export function getCurrencyInfo(currencyOrSymbol: string | undefined): CurrencyInfo {
  const code = resolveCurrencyCode(currencyOrSymbol);
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) || SUPPORTED_CURRENCIES[0];
}

export function getCurrencySymbol(currencyOrCode: string | undefined): string {
  const info = getCurrencyInfo(currencyOrCode);
  return info.symbol;
}

export function loadCachedRates(): CachedRatesPayload {
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CachedRatesPayload>;
      if (parsed && parsed.rates && typeof parsed.rates === 'object') {
        return {
          rates: {...FALLBACK_USD_RATES, ...parsed.rates},
          updatedAt: Number(parsed.updatedAt) || 0,
          source: parsed.source === 'live' ? 'live' : 'offline',
        };
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }
  return {
    rates: {...FALLBACK_USD_RATES},
    updatedAt: 0,
    source: 'offline',
  };
}

function saveCachedRates(payload: CachedRatesPayload): void {
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchLiveExchangeRates(): Promise<CachedRatesPayload> {
  const endpoints = [
    'https://open.er-api.com/v6/latest/USD',
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(url, {signal: controller.signal});
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, any>;

      const nextRates: Record<string, number> = {...FALLBACK_USD_RATES};

      if (json && json.rates && typeof json.rates === 'object') {
        for (const info of SUPPORTED_CURRENCIES) {
          const val = Number(json.rates[info.code]);
          if (Number.isFinite(val) && val > 0) {
            nextRates[info.code] = val;
          }
        }
        const payload: CachedRatesPayload = {
          rates: nextRates,
          updatedAt: Date.now(),
          source: 'live',
        };
        saveCachedRates(payload);
        return payload;
      }

      if (json && json.usd && typeof json.usd === 'object') {
        for (const info of SUPPORTED_CURRENCIES) {
          const val = Number(json.usd[info.code.toLowerCase()]);
          if (Number.isFinite(val) && val > 0) {
            nextRates[info.code] = val;
          }
        }
        const payload: CachedRatesPayload = {
          rates: nextRates,
          updatedAt: Date.now(),
          source: 'live',
        };
        saveCachedRates(payload);
        return payload;
      }
    } catch {
      // Try next endpoint or fallback cleanly
    }
  }

  return loadCachedRates();
}

export function getConversionRate(
  fromCurrency: string,
  toCurrency: string,
  usdRates: Record<string, number>
): number {
  const fromCode = resolveCurrencyCode(fromCurrency);
  const toCode = resolveCurrencyCode(toCurrency);
  if (fromCode === toCode) return 1;

  const fromRate = usdRates[fromCode] || FALLBACK_USD_RATES[fromCode] || 1;
  const toRate = usdRates[toCode] || FALLBACK_USD_RATES[toCode] || 1;
  if (fromRate <= 0) return 1;
  return toRate / fromRate;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  usdRates: Record<string, number>
): number {
  if (!Number.isFinite(amount)) return 0;
  const rate = getConversionRate(fromCurrency, toCurrency, usdRates);
  if (rate === 1) return amount;
  return Math.round(amount * rate * 100) / 100;
}
