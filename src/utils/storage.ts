import {
  CashTraceState,
  CategoryItem,
  MonthStore,
  QuickTemplate,
  SmartMemoryItem,
  Transaction,
  WalletAccount,
} from '../types';
import {getLocalMonthKey} from './formatters';

const STORAGE_KEY_V5 = 'cashtrace_state_v5';

export const DEFAULT_WALLETS: WalletAccount[] = [
  {id: 'cash', name: 'হাতে নগদ (Cash)', type: 'cash', initialBalance: 0, color: '#059669'},
  {id: 'bkash', name: 'বিকাশ / নগদ', type: 'mobile', initialBalance: 0, color: '#e11d48'},
  {id: 'bank', name: 'ব্যাংক অ্যাকাউন্ট', type: 'bank', initialBalance: 0, color: '#2563eb'},
];

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  // Expense categories
  {id: 'exp_cat_1', name: '🛒 কাঁচা বাজার', type: 'expense', color: '#10b981'},
  {id: 'exp_cat_2', name: '🍱 খাবার ও নাস্তা', type: 'expense', color: '#f59e0b'},
  {id: 'exp_cat_3', name: '🚌 যাতায়াত ও রাইড', type: 'expense', color: '#06b6d4'},
  {id: 'exp_cat_4', name: '🏠 বাসা ভাড়া ও বিল', type: 'expense', color: '#8b5cf6'},
  {id: 'exp_cat_5', name: '📚 পড়াশোনা ও বই', type: 'expense', color: '#3b82f6'},
  {id: 'exp_cat_6', name: '💊 চিকিৎসা ও ওষুধ', type: 'expense', color: '#f43f5e'},
  {id: 'exp_cat_7', name: '👕 জামাকাপড় ও কেনাকাটা', type: 'expense', color: '#ec4899'},
  {id: 'exp_cat_8', name: '🎬 বিনোদন ও রিচার্জ', type: 'expense', color: '#6366f1'},
  {id: 'exp_cat_9', name: '💡 অন্যান্য খরচ', type: 'expense', color: '#64748b'},
  // Income categories
  {id: 'inc_cat_1', name: '💼 মাসিক বেতন', type: 'income', color: '#059669'},
  {id: 'inc_cat_2', name: '👨‍👩‍👦 অভিভাবক / পকেট মানি', type: 'income', color: '#0d9488'},
  {id: 'inc_cat_3', name: '📚 টিউশনি / কোচিং', type: 'income', color: '#0284c7'},
  {id: 'inc_cat_4', name: '💻 ফ্রিল্যান্সিং ও প্রজেক্ট', type: 'income', color: '#7c3aed'},
  {id: 'inc_cat_5', name: '🎁 উপহার / বোনাস', type: 'income', color: '#d97706'},
  {id: 'inc_cat_6', name: '🪙 অন্যান্য আয়', type: 'income', color: '#475569'},
];

export const DEFAULT_SMART_MEMORY: SmartMemoryItem[] = [
  {id: 'sm_1', title: 'মেস / বাসা ভাড়া', amount: 5000, category: '🏠 বাসা ভাড়া ও বিল', walletId: 'cash'},
  {id: 'sm_2', title: 'ইন্টারনেট বিল', amount: 500, category: '🏠 বাসা ভাড়া ও বিল', walletId: 'bkash'},
];

export const DEFAULT_QUICK_TEMPLATES: QuickTemplate[] = [
  {id: 'qt_1', title: 'রিকশা / বাস ভাড়া', amount: 30, category: '🚌 যাতায়াত ও রাইড', type: 'expense', walletId: 'cash'},
  {id: 'qt_2', title: 'চা ও নাস্তা', amount: 50, category: '🍱 খাবার ও নাস্তা', type: 'expense', walletId: 'cash'},
  {id: 'qt_3', title: 'দুপুরের খাবার', amount: 120, category: '🍱 খাবার ও নাস্তা', type: 'expense', walletId: 'cash'},
  {id: 'qt_4', title: 'মোবাইল রিচার্জ', amount: 100, category: '🎬 বিনোদন ও রিচার্জ', type: 'expense', walletId: 'bkash'},
];

