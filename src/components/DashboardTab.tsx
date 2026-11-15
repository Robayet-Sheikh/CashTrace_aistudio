import React, {useState} from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Cloud,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Pencil,
  PieChart,
  Plus,
  ShoppingBasket,
  Target,
  Trash2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {AppTab, CategoryItem, LanguageCode, MonthStore, Transaction, WalletAccount} from '../types';
import {
  formatDisplayDate,
  formatMoney,
  formatMonthTitle,
  getLocalMonthKey,
  parseLocaleNumber,
  parseMonthKey,
} from '../utils/formatters';
import {t} from '../utils/i18n';

interface DashboardTabProps {
  selectedMonthKey: string;
  monthStore: MonthStore;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  userName: string;
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  smartMemoryCount: number;
  pendingShoppingCount: number;
  cloudUserEmail?: string | null;
  authBusy?: boolean;
  onSignInGoogle?: () => void;
  onToggleHideBalance: () => void;
  onUpdateBudgetCap: (cap: number) => void;
  onApplySmartMemory: () => void;
  onOpenNewTransaction: (type: 'expense' | 'income') => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onNavigateTab: (tab: AppTab) => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  selectedMonthKey,
  monthStore,
  wallets,
  categories,
  userName,
  currency,
  language,
  hideBalance,
  smartMemoryCount,
  pendingShoppingCount,
  cloudUserEmail,
  authBusy,
  onSignInGoogle,
  onToggleHideBalance,
  onUpdateBudgetCap,
  onApplySmartMemory,
  onOpenNewTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateTab,
  onOpenPrintModal,
  onExportExcel,
}) => {
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);

  const transactions = monthStore.transactions || [];
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');

  const totalIncome = incomes.reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

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

  const openBudgetEditor = () => {
    setBudgetInput(budgetCap > 0 ? String(budgetCap) : '');
    setBudgetModalOpen(true);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseLocaleNumber(budgetInput);
    if (!isNaN(val) && val >= 0) {
      onUpdateBudgetCap(val);
      setBudgetModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {!cloudUserEmail && !syncBannerDismissed && onSignInGoogle && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
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
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
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
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 rounded-3xl p-5 sm:p-7 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-emerald-100 font-medium">
              <span>{formatMonthTitle(selectedMonthKey, language)}</span>
              {isCurrentMonth && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t('চলতি মাস', 'Current Month', language)}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h2 className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">
                {formatMoney(netBalance, currency, language, hideBalance)}
              </h2>
              <button
                type="button"
                onClick={onToggleHideBalance}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                title={hideBalance ? t('ব্যালেন্স দেখান', 'Show Balance', language) : t('ব্যালেন্স লুকান', 'Hide Balance', language)}
                aria-label="Toggle balance visibility"
              >
                {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <p className="text-xs sm:text-sm text-emerald-100">
              {t(`স্বাগতম, ${userName}। এই মাসের অবশিষ্ট ব্যালেন্স।`, `Welcome, ${userName}. Monthly net balance.`, language)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {smartMemoryCount > 0 && (
              <button
                type="button"
                onClick={onApplySmartMemory}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-900/50 hover:bg-emerald-900/70 border border-emerald-400/30 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors min-h-[44px]"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>{t(`ফিক্সড খরচ (${smartMemoryCount})`, `Fixed Costs (${smartMemoryCount})`, language)}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>{t('নতুন এন্ট্রি', 'New Entry', language)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Card KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('মাসিক মোট আয়', 'Total Income', language)}</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatMoney(totalIncome, currency, language, hideBalance)}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {t(`${incomes.length} টি আয়ের এন্ট্রি`, `${incomes.length} income entries`, language)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('মাসিক মোট খরচ', 'Total Expense', language)}</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatMoney(totalExpense, currency, language, hideBalance)}
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {t(`${expenses.length} টি খরচের এন্ট্রি`, `${expenses.length} expense entries`, language)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{t('অবশিষ্ট ব্যালেন্স', 'Net Balance', language)}</span>
            <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold tabular-nums ${
              netBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            }`}
          >
            {formatMoney(netBalance, currency, language, hideBalance)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('আয় থেকে খরচ বাদ', 'Income minus expense', language)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{isPastMonth ? t('দৈনিক গড়', 'Daily Average', language) : t('দৈনিক লিমিট', 'Daily Target', language)}</span>
            <Target className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatMoney(dailyMetricValue, currency, language, hideBalance)}
          </div>
          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">{dailyMetricCaption}</p>
        </div>
      </div>

      {/* Budget Progress + Top Categories Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        {/* Monthly Budget Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
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
                {formatMoney(budgetCap, currency, language, hideBalance)}
              </strong>
            </span>
            <button
              type="button"
              onClick={openBudgetEditor}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline min-h-[36px] px-2"
            >
              {budgetCap > 0 ? t('বাজেট পরিবর্তন', 'Edit Budget', language) : t('বাজেট সেট করুন', 'Set Budget', language)}
            </button>
          </div>
        </div>

        {/* Top 3 Spending Categories */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('শীর্ষ খরচের খাতসমূহ', 'Top Spending Categories', language)}
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
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
                const color = catColorMap.get(catName) || '#059669';
                return (
                  <div key={catName} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{catName}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(amt, currency, language, hideBalance)}{' '}
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('সাম্প্রতিক লেনদেন', 'Recent Transactions', language)}
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
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
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {tx.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {formatDisplayDate(tx.date, language)} · {tx.category} · {walletMap.get(tx.walletId) || 'Cash'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isInc
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isTransfer
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isInc ? '+' : isTransfer ? '⇄ ' : '-'}
                      {formatMoney(tx.amount, currency, language, hideBalance)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx)}
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
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
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl flex items-center gap-3 text-left transition-colors"
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
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl flex items-center gap-3 text-left transition-colors"
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
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl flex items-center gap-3 text-left transition-colors"
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
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-2xl flex items-center gap-3 text-left transition-colors"
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

      {/* Custom Budget Cap Modal (Replaces window.prompt) */}
      {budgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
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
                  {t(`সর্বোচ্চ বাজেট (${currency})`, `Maximum Monthly Cap (${currency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="যেমন: ১৫০০০"
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  {t('বাতিল', 'Cancel', language)}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
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
