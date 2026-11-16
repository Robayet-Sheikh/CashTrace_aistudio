import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calculator,
  CalendarClock,
  Cloud,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  ImageDown,
  Loader2,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  ShoppingBasket,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {
  AppTab,
  CardStyle,
  CategoryBudget,
  CategoryItem,
  DebtRecord,
  LanguageCode,
  MonthStore,
  ProfileMeta,
  Transaction,
  WalletAccount,
} from '../types';
import {exportMonthlySummaryPNGCard} from '../utils/exportHelper';
import {
  formatDisplayDate,
  formatMoney,
  formatMonthTitle,
  getLocalDateStr,
  getLocalMonthKey,
  parseLocaleNumber,
  parseMonthKey,
} from '../utils/formatters';
import {t} from '../utils/i18n';
import {parseSmartQuickEntry} from '../utils/smartParser';
import {PocketToolId} from './PocketToolsTab';

interface DashboardTabProps {
  selectedMonthKey: string;
  monthStore: MonthStore;
  months: Record<string, MonthStore>;
  wallets: WalletAccount[];
  debts: DebtRecord[];
  categories: CategoryItem[];
  categoryBudgets?: CategoryBudget[];
  activeProfile?: ProfileMeta;
  userName: string;
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  smartMemoryCount: number;
  pendingShoppingCount: number;
  heroCardStyle?: CardStyle;
  accentColor?: string;
  cloudUserEmail?: string | null;
  authBusy?: boolean;
  onSignInGoogle?: () => void;
  onToggleHideBalance: () => void;
  onUpdateBudgetCap: (cap: number) => void;
  onApplySmartMemory: () => void;
  onQuickAddTransaction?: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onOpenNewTransaction: (type: 'expense' | 'income') => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onNavigateTab: (tab: AppTab) => void;
  onOpenPocketTool?: (toolId: PocketToolId) => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
  onShowToast?: (msg: string) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  selectedMonthKey,
  monthStore,
  months,
  wallets,
  debts,
  categories,
  categoryBudgets = [],
  activeProfile,
  userName,
  language,
  hideBalance,
  smartMemoryCount,
  pendingShoppingCount,
  heroCardStyle = 'gradient',
  accentColor = '#059669',
  cloudUserEmail,
  authBusy,
  onSignInGoogle,
  onToggleHideBalance,
  onUpdateBudgetCap,
  onApplySmartMemory,
  onQuickAddTransaction,
  onOpenNewTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateTab,
  onOpenPocketTool,
  onOpenPrintModal,
  onExportExcel,
  onShowToast,
}) => {
  const {
    baseCode,
    displayCode,
    displayCurrency,
    rate,
    refreshingRates,
    refreshRates,
    convertToBase,
    convertToDisplay,
    formatConverted,
  } = useCurrency();

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);
  const [quickEntryText, setQuickEntryText] = useState('');
  const [sharingCard, setSharingCard] = useState(false);

  const transactions = monthStore.transactions || [];
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');

  const totalIncome = incomes.reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const totalWalletBalance = React.useMemo(() => {
    const balances = new Map<string, number>();
    wallets.forEach((w) => balances.set(w.id, w.initialBalance || 0));
    Object.values(months).forEach((m) => {
      (m.transactions || []).forEach((tx) => {
        if (tx.type === 'income') {
          balances.set(tx.walletId, (balances.get(tx.walletId) || 0) + tx.amount);
        } else if (tx.type === 'expense') {
          balances.set(tx.walletId, (balances.get(tx.walletId) || 0) - tx.amount);
        } else if (tx.type === 'transfer') {
          balances.set(tx.walletId, (balances.get(tx.walletId) || 0) - tx.amount);
          if (tx.toWalletId) {
            balances.set(tx.toWalletId, (balances.get(tx.toWalletId) || 0) + tx.amount);
          }
        }
      });
    });
    let sum = 0;
    balances.forEach((v) => {
      sum += v;
    });
    return sum;
  }, [wallets, months]);

  const debtSummary = React.useMemo(() => {
    let receivable = 0;
    let payable = 0;
    let pendingCount = 0;
    debts.forEach((d) => {
      if (d.settled) return;
      const rem = Math.max(0, d.amount - d.paidAmount);
      if (rem <= 0) return;
      pendingCount += 1;
      if (d.type === 'lent') receivable += rem;
      else payable += rem;
    });
    return {
      receivable,
      payable,
      net: receivable - payable,
      pendingCount,
    };
  }, [debts]);

  const currentMonthKey = getLocalMonthKey();
  const isCurrentMonth = selectedMonthKey === currentMonthKey;
  const isPastMonth = selectedMonthKey < currentMonthKey;

  const monthDate = parseMonthKey(selectedMonthKey);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const todayDay = new Date().getDate();

  let dailyMetricValue = 0;
  let dailyMetricCaption = '';
  if (isPastMonth) {
    dailyMetricValue = Math.round(totalExpense / daysInMonth);
    dailyMetricCaption = t('গড় দৈনিক খরচ (মাস শেষ)', 'Avg daily spend (ended)', language);
  } else if (isCurrentMonth) {
    const remainingDays = Math.max(1, daysInMonth - todayDay + 1);
    dailyMetricValue = netBalance > 0 ? Math.floor(netBalance / remainingDays) : 0;
    dailyMetricCaption = t(`বাকি ${remainingDays} দিনের লিমিট`, `For remaining ${remainingDays} days`, language);
  } else {
    dailyMetricValue = netBalance > 0 ? Math.floor(netBalance / daysInMonth) : 0;
    dailyMetricCaption = t(`${daysInMonth} দিনের মাসিক হিসাব`, `Across ${daysInMonth} days`, language);
  }

  // Budget status calculation
  const budgetCap = monthStore.budgetCap || 0;
  const budgetPct = budgetCap > 0 ? Math.round((totalExpense / budgetCap) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, budgetPct));

  let budgetLabel = t('বাজেট নির্ধারিত নয়', 'No Budget Set', language);
  let budgetColorClass = 'text-slate-600 dark:text-slate-300';
  let barColorClass = 'bg-emerald-500';
  if (budgetCap > 0) {
    if (budgetPct >= 100) {
      budgetLabel = t('বাজেট অতিক্রম করেছে!', 'Over Budget', language);
      budgetColorClass = 'text-rose-600 dark:text-rose-400';
      barColorClass = 'bg-rose-500';
    } else if (budgetPct >= 75) {
      budgetLabel = t('সতর্কতা (সীমার কাছাকাছি)', 'Approaching Limit', language);
      budgetColorClass = 'text-amber-600 dark:text-amber-400';
      barColorClass = 'bg-amber-500';
    } else {
      budgetLabel = t('স্বাভাবিক ও নিয়ন্ত্রিত', 'On Track', language);
      budgetColorClass = 'text-emerald-600 dark:text-emerald-400';
      barColorClass = 'bg-emerald-500';
    }
  }

  // Top 3 spending categories
  const catTotals = new Map<string, number>();
  expenses.forEach((tx) => {
    catTotals.set(tx.category, (catTotals.get(tx.category) || 0) + tx.amount);
  });
  const catColorMap = new Map(categories.map((c) => [c.name, c.color]));
  const topCategories = Array.from(catTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const recentTx = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5);

  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));

  const parsedQuickEntry = useMemo(
    () => parseSmartQuickEntry(quickEntryText, wallets, categories),
    [quickEntryText, wallets, categories]
  );

  const categoryBudgetAlerts = useMemo(() => {
    if (!categoryBudgets.length) return [];
    return categoryBudgets
      .map((cb) => {
        const spent = catTotals.get(cb.category) || 0;
        const pct = cb.limit > 0 ? Math.round((spent / cb.limit) * 100) : 0;
        return {...cb, spent, pct};
      })
      .filter((item) => item.limit > 0 && item.pct >= 80)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [categoryBudgets, catTotals]);

  const openBudgetEditor = () => {
    setBudgetInput(budgetCap > 0 ? String(convertToDisplay(budgetCap)) : '');
    setBudgetModalOpen(true);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseLocaleNumber(budgetInput);
    if (!isNaN(val) && val >= 0) {
      onUpdateBudgetCap(convertToBase(val));
      setBudgetModalOpen(false);
    }
  };

  const handleQuickEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedQuickEntry.valid || !onQuickAddTransaction) return;
    onQuickAddTransaction({
      type: parsedQuickEntry.type,
      title: parsedQuickEntry.title,
      category: parsedQuickEntry.category,
      walletId: parsedQuickEntry.walletId,
      amount: convertToBase(parsedQuickEntry.amount),
      date: getLocalDateStr(),
    });
    setQuickEntryText('');
  };

  const handleShareSummaryCard = async () => {
    if (sharingCard) return;
    setSharingCard(true);
    try {
      const res = await exportMonthlySummaryPNGCard({
        periodLabel: formatMonthTitle(selectedMonthKey, language),
        userName,
        currency: displayCurrency,
        language,
        accentColor,
        totalIncome,
        totalExpense,
        netBalance,
        budgetCap,
        topCategories: topCategories.map(([name, amount]) => ({
          name,
          amount,
          color: catColorMap.get(name) || accentColor,
        })),
        fxRate: rate,
      });
      onShowToast?.(
        res === 'shared'
          ? t('মাসিক কার্ড শেয়ারের জন্য প্রস্তুত!', 'Monthly card ready to share!', language)
          : t('মাসিক সামারি কার্ড (PNG) সেভ হয়েছে!', 'Monthly summary card saved!', language)
      );
    } catch {
      onShowToast?.(t('কার্ড তৈরি করতে সমস্যা হয়েছে', 'Failed to generate card', language));
    } finally {
      setSharingCard(false);
    }
  };

  const isGradientHero = heroCardStyle === 'gradient';

  return (
    <div className="space-y-6">
      {!cloudUserEmail && !syncBannerDismissed && onSignInGoogle && (
        <div className="ct-surface-card border border-emerald-200 dark:border-emerald-800/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl ct-accent-soft flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 font-medium">
              {t(
                'Google দিয়ে লগইন করলে আপনার সব হিসাব ফ্রি ক্লাউডে সুরক্ষিত থাকবে ও যেকোনো ডিভাইসে ফিরে পাবেন।',
                'Sign in with Google to safely back up and sync your data across devices for free.',
                language
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={authBusy}
              onClick={onSignInGoogle}
              className="px-3 py-1.5 ct-btn-radius ct-accent-bg text-white text-xs font-bold transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {authBusy ? t('লগইন হচ্ছে...', 'Signing in...', language) : t('Google লগইন', 'Google Login', language)}
            </button>
            <button
              type="button"
              onClick={() => setSyncBannerDismissed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Primary Monthly Balance Hero */}
      <div
        className={`rounded-3xl p-5 sm:p-7 transition-all ${
          isGradientHero
            ? 'ct-hero-gradient text-white shadow-lg'
            : heroCardStyle === 'glass'
            ? 'ct-hero-glass border text-slate-900 dark:text-white'
            : 'ct-surface-card border shadow-sm text-slate-900 dark:text-white'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div
              className={`flex flex-wrap items-center gap-2 text-xs font-medium ${
                isGradientHero ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span>{formatMonthTitle(selectedMonthKey, language)}</span>
              {isCurrentMonth && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t('চলতি মাস', 'Current Month', language)}</span>
                </>
              )}
              {activeProfile && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeProfile.name}</span>
                </>
              )}
              {baseCode !== displayCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] ${
                      isGradientHero ? 'bg-white/15 text-white' : 'ct-accent-soft'
                    }`}
                  >
                    1 {baseCode} ≈ {rate.toFixed(2)} {displayCode}
                    <button
                      type="button"
                      onClick={refreshRates}
                      disabled={refreshingRates}
                      title={t('রেট রিফ্রেশ করুন', 'Refresh FX rates', language)}
                      className="ml-0.5 hover:opacity-80"
                    >
                      <RefreshCw className={`w-3 h-3 ${refreshingRates ? 'animate-spin' : ''}`} />
                    </button>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h2 className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">
                {formatConverted(netBalance, hideBalance)}
              </h2>
              <button
                type="button"
                onClick={onToggleHideBalance}
                className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors ${
                  isGradientHero
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'ct-surface-alt hover:opacity-80 text-slate-700 dark:text-slate-200'
                }`}
                title={hideBalance ? t('ব্যালেন্স দেখান', 'Show Balance', language) : t('ব্যালেন্স লুকান', 'Hide Balance', language)}
                aria-label="Toggle balance visibility"
              >
                {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleShareSummaryCard}
                disabled={sharingCard}
                className={`min-h-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors ${
                  isGradientHero
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'ct-surface-alt hover:opacity-80 text-slate-700 dark:text-slate-200'
                }`}
                title={t('মাসিক কার্ড PNG সেভ/শেয়ার', 'Share Monthly Summary Card', language)}
              >
                {sharingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
                <span className="hidden sm:inline">{t('শেয়ার কার্ড', 'Card', language)}</span>
              </button>
            </div>

            <p className={`text-xs sm:text-sm ${isGradientHero ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}>
              {t(`স্বাগতম, ${userName}। এই মাসের অবশিষ্ট ব্যালেন্স।`, `Welcome, ${userName}. Monthly net balance.`, language)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {smartMemoryCount > 0 && (
              <button
                type="button"
                onClick={onApplySmartMemory}
                className={`px-3.5 py-2.5 ct-btn-radius text-xs font-semibold inline-flex items-center gap-2 transition-colors min-h-[44px] ${
                  isGradientHero
                    ? 'bg-black/20 hover:bg-black/30 border border-white/25 text-white'
                    : 'ct-surface-alt border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>{t(`ফিক্সড খরচ (${smartMemoryCount})`, `Fixed Costs (${smartMemoryCount})`, language)}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenNewTransaction('income')}
              className={`px-4 py-2.5 ct-btn-radius text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors min-h-[44px] ${
                isGradientHero
                  ? 'bg-black/20 hover:bg-black/30 border border-white/25 text-white'
                  : 'ct-accent-soft border ct-accent-border'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>+ {t('আয়', 'Income', language)}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTransaction('expense')}
              className={`px-4 py-2.5 ct-btn-radius text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors min-h-[44px] ${
                isGradientHero
                  ? 'bg-white text-slate-900 hover:bg-white/95'
                  : 'ct-accent-bg text-white hover:opacity-95'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{t('খরচ যোগ', 'Add Expense', language)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Smart Quick-Entry NLP Bar */}
      {onQuickAddTransaction && (
        <div className="ct-surface-card border p-3.5 sm:p-4 space-y-2.5">
          <form onSubmit={handleQuickEntrySubmit} className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Sparkles className="w-4 h-4 ct-accent-text absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickEntryText}
                onChange={(e) => setQuickEntryText(e.target.value)}
                placeholder={t(
                  'স্মার্ট কুইক এন্ট্রি: "চা নাস্তা ৫০ বিকাশ" বা "বেতন ৩০০০০ ব্যাংক"',
                  'Smart Quick Entry: "Lunch 250 cash" or "Salary 30000 bank"',
                  language
                )}
                className="w-full ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 ct-btn-radius pl-10 pr-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={!parsedQuickEntry.valid}
              className="px-4 py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 min-h-[42px]"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('সেভ', 'Add', language)}</span>
            </button>
          </form>

          {quickEntryText.trim().length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] px-1">
              {parsedQuickEntry.valid ? (
                <>
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      parsedQuickEntry.type === 'income'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {parsedQuickEntry.type === 'income' ? t('আয়', 'Income', language) : t('খরচ', 'Expense', language)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{parsedQuickEntry.title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{parsedQuickEntry.category}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {walletMap.get(parsedQuickEntry.walletId) || 'Cash'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-bold tabular-nums ct-accent-text">
                    {formatMoney(parsedQuickEntry.amount, displayCurrency, language)}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">
                  {t(
                    'উদাহরণ: "রিকশা ৩০" বা "বাজার ৪৫০ নগদ" — টাকার অঙ্ক লিখুন',
                    'Tip: include an amount like "Coffee 120 cash"',
                    language
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Category Budget Alert Strip */}
      {categoryBudgetAlerts.length > 0 && (
        <div className="ct-surface-card border border-amber-200 dark:border-amber-800/70 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('খাতভিত্তিক বাজেট সতর্কতা', 'Category Budget Alerts', language)}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-[11px] underline hover:opacity-80"
            >
              {t('ম্যানেজ করুন', 'Manage', language)}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {categoryBudgetAlerts.map((cb) => (
              <div
                key={cb.id}
                className="px-3 py-2 rounded-xl ct-surface-alt flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{cb.category}</span>
                <span
                  className={`font-bold tabular-nums shrink-0 ${
                    cb.pct >= 100 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {cb.pct}% · {formatConverted(cb.spent, hideBalance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4-Card KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="ct-surface-card border p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('মাসিক মোট আয়', 'Total Income', language)}</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatConverted(totalIncome, hideBalance)}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {t(`${incomes.length} টি আয়ের এন্ট্রি`, `${incomes.length} income entries`, language)}
          </p>
        </div>

        <div className="ct-surface-card border p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('মাসিক মোট খরচ', 'Total Expense', language)}</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatConverted(totalExpense, hideBalance)}
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {t(`${expenses.length} টি খরচের এন্ট্রি`, `${expenses.length} expense entries`, language)}
          </p>
        </div>

        <div className="ct-surface-card border p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('অবশিষ্ট ব্যালেন্স', 'Net Balance', language)}</span>
            <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold tabular-nums ${
              netBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatConverted(netBalance, hideBalance)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('আয় থেকে খরচ বাদ', 'Income minus expense', language)}
          </p>
        </div>

        <div className="ct-surface-card border p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{isPastMonth ? t('দৈনিক গড়', 'Daily Average', language) : t('দৈনিক লিমিট', 'Daily Target', language)}</span>
            <Target className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatConverted(dailyMetricValue, hideBalance)}
          </div>
          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">{dailyMetricCaption}</p>
        </div>
      </div>

      {/* 3-Card Financial Snapshot Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('wallets')}
          className="ct-surface-card border hover:ct-accent-border p-4 text-left transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('মোট ওয়ালেট স্থিতি', 'Total Wallet Balance', language)}</span>
            <Wallet className="w-4 h-4 ct-accent-text" />
          </div>
          <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {formatConverted(totalWalletBalance, hideBalance)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t(`${wallets.length} টি ওয়ালেটে লাইভ ব্যালেন্স`, `Live across ${wallets.length} wallets`, language)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('wallets')}
          className="ct-surface-card border hover:ct-accent-border p-4 text-left transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('বাকি ও দেনা-পাওনা', 'Pending Debts Net', language)}</span>
            <ArrowUpRight
              className={`w-4 h-4 ${
                debtSummary.net < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${
              debtSummary.net < 0
                ? 'text-rose-600 dark:text-rose-400'
                : debtSummary.net > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {debtSummary.net > 0 ? '+' : debtSummary.net < 0 ? '-' : ''}
            {formatConverted(Math.abs(debtSummary.net), hideBalance)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {debtSummary.pendingCount > 0
              ? t(
                  `পাব ${formatConverted(debtSummary.receivable, hideBalance)} · দেব ${formatConverted(debtSummary.payable, hideBalance)}`,
                  `Get ${formatConverted(debtSummary.receivable, hideBalance)} · Owe ${formatConverted(debtSummary.payable, hideBalance)}`,
                  language
                )
              : t('কোনো বকেয়া হিসাব নেই', 'All settled up', language)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('shopping')}
          className="ct-surface-card border hover:ct-accent-border p-4 text-left transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('বাজারের ফর্দ', 'Shopping Queue', language)}</span>
            <ShoppingBasket className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {pendingShoppingCount > 0
              ? t(`${pendingShoppingCount} টি আইটেম বাকি`, `${pendingShoppingCount} items left`, language)
              : t('সব কেনা সম্পন্ন', 'All caught up', language)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('ট্যাপ করে বাজার লিস্ট দেখুন', 'Tap to open shopping lists', language)}
          </p>
        </button>
      </div>

      {/* Pocket Tools Shortcut Strip */}
      {onOpenPocketTool && (
        <div className="ct-surface-card border p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {t('দৈনন্দিন পকেট টুলস', 'Daily Pocket Tools', language)}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('tools')}
              className="text-xs font-semibold ct-accent-text hover:underline"
            >
              {t('সব টুলস দেখুন', 'Open Tools Hub', language)}
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                {id: 'converter', bn: 'কারেন্সি কনভার্টার', en: 'FX Converter', icon: ArrowLeftRight},
                {id: 'fees', bn: 'বিকাশ/নগদ চার্জ', en: 'MFS Fee Calc', icon: Calculator},
                {id: 'bills', bn: 'মাসিক বিল রিমাইন্ডার', en: 'Bill Reminders', icon: CalendarClock},
                {id: 'split', bn: 'বিল স্প্লিট', en: 'Split Bill', icon: Users},
                {id: 'receipt', bn: 'রশিদ মেকার', en: 'Receipt Maker', icon: Receipt},
              ] as const
            ).map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onOpenPocketTool(tool.id)}
                  className="px-3 py-2 ct-btn-radius ct-surface-alt border border-slate-200/70 dark:border-slate-700/70 hover:ct-accent-border text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Icon className="w-3.5 h-3.5 ct-accent-text" />
                  <span>{t(tool.bn, tool.en, language)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget Progress + Top Categories Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        {/* Monthly Budget Card */}
        <div className="ct-surface-card border p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('মাসিক বাজেট সীমা', 'Monthly Budget Limit', language)}
              </h3>
              <p className={`text-xs font-semibold mt-0.5 ${budgetColorClass}`}>{budgetLabel}</p>
            </div>
            <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {budgetCap > 0 ? `${budgetPct}%` : '—'}
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
              style={{width: `${barWidth}%`}}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('বাজেট সীমা', 'Budget Cap', language)}:{' '}
              <strong className="text-slate-900 dark:text-white tabular-nums">
                {formatConverted(budgetCap, hideBalance)}
              </strong>
            </span>
            <button
              type="button"
              onClick={openBudgetEditor}
              className="ct-accent-text font-semibold hover:underline min-h-[36px] px-2"
            >
              {budgetCap > 0 ? t('বাজেট পরিবর্তন', 'Edit Budget', language) : t('বাজেট সেট করুন', 'Set Budget', language)}
            </button>
          </div>
        </div>

        {/* Top 3 Spending Categories */}
        <div className="ct-surface-card border p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('শীর্ষ খরচের খাতসমূহ', 'Top Spending Categories', language)}
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-semibold ct-accent-text hover:underline"
            >
              {t('সব রিপোর্ট দেখুন', 'View Analytics', language)}
            </button>
          </div>

          {topCategories.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              {t('খরচ যোগ করলে এখানে শীর্ষ খাতগুলো দেখাবে।', 'Top categories will appear once expenses are added.', language)}
            </p>
          ) : (
            <div className="space-y-3">
              {topCategories.map(([catName, amt]) => {
                const share = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                const color = catColorMap.get(catName) || accentColor;
                return (
                  <div key={catName} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{catName}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatConverted(amt, hideBalance)}{' '}
                        <span className="text-slate-400 font-normal">({share}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{width: `${share}%`, backgroundColor: color}} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent 5 Transactions */}
      <div className="ct-surface-card border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('সাম্প্রতিক লেনদেন', 'Recent Transactions', language)}
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-semibold ct-accent-text hover:underline"
          >
            {t('সকল তালিকা দেখুন', 'See All', language)}
          </button>
        </div>

        {recentTx.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('এই মাসে এখনো কোনো আয় বা খরচ যোগ করা হয়নি।', 'No transactions yet for this month.', language)}
            </p>
            <button
              type="button"
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('প্রথম এন্ট্রি যোগ করুন', 'Add First Entry', language)}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentTx.map((tx) => {
              const isInc = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';
              return (
                <div
                  key={tx.id}
                  className="py-2.5 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {tx.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {formatDisplayDate(tx.date, language)} · {tx.category} · {walletMap.get(tx.walletId) || 'Cash'}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums shrink-0 ${
                        isInc
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isTransfer
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isInc ? '+' : isTransfer ? '⇄ ' : '-'}
                      {formatConverted(tx.amount, hideBalance)}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:ct-accent-text rounded-lg transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('shopping')}
          className="p-4 ct-surface-card border hover:ct-accent-border flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShoppingBasket className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('বাজার ও শপিং লিস্ট', 'Shopping List', language)}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pendingShoppingCount > 0
                ? t(`${pendingShoppingCount} টি কেনা বাকি আছে`, `${pendingShoppingCount} items left to buy`, language)
                : t('কেনাকাটার ফর্দ তৈরি করুন', 'Plan groceries & lists', language)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('reports')}
          className="p-4 ct-surface-card border hover:ct-accent-border flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('অ্যানালিটিক্স ও গ্রাফ', 'Analytics & Charts', language)}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('খাতভিত্তিক ও ৬ মাসের গ্রাফ', 'Category & 6-month trend', language)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenPrintModal}
          className="p-4 ct-surface-card border hover:ct-accent-border flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('PDF স্টেটমেন্ট', 'PDF Statement', language)}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('প্রিন্ট ও শেয়ারযোগ্য রিপোর্ট', 'Printable & shareable report', language)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onExportExcel}
          className="p-4 ct-surface-card border hover:ct-accent-border flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('এক্সেল এক্সপোর্ট', 'Export Excel', language)}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('কালারফুল স্প্রেডশীট ডাউনলোড', 'Download .xls spreadsheet', language)}
            </p>
          </div>
        </button>
      </div>

      {/* Custom Budget Cap Modal */}
      {budgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('মাসিক বাজেট সীমা নির্ধারণ', 'Set Monthly Budget', language)}
              </h3>
              <button
                type="button"
                onClick={() => setBudgetModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`সর্বোচ্চ বাজেট (${displayCurrency})`, `Maximum Monthly Cap (${displayCurrency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="যেমন: ১৫০০০"
                  autoFocus
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  {t('বাতিল', 'Cancel', language)}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
                >
                  {t('সেভ করুন', 'Save Budget', language)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