export function createInitialState(): CashTraceState {
  const currentMonth = getLocalMonthKey();
  return {
    version: 5,
    profile: {
      name: 'ইউজার',
      currency: '৳',
      pin: '',
      pinLock: false,
      darkMode: false,
      hideBalance: false,
      language: 'bn',
    },
    wallets: DEFAULT_WALLETS,
    months: {
      [currentMonth]: {
        budgetCap: 0,
        transactions: [],
      },
    },
    categories: DEFAULT_CATEGORIES,
    smartMemory: DEFAULT_SMART_MEMORY,
    quickTemplates: DEFAULT_QUICK_TEMPLATES,
    savingsGoals: [],
    debts: [],
  };
}

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Migrates legacy v4 localStorage keys into unified v5 state seamlessly.
 */
function migrateFromV4(): CashTraceState | null {
  const v4Monthly = safeParseJSON<Record<string, {budgetCap?: number; items?: any[]; incomeItems?: any[]}>>(
    localStorage.getItem('cashtrace_monthly_data_v4')
  );
  const v4Profile = safeParseJSON<{name?: string; currency?: string; pin?: string; pinLock?: boolean}>(
    localStorage.getItem('cashtrace_user_profile_v4')
  );
  const v4Savings = safeParseJSON<Array<{title: string; target: number; saved: number}>>(
    localStorage.getItem('cashtrace_savings_goals_v4')
  );
  const v4SmartMemory = safeParseJSON<Array<{id?: string; title: string; amount: number; category?: string}>>(
    localStorage.getItem('cashtrace_smart_memory_v4')
  );

  if (!v4Monthly && !v4Profile && !v4Savings && !v4SmartMemory) {
    return null;
  }

  const base = createInitialState();
  if (v4Profile) {
    base.profile.name = v4Profile.name || base.profile.name;
    base.profile.currency = v4Profile.currency || base.profile.currency;
    base.profile.pin = v4Profile.pin || '';
    base.profile.pinLock = Boolean(v4Profile.pinLock && v4Profile.pin);
  }

  if (v4Monthly) {
    const migratedMonths: Record<string, MonthStore> = {};
    for (const [mKey, mVal] of Object.entries(v4Monthly)) {
      const txs: Transaction[] = [];
      (mVal.items || []).forEach((item, idx) => {
        txs.push({
          id: item.id || `mig_exp_${mKey}_${idx}`,
          type: 'expense',
          title: String(item.title || 'খরচ'),
          amount: Number(item.amount) || 0,
          category: String(item.category || '💡 অন্যান্য খরচ'),
          subcategory: item.subcategory ? String(item.subcategory) : undefined,
          date: String(item.date || `${mKey}-01`),
          walletId: 'cash',
          createdAt: Date.now() - idx,
        });
      });
      (mVal.incomeItems || []).forEach((item, idx) => {
        txs.push({
          id: item.id || `mig_inc_${mKey}_${idx}`,
          type: 'income',
          title: String(item.title || 'আয়'),
          amount: Number(item.amount) || 0,
          category: String(item.category || '🪙 অন্যান্য আয়'),
          date: String(item.date || `${mKey}-01`),
          walletId: 'cash',
          createdAt: Date.now() - idx,
        });
      });
      migratedMonths[mKey] = {
        budgetCap: Number(mVal.budgetCap) || 0,
        transactions: txs,
      };
    }
    base.months = {...base.months, ...migratedMonths};
  }

  if (Array.isArray(v4Savings)) {
    base.savingsGoals = v4Savings.map((g, idx) => ({
      id: `goal_${Date.now()}_${idx}`,
      title: String(g.title || 'সেভিংস'),
      target: Number(g.target) || 1000,
      saved: Number(g.saved) || 0,
      createdAt: Date.now(),
    }));
  }

  if (Array.isArray(v4SmartMemory) && v4SmartMemory.length > 0) {
    base.smartMemory = v4SmartMemory.map((sm, idx) => ({
      id: sm.id || `sm_${idx}`,
      title: String(sm.title || 'ফিক্সড খরচ'),
      amount: Number(sm.amount) || 0,
      category: String(sm.category || '🏠 বাসা ভাড়া ও বিল'),
      walletId: 'cash',
    }));
  }

  return base;
}

