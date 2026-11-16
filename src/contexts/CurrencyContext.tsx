import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {
  CachedRatesPayload,
  convertCurrencyAmount,
  FALLBACK_USD_RATES,
  fetchLiveExchangeRates,
  getConversionRate,
  loadCachedRates,
  resolveCurrencyCode,
} from '../services/currencyService';
import {LanguageCode} from '../types';
import {formatMoney} from '../utils/formatters';

interface CurrencyContextValue {
  baseCurrency: string;
  displayCurrency: string;
  baseCode: string;
  displayCode: string;
  rate: number;
  rates: Record<string, number>;
  ratesUpdatedAt: number;
  isLiveRate: boolean;
  rateSource: 'live' | 'offline';
  refreshingRates: boolean;
  refreshRates: () => Promise<void>;
  convertToDisplay: (baseAmount: number) => number;
  convertToBase: (displayAmount: number) => number;
  formatConverted: (baseAmount: number, hideBalance?: boolean) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  baseCurrency: '৳',
  displayCurrency: '৳',
  baseCode: 'BDT',
  displayCode: 'BDT',
  rate: 1,
  rates: FALLBACK_USD_RATES,
  ratesUpdatedAt: 0,
  isLiveRate: false,
  rateSource: 'offline',
  refreshingRates: false,
  refreshRates: async () => {},
  convertToDisplay: (n) => n,
  convertToBase: (n) => n,
  formatConverted: (n) => formatMoney(n, '৳', 'bn', false),
});

interface CurrencyProviderProps {
  baseCurrency: string;
  displayCurrency: string;
  language: LanguageCode;
  children: React.ReactNode;
}

const RATE_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

export const CurrencyProvider: React.FC<CurrencyProviderProps> = ({
  baseCurrency,
  displayCurrency,
  language,
  children,
}) => {
  const [cached, setCached] = useState<CachedRatesPayload>(() => loadCachedRates());
  const [refreshingRates, setRefreshingRates] = useState(false);

  const refreshRates = useCallback(async () => {
    setRefreshingRates(true);
    try {
      const next = await fetchLiveExchangeRates();
      setCached(next);
    } finally {
      setRefreshingRates(false);
    }
  }, []);

  useEffect(() => {
    const isStale = !cached.updatedAt || Date.now() - cached.updatedAt > RATE_STALE_MS;
    if (isStale && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      refreshRates();
    }
  }, [cached.updatedAt, refreshRates]);

  const baseCode = resolveCurrencyCode(baseCurrency);
  const displayCode = resolveCurrencyCode(displayCurrency);

  const rate = useMemo(
    () => getConversionRate(baseCurrency, displayCurrency, cached.rates),
    [baseCurrency, displayCurrency, cached.rates]
  );

  const convertToDisplay = useCallback(
    (baseAmount: number) => convertCurrencyAmount(baseAmount, baseCurrency, displayCurrency, cached.rates),
    [baseCurrency, displayCurrency, cached.rates]
  );

  const convertToBase = useCallback(
    (displayAmount: number) => convertCurrencyAmount(displayAmount, displayCurrency, baseCurrency, cached.rates),
    [baseCurrency, displayCurrency, cached.rates]
  );

  const formatConverted = useCallback(
    (baseAmount: number, hideBalance = false) => {
      const converted = convertToDisplay(baseAmount);
      return formatMoney(converted, displayCurrency, language, hideBalance);
    },
    [convertToDisplay, displayCurrency, language]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      baseCurrency,
      displayCurrency,
      baseCode,
      displayCode,
      rate,
      rates: cached.rates,
      ratesUpdatedAt: cached.updatedAt,
      isLiveRate: cached.source === 'live',
      rateSource: cached.source,
      refreshingRates,
      refreshRates,
      convertToDisplay,
      convertToBase,
      formatConverted,
    }),
    [
      baseCurrency,
      displayCurrency,
      baseCode,
      displayCode,
      rate,
      cached,
      refreshingRates,
      refreshRates,
      convertToDisplay,
      convertToBase,
      formatConverted,
    ]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
