import {CategoryItem, LanguageCode, TransactionType, WalletAccount} from '../types';

export interface AiParsedTransaction {
  type: TransactionType;
  title: string;
  amount: number;
  category: string;
  walletId: string;
  date: string;
  subcategory?: string;
}

export interface AiSmartEntryResult {
  transcript: string;
  transactions: AiParsedTransaction[];
}

export interface AiScanShoppingItem {
  name: string;
  quantity?: string;
  estimatedPrice?: number;
}

export interface AiScanReceiptResult {
  merchantOrSource: string;
  summary: string;
  transactions: AiParsedTransaction[];
  shoppingItems: AiScanShoppingItem[];
}

export interface AiAdvisorSummaryPayload {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  budgetCap: number;
  totalWalletBalance: number;
  receivable: number;
  payable: number;
  topCategories: Array<{name: string; amount: number}>;
  dailyAvg: number;
  upcomingDueCount: number;
  upcomingDueTotal: number;
}

export interface AiAdvisorResult {
  healthStatus: 'strong' | 'balanced' | 'caution' | string;
  headline: string;
  highlights: string[];
  actionableTips: string[];
  forecastNote: string;
}

async function postJson<T>(url: string, body: unknown, language: LanguageCode): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      language === 'bn'
        ? 'AI ফিচার ব্যবহার করতে ইন্টারনেট সংযোগ প্রয়োজন।'
        : 'Internet connection is required for AI features.'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error ||
        (language === 'bn'
          ? 'AI সার্ভারে সংযোগ করা যায়নি।'
          : 'Could not reach the AI service.')
    );
  }
  return data as T;
}

export function requestAiSmartEntry(params: {
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  categories: CategoryItem[];
  wallets: WalletAccount[];
  currency: string;
  language: LanguageCode;
  todayDate: string;
}): Promise<AiSmartEntryResult> {
  return postJson<AiSmartEntryResult>(
    '/api/ai/smart-entry',
    {
      ...params,
      categories: params.categories.map((c) => ({name: c.name, type: c.type})),
      wallets: params.wallets.map((w) => ({id: w.id, name: w.name})),
    },
    params.language
  );
}

export function requestAiScanReceipt(params: {
  imageBase64?: string;
  imageMimeType?: string;
  rawText?: string;
  categories: CategoryItem[];
  wallets: WalletAccount[];
  currency: string;
  language: LanguageCode;
  todayDate: string;
}): Promise<AiScanReceiptResult> {
  return postJson<AiScanReceiptResult>(
    '/api/ai/scan-receipt',
    {
      ...params,
      categories: params.categories.map((c) => ({name: c.name, type: c.type})),
      wallets: params.wallets.map((w) => ({id: w.id, name: w.name})),
    },
    params.language
  );
}

export function requestAiMonthlyAdvisor(params: {
  monthTitle: string;
  currency: string;
  language: LanguageCode;
  summary: AiAdvisorSummaryPayload;
}): Promise<AiAdvisorResult> {
  return postJson<AiAdvisorResult>('/api/ai/advisor', params, params.language);
}

export function requestAiLedgerChat(params: {
  message: string;
  history: Array<{role: 'user' | 'model'; text: string}>;
  financialContext: Record<string, unknown>;
  language: LanguageCode;
}): Promise<{reply: string}> {
  return postJson<{reply: string}>('/api/ai/chat', params, params.language);
}