export function loadState(): CashTraceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V5);
    const parsed = safeParseJSON<Partial<CashTraceState>>(raw);
    if (parsed && parsed.version === 5) {
      const defaults = createInitialState();
      return {
        ...defaults,
        ...parsed,
        profile: {...defaults.profile, ...(parsed.profile || {})},
        wallets: Array.isArray(parsed.wallets) && parsed.wallets.length > 0 ? parsed.wallets : defaults.wallets,
        months: parsed.months || defaults.months,
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : defaults.categories,
        smartMemory: Array.isArray(parsed.smartMemory) ? parsed.smartMemory : defaults.smartMemory,
        quickTemplates: Array.isArray(parsed.quickTemplates) ? parsed.quickTemplates : defaults.quickTemplates,
        savingsGoals: Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [],
        debts: Array.isArray(parsed.debts) ? parsed.debts : [],
      };
    }

    const migrated = migrateFromV4();
    if (migrated) {
      saveState(migrated);
      return migrated;
    }
  } catch {
    // Fallback cleanly if storage is unavailable
  }
  return createInitialState();
}

export function saveState(state: CashTraceState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function validateBackupPayload(raw: unknown): CashTraceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Support v5 backup format
  if (obj.version === 5 && obj.months && obj.profile) {
    const defaults = createInitialState();
    return {
      ...defaults,
      ...(obj as unknown as CashTraceState),
      version: 5,
      profile: {...defaults.profile, ...((obj.profile as object) || {})},
    };
  }

  // Also support legacy v4 backup JSON seamlessly!
  if (obj.monthlyDataStore || obj.userProfile) {
    const base = createInitialState();
    const prof = (obj.userProfile || {}) as Record<string, any>;
    base.profile.name = String(prof.name || 'ইউজার');
    base.profile.currency = String(prof.currency || '৳');
    base.profile.pin = String(prof.pin || '');
    base.profile.pinLock = Boolean(prof.pinLock && prof.pin);

    const mStore = (obj.monthlyDataStore || {}) as Record<string, any>;
    for (const [mKey, mVal] of Object.entries(mStore)) {
      const txs: Transaction[] = [];
      (mVal.items || []).forEach((item: any, idx: number) => {
        txs.push({
          id: item.id || `imp_exp_${mKey}_${idx}`,
          type: 'expense',
          title: String(item.title || 'খরচ'),
          amount: Number(item.amount) || 0,
          category: String(item.category || '💡 অন্যান্য খরচ'),
          subcategory: item.subcategory ? String(item.subcategory) : undefined,
          date: String(item.date || `${mKey}-01`),
          walletId: 'cash',
          createdAt: Date.now() - idx,
        });
      });
      (mVal.incomeItems || []).forEach((item: any, idx: number) => {
        txs.push({
          id: item.id || `imp_inc_${mKey}_${idx}`,
          type: 'income',
          title: String(item.title || 'আয়'),
          amount: Number(item.amount) || 0,
          category: String(item.category || '🪙 অন্যান্য আয়'),
          date: String(item.date || `${mKey}-01`),
          walletId: 'cash',
          createdAt: Date.now() - idx,
        });
      });
      base.months[mKey] = {budgetCap: Number(mVal.budgetCap) || 0, transactions: txs};
    }

    if (Array.isArray(obj.savingsGoals)) {
      base.savingsGoals = obj.savingsGoals.map((g: any, idx: number) => ({
        id: g.id || `goal_${idx}`,
        title: String(g.title || 'সেভিংস'),
        target: Number(g.target) || 1000,
        saved: Number(g.saved) || 0,
        createdAt: Date.now(),
      }));
    }
    if (Array.isArray(obj.smartMemoryItems)) {
      base.smartMemory = obj.smartMemoryItems.map((sm: any, idx: number) => ({
        id: sm.id || `sm_${idx}`,
        title: String(sm.title || 'ফিক্সড খরচ'),
        amount: Number(sm.amount) || 0,
        category: String(sm.category || '🏠 বাসা ভাড়া ও বিল'),
        walletId: 'cash',
      }));
    }
    return base;
  }

  return null;
}
