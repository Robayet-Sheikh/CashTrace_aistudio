import React, {useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BellRing,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  ImageDown,
  KeyRound,
  ListChecks,
  Loader2,
  Mic,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShoppingBasket,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {
  AppTab,
  CardStyle,
  CategoryBudget,
  CategoryItem,
  DailyTask,
  DebtRecord,
  LanguageCode,
  MonthStore,
  ProfileMeta,
  RecurringBill,
  Transaction,
  VaultItem,
  WalletAccount,
} from '../types';
import {computeDueAlerts, DueAlertItem} from '../utils/dueAlerts';
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
import {AiHubTab} from './AIAssistantModal';
import {PocketToolId} from './PocketToolsTab';

interface DashboardTabProps {
  selectedMonthKey: string;
  monthOptions: Array<{key: string; label: string}>;
  onSelectMonth: (monthKey: string) => void;
  onShiftMonth: (delta: number) => void;
  monthStore: MonthStore;
  months: Record<string, MonthStore>;
  wallets: WalletAccount[];
  debts: DebtRecord[];
  recurringBills?: RecurringBill[];
  vaultItems?: VaultItem[];
  categories: CategoryItem[];
  categoryBudgets?: CategoryBudget[];
  activeProfile?: ProfileMeta;
  userName: string;
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  smartMemoryCount: number;
  pendingShoppingCount: number;
  dailyTasks?: DailyTask[];
  heroCardStyle?: CardStyle;
  accentColor?: string;
  cloudUserEmail?: string | null;
  authBusy?: boolean;
  onSignInGoogle?: () => void;
  onToggleHideBalance: () => void;
  onUpdateBudgetCap: (cap: number) => void;
  onApplySmartMemory: () => void;
  onQuickAddTransaction?: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onPayRecurringBill?: (bill: RecurringBill, monthKey: string) => void;
  onToggleDailyTask?: (task: DailyTask) => void;
  onQuickAddDailyTask?: (title: string) => void;
  onOpenSpotlightSearch?: () => void;
  onOpenAiStudio?: (tab: AiHubTab) => void;
  onOpenNewTransaction: (type: 'expense' | 'income') => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onNavigateTab: (tab: AppTab) => void;
  onOpenPocketTool?: (toolId: PocketToolId) => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
  onShowToast?: (msg: string) => void;
}

type InfoDrawerKey = 'wallets' | 'budget' | 'tasks' | 'actions' | null;

export const DashboardTab: React.FC<DashboardTabProps> = ({
  selectedMonthKey,
  monthOptions,
  onSelectMonth,
  onShiftMonth,
  monthStore,
  months,
  wallets,
  debts,
  recurringBills = [],
  vaultItems = [],
  categories,
  categoryBudgets = [],
  activeProfile,
  userName,
  language,
  hideBalance,
  smartMemoryCount,
  pendingShoppingCount,
  dailyTasks = [],
  heroCardStyle = 'gradient',
  accentColor = '#059669',
  cloudUserEmail,
  authBusy,
  onSignInGoogle,
  onToggleHideBalance,
  onUpdateBudgetCap,
  onApplySmartMemory,
  onQuickAddTransaction,
  onPayRecurringBill,
  onToggleDailyTask,
  onQuickAddDailyTask,
  onOpenSpotlightSearch,
  onOpenAiStudio,
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
  const [quickEntryText, setQuickEntryText] = useState('');
  const [quickTaskText, setQuickTaskText] = useState('');
  const [sharingCard, setSharingCard] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<InfoDrawerKey>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const transactions = monthStore.transactions || [];
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');

  const totalIncome = incomes.reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const walletBalancesList = useMemo(() => {
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
    return wallets.map((w) => ({
      ...w,
      liveBalance: balances.get(w.id) || 0,
    }));
  }, [wallets, months]);

  const totalWalletBalance = useMemo(
    () => walletBalancesList.reduce((s, w) => s + w.liveBalance, 0),
    [walletBalancesList]
  );

  const debtSummary = useMemo(() => {
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
  let dailyMetricLabel = '';
  if (isPastMonth) {
    dailyMetricValue = Math.round(totalExpense / daysInMonth);
    dailyMetricLabel = t('দৈনিক গড়', 'Daily Avg', language);
  } else if (isCurrentMonth) {
    const remainingDays = Math.max(1, daysInMonth - todayDay + 1);
    dailyMetricValue = netBalance > 0 ? Math.floor(netBalance / remainingDays) : 0;
    dailyMetricLabel = t(`দৈনিক লিমিট`, 'Daily Limit', language);
  } else {
    dailyMetricValue = netBalance > 0 ? Math.floor(netBalance / daysInMonth) : 0;
    dailyMetricLabel = t('দৈনিক হিসাব', 'Daily Cap', language);
  }

  // Budget status
  const budgetCap = monthStore.budgetCap || 0;
  const budgetPct = budgetCap > 0 ? Math.round((totalExpense / budgetCap) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, budgetPct));
  const barColorClass =
    budgetPct >= 100 ? 'bg-rose-500' : budgetPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

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

  const pendingTasks = dailyTasks.filter((item) => !item.done);

  const dueAlerts = useMemo(
    () =>
      computeDueAlerts({
        recurringBills,
        debts,
        vaultItems,
      }),
    [recurringBills, debts, vaultItems]
  );

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

  const toggleDrawer = (key: InfoDrawerKey) => {
    setActiveDrawer((prev) => (prev === key ? null : key));
  };

  const isGradientHero = heroCardStyle === 'gradient';

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
      {/* Compact Workspace Top Bar + Corner Month Timeline */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {t(`হিসাব-নিকাশ · ${userName}`, `Overview · ${userName}`, language)}
          </h1>
          {!cloudUserEmail && onSignInGoogle && (
            <button
              type="button"
              disabled={authBusy}
              onClick={onSignInGoogle}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs shrink-0 transition-colors"
              title={t('ফ্রি গুগল ক্লাউড সিঙ্ক চালু করুন', 'Enable free Google Cloud Sync', language)}
            >
              <Cloud className="w-3 h-3" />
              <span>{authBusy ? t('সিঙ্ক...', 'Sync...', language) : t('ক্লাউড সিঙ্ক', 'Sync', language)}</span>
            </button>
          )}
        </div>

        {/* Compact Corner Timeline Switcher */}
        <div className="bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/80 rounded-xl px-1.5 py-1 inline-flex items-center gap-0.5 shrink-0 max-w-full">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            className="w-7 h-7 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 flex items-center justify-center text-indigo-700 dark:text-indigo-300 transition-colors shrink-0"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="inline-flex items-center gap-1 px-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <select
              value={selectedMonthKey}
              onChange={(e) => onSelectMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-indigo-950 dark:text-indigo-100 outline-none cursor-pointer max-w-[130px] sm:max-w-none truncate"
              aria-label="Select month"
            >
              {monthOptions.map((opt) => (
                <option key={opt.key} value={opt.key} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            className="w-7 h-7 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 flex items-center justify-center text-indigo-700 dark:text-indigo-300 transition-colors shrink-0"
            aria-label="Next month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary Hero Command Card (Compact & Scannable) */}
      <motion.div
        initial={{opacity: 0, y: 8}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.22}}
        className={`w-full min-w-0 overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 transition-all ${
          isGradientHero
            ? 'ct-hero-gradient text-white shadow-lg'
            : heroCardStyle === 'glass'
            ? 'ct-hero-glass border text-slate-900 dark:text-white'
            : 'ct-surface-card border shadow-sm text-slate-900 dark:text-white'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div
              className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold ${
                isGradientHero ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span>{t('মাসিক নেট ব্যালেন্স', 'Monthly Net Balance', language)}</span>
              {activeProfile && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{activeProfile.name}</span>
                </>
              )}
              {baseCode !== displayCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={refreshRates}
                    disabled={refreshingRates}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] ${
                      isGradientHero ? 'bg-white/15 text-white' : 'ct-accent-soft'
                    }`}
                    title={t('রেট রিফ্রেশ করুন', 'Refresh FX rates', language)}
                  >
                    1 {baseCode} ≈ {rate.toFixed(2)} {displayCode}
                    <RefreshCw className={`w-2.5 h-2.5 ${refreshingRates ? 'animate-spin' : ''}`} />
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl sm:text-4xl font-bold tabular-nums tracking-tight">
                {formatConverted(netBalance, hideBalance)}
              </h2>
              <button
                type="button"
                onClick={onToggleHideBalance}
                className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center transition-colors ${
                  isGradientHero
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'ct-surface-alt text-slate-700 dark:text-slate-200'
                }`}
                aria-label="Toggle balance visibility"
              >
                {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Primary Color-Differentiated Entry Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {smartMemoryCount > 0 && (
              <button
                type="button"
                onClick={onApplySmartMemory}
                className={`px-3 py-2 ct-btn-radius text-xs font-bold inline-flex items-center gap-1.5 min-h-[42px] shadow-sm transition-colors ${
                  isGradientHero
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t(`ফিক্সড (${smartMemoryCount})`, `Fixed (${smartMemoryCount})`, language)}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenNewTransaction('income')}
              className={`px-3.5 py-2 ct-btn-radius text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 min-h-[42px] shadow-sm transition-colors ${
                isGradientHero
                  ? 'bg-emerald-950/60 hover:bg-emerald-950/80 border border-emerald-200/45 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>+ {t('আয়', 'Income', language)}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm min-h-[42px] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('খরচ যোগ', 'Add Expense', language)}</span>
            </button>
          </div>
        </div>

        {/* Integrated 3-Metric Compact Strip (Income / Expense / Daily Target) */}
        <div
          className={`mt-4 pt-3.5 border-t grid grid-cols-3 gap-2 ${
            isGradientHero ? 'border-white/20' : 'border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <div className="min-w-0">
            <p className={`text-[10px] sm:text-xs font-semibold ${isGradientHero ? 'text-emerald-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {t('মোট আয়', 'Income', language)}
            </p>
            <p className="text-sm sm:text-lg font-bold tabular-nums truncate mt-0.5">
              {formatConverted(totalIncome, hideBalance)}
            </p>
          </div>

          <div className="min-w-0">
            <p className={`text-[10px] sm:text-xs font-semibold ${isGradientHero ? 'text-rose-100' : 'text-rose-600 dark:text-rose-400'}`}>
              {t('মোট খরচ', 'Expense', language)}
            </p>
            <p className="text-sm sm:text-lg font-bold tabular-nums truncate mt-0.5">
              {formatConverted(totalExpense, hideBalance)}
            </p>
          </div>

          <div className="min-w-0">
            <p className={`text-[10px] sm:text-xs font-semibold ${isGradientHero ? 'text-sky-100' : 'text-sky-600 dark:text-sky-400'}`}>
              {dailyMetricLabel}
            </p>
            <p className="text-sm sm:text-lg font-bold tabular-nums truncate mt-0.5">
              {formatConverted(dailyMetricValue, hideBalance)}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Upcoming Due & Expiry Alerts Card */}
      <AnimatePresence>
        {dueAlerts.length > 0 && (
          <motion.div
            initial={{opacity: 0, y: 6}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -4}}
            transition={{duration: 0.18}}
            className="ct-surface-card border border-amber-300/80 dark:border-amber-800/70 p-3.5 sm:p-4 space-y-2.5 min-w-0 overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <BellRing className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {t(
                      `আসন্ন বিল, দেনা ও মেয়াদ সতর্কতা (${dueAlerts.length})`,
                      `Upcoming Bills, Debts & Expiry Alerts (${dueAlerts.length})`,
                      language
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t('সময়মতো পরিশোধ ও মেয়াদ রিনিউ করতে ১-ট্যাপ অ্যাকশন নিন', '1-tap action to pay bills or review dues on time', language)}
                  </p>
                </div>
              </div>
              {dueAlerts.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllAlerts((p) => !p)}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[11px] font-bold hover:opacity-85 shrink-0"
                >
                  {showAllAlerts
                    ? t('কম দেখুন', 'Show Less', language)
                    : t(`সব দেখুন (${dueAlerts.length})`, `See All (${dueAlerts.length})`, language)}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {(showAllAlerts ? dueAlerts : dueAlerts.slice(0, 3)).map((alert: DueAlertItem) => {
                const isOverdue = alert.severity === 'overdue';
                const isToday = alert.severity === 'today';
                const rowTone = isOverdue
                  ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70'
                  : isToday
                  ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70'
                  : 'bg-sky-50/80 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/70';
                const statusBadgeCls = isOverdue
                  ? 'text-rose-700 dark:text-rose-300'
                  : isToday
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-sky-700 dark:text-sky-300';
                const statusLabel = isOverdue
                  ? t(
                      `মেয়াদোত্তীর্ণ (${Math.abs(alert.daysDelta)} দিন আগে)`,
                      `Overdue (${Math.abs(alert.daysDelta)}d ago)`,
                      language
                    )
                  : isToday
                  ? t('আজকের তারিখ', 'Due Today', language)
                  : t(`${alert.daysDelta} দিন বাকি`, `In ${alert.daysDelta}d`, language);

                const targetBill = alert.billRef;

                return (
                  <div
                    key={alert.id}
                    className={`p-2.5 sm:p-3 rounded-xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 ${rowTone}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center shrink-0">
                        {alert.kind === 'bill' ? (
                          <CalendarClock className="w-4 h-4 text-amber-600" />
                        ) : alert.kind === 'debt' ? (
                          <Users className="w-4 h-4 text-violet-600" />
                        ) : (
                          <KeyRound className="w-4 h-4 text-sky-600" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                            {alert.title}
                          </p>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className={`text-[11px] font-bold shrink-0 ${statusBadgeCls}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {formatDisplayDate(alert.dueDateStr, language)}
                          {alert.amount !== undefined && alert.amount > 0
                            ? ` · ${formatConverted(alert.amount, hideBalance)}`
                            : ''}
                          {alert.kind === 'debt' && alert.debtType
                            ? ` · ${alert.debtType === 'lent' ? t('পাওনা', 'Receivable', language) : t('দেনা', 'Payable', language)}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      {alert.kind === 'bill' && targetBill && onPayRecurringBill ? (
                        <button
                          type="button"
                          onClick={() => onPayRecurringBill(targetBill, currentMonthKey)}
                          className="px-3 py-1.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold min-h-[34px] transition-colors"
                        >
                          {t('এখনই পরিশোধ', 'Pay Now', language)}
                        </button>
                      ) : alert.kind === 'debt' ? (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('wallets')}
                          className="px-3 py-1.5 ct-btn-radius bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold min-h-[34px] transition-colors"
                        >
                          {t('বাকি দেখুন', 'Open Wallets', language)}
                        </button>
                      ) : (
                        onOpenPocketTool && (
                          <button
                            type="button"
                            onClick={() => onOpenPocketTool('vault')}
                            className="px-3 py-1.5 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold min-h-[34px] transition-colors"
                          >
                            {t('ভল্ট খুলুন', 'Open Vault', language)}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact 1-Line Quick Entry + AI Voice & Receipt Launchers */}
      {onQuickAddTransaction && (
        <div className="ct-surface-card border p-2.5 sm:p-3 space-y-2">
          <form onSubmit={handleQuickEntrySubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Sparkles className="w-4 h-4 ct-accent-text absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickEntryText}
                onChange={(e) => setQuickEntryText(e.target.value)}
                placeholder={t(
                  'দ্রুত লিখুন: "চা ৫০ নগদ" বা "বেতন ৩০০০০ ব্যাংক"',
                  'Quick entry: "Lunch 250 cash" or "Salary 30000"',
                  language
                )}
                className="w-full ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 ct-btn-radius pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {onOpenAiStudio && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenAiStudio('entry')}
                    className="px-2.5 py-2 ct-btn-radius bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1 min-h-[38px] hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
                    title={t('ভয়েস বা AI দিয়ে লিখুন', 'AI Voice & Smart Entry', language)}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('ভয়েস AI', 'Voice', language)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAiStudio('scanner')}
                    className="px-2.5 py-2 ct-btn-radius bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 min-h-[38px] hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
                    title={t('রসিদ বা SMS স্ক্যান', 'Scan Receipt or SMS', language)}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('রসিদ', 'Scan', language)}</span>
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={!parsedQuickEntry.valid}
                className="px-3.5 py-2 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 min-h-[38px] transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('সেভ', 'Add', language)}</span>
              </button>
            </div>
          </form>

          {quickEntryText.trim().length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] px-1">
              {parsedQuickEntry.valid ? (
                <>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      parsedQuickEntry.type === 'income'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {parsedQuickEntry.type === 'income' ? t('আয়', 'Income', language) : t('খরচ', 'Expense', language)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{parsedQuickEntry.title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 dark:text-slate-400">{parsedQuickEntry.category}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-bold tabular-nums ct-accent-text">
                    {formatMoney(parsedQuickEntry.amount, displayCurrency, language)}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">
                  {t('টিপস: সাথে টাকার অঙ্ক লিখুন (যেমন: রিকশা ৩০)', 'Tip: add an amount like "Coffee 120"', language)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interactive Under-Button Info Hub (Vibrant Color-Differentiated 4-Box Grid) */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Button 1: Wallets & Debts (Emerald/Teal) */}
          <motion.button
            whileTap={{scale: 0.98}}
            type="button"
            onClick={() => toggleDrawer('wallets')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 shadow-xs ${
              activeDrawer === 'wallets'
                ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/25'
                : 'bg-gradient-to-br from-emerald-100 to-teal-100/90 dark:from-emerald-950/80 dark:to-teal-950/75 border-emerald-300 dark:border-emerald-700/80 hover:border-emerald-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                  activeDrawer === 'wallets'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                <Wallet className="w-4 h-4" />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  activeDrawer === 'wallets' ? 'rotate-180 text-white' : 'text-emerald-700 dark:text-emerald-300'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-bold truncate ${activeDrawer === 'wallets' ? 'text-emerald-50' : 'text-emerald-900 dark:text-emerald-200'}`}>
                {t('ওয়ালেট ও বাকি', 'Wallets & Debts', language)}
              </p>
              <p className={`text-sm font-bold tabular-nums truncate ${activeDrawer === 'wallets' ? 'text-white' : 'text-emerald-950 dark:text-white'}`}>
                {formatConverted(totalWalletBalance, hideBalance)}
              </p>
            </div>
          </motion.button>

          {/* Button 2: Budget & Top Spending (Amber/Orange) */}
          <motion.button
            whileTap={{scale: 0.98}}
            type="button"
            onClick={() => toggleDrawer('budget')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 shadow-xs ${
              activeDrawer === 'budget'
                ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-500 shadow-md ring-2 ring-amber-500/25'
                : 'bg-gradient-to-br from-amber-100 to-orange-100/90 dark:from-amber-950/80 dark:to-orange-950/75 border-amber-300 dark:border-amber-700/80 hover:border-amber-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                  activeDrawer === 'budget'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                <Target className="w-4 h-4" />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  activeDrawer === 'budget' ? 'rotate-180 text-white' : 'text-amber-700 dark:text-amber-300'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-bold truncate ${activeDrawer === 'budget' ? 'text-amber-50' : 'text-amber-900 dark:text-amber-200'}`}>
                {t('বাজেট ও খাত', 'Budget & Insights', language)}
              </p>
              <p className={`text-sm font-bold tabular-nums truncate ${activeDrawer === 'budget' ? 'text-white' : 'text-amber-950 dark:text-white'}`}>
                {budgetCap > 0
                  ? t(`${budgetPct}% ব্যবহৃত`, `${budgetPct}% used`, language)
                  : t('সীমা সেট করুন', 'Set Budget Cap', language)}
              </p>
            </div>
          </motion.button>

          {/* Button 3: Today's Tasks & Focus (Indigo/Violet) */}
          <motion.button
            whileTap={{scale: 0.98}}
            type="button"
            onClick={() => toggleDrawer('tasks')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 shadow-xs ${
              activeDrawer === 'tasks'
                ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white border-indigo-500 shadow-md ring-2 ring-indigo-500/25'
                : 'bg-gradient-to-br from-indigo-100 to-violet-100/90 dark:from-indigo-950/80 dark:to-violet-950/75 border-indigo-300 dark:border-indigo-700/80 hover:border-indigo-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                  activeDrawer === 'tasks'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                <ListChecks className="w-4 h-4" />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  activeDrawer === 'tasks' ? 'rotate-180 text-white' : 'text-indigo-700 dark:text-indigo-300'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-bold truncate ${activeDrawer === 'tasks' ? 'text-indigo-50' : 'text-indigo-900 dark:text-indigo-200'}`}>
                {t('কাজ ও ফোকাস', 'Tasks & Focus', language)}
              </p>
              <p className={`text-sm font-bold tabular-nums truncate ${activeDrawer === 'tasks' ? 'text-white' : 'text-indigo-950 dark:text-white'}`}>
                {pendingTasks.length > 0
                  ? t(`${pendingTasks.length} টি কাজ বাকি`, `${pendingTasks.length} pending`, language)
                  : t('সব কাজ সম্পন্ন', 'All caught up', language)}
              </p>
            </div>
          </motion.button>

          {/* Button 4: Quick Actions, Tools & Exports (Sky/Blue) */}
          <motion.button
            whileTap={{scale: 0.98}}
            type="button"
            onClick={() => toggleDrawer('actions')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 shadow-xs ${
              activeDrawer === 'actions'
                ? 'bg-gradient-to-br from-sky-600 to-blue-700 text-white border-sky-500 shadow-md ring-2 ring-sky-500/25'
                : 'bg-gradient-to-br from-sky-100 to-blue-100/90 dark:from-sky-950/80 dark:to-blue-950/75 border-sky-300 dark:border-sky-700/80 hover:border-sky-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                  activeDrawer === 'actions'
                    ? 'bg-white/20 text-white'
                    : 'bg-sky-600 text-white'
                }`}
              >
                <Wrench className="w-4 h-4" />
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  activeDrawer === 'actions' ? 'rotate-180 text-white' : 'text-sky-700 dark:text-sky-300'
                }`}
              />
            </div>
            <div className="min-w-0 w-full">
              <p className={`text-[11px] font-bold truncate ${activeDrawer === 'actions' ? 'text-sky-50' : 'text-sky-900 dark:text-sky-200'}`}>
                {t('টুলস ও এক্সপোর্ট', 'Tools & Export', language)}
              </p>
              <p className={`text-sm font-bold truncate ${activeDrawer === 'actions' ? 'text-white' : 'text-sky-950 dark:text-white'}`}>
                {t('PDF · বাজার · টুলস', 'PDF · Lists · Tools', language)}
              </p>
            </div>
          </motion.button>
        </div>

        {/* Expanded Under-Button Detail Panel */}
        <AnimatePresence mode="wait">
          {activeDrawer === 'wallets' && (
            <motion.div
              key="drawer_wallets"
              initial={{opacity: 0, y: -6}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -4}}
              transition={{duration: 0.16}}
              className="ct-surface-card border border-emerald-200 dark:border-emerald-800/60 p-4 space-y-3 min-w-0 overflow-hidden"
            >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                {t('ওয়ালেট ও দেনা-পাওনার সারসংক্ষেপ', 'Wallets & Pending Debts Summary', language)}
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab('wallets')}
                className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
              >
                {t('সম্পূর্ণ দেখুন →', 'Open Wallets →', language)}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {walletBalancesList.map((w) => (
                <div
                  key={w.id}
                  className="p-2.5 rounded-xl ct-surface-alt border border-slate-200/70 dark:border-slate-700/70"
                >
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {w.name}
                  </p>
                  <p className="text-xs sm:text-sm font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {formatConverted(w.liveBalance, hideBalance)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                {debtSummary.pendingCount > 0
                  ? t(
                      `পাব: ${formatConverted(debtSummary.receivable, hideBalance)} · দেব: ${formatConverted(debtSummary.payable, hideBalance)}`,
                      `Receivable: ${formatConverted(debtSummary.receivable, hideBalance)} · Payable: ${formatConverted(debtSummary.payable, hideBalance)}`,
                      language
                    )
                  : t('কোনো বকেয়া দেনা-পাওনা নেই', 'All personal & group debts settled', language)}
              </span>
              <span
                className={`font-bold tabular-nums ${
                  debtSummary.net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {t('নেট বাকি:', 'Net Debt:', language)} {debtSummary.net > 0 ? '+' : ''}
                {formatConverted(debtSummary.net, hideBalance)}
              </span>
            </div>
          </motion.div>
        )}

        {activeDrawer === 'budget' && (
          <motion.div
            key="drawer_budget"
            initial={{opacity: 0, y: -6}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -4}}
            transition={{duration: 0.16}}
            className="ct-surface-card border border-amber-200 dark:border-amber-800/60 p-4 space-y-3.5 min-w-0 overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {t('মাসিক বাজেট ও শীর্ষ খরচের খাত', 'Monthly Budget & Top Categories', language)}
              </h3>
              <button
                type="button"
                onClick={openBudgetEditor}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
              >
                {budgetCap > 0 ? t('বাজেট বদলান', 'Edit Cap', language) : t('বাজেট সেট করুন', 'Set Cap', language)}
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  {t('বাজেট সীমা:', 'Budget Cap:', language)}{' '}
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {formatConverted(budgetCap, hideBalance)}
                  </strong>
                </span>
                <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                  {budgetCap > 0 ? `${budgetPct}%` : '—'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                  style={{width: `${barWidth}%`}}
                />
              </div>
            </div>

            {categoryBudgetAlerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categoryBudgetAlerts.map((cb) => (
                  <span
                    key={cb.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {cb.category}: {cb.pct}%
                  </span>
                ))}
              </div>
            )}

            {topCategories.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {topCategories.map(([name, amt]) => (
                  <div
                    key={name}
                    className="p-2.5 rounded-xl ct-surface-alt flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{backgroundColor: catColorMap.get(name) || accentColor}}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</span>
                    </span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                      {formatConverted(amt, hideBalance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeDrawer === 'tasks' && onOpenPocketTool && (
          <motion.div
            key="drawer_tasks"
            initial={{opacity: 0, y: -6}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -4}}
            transition={{duration: 0.16}}
            className="ct-surface-card border border-indigo-200 dark:border-indigo-800/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                {t('আজকের কাজ ও ফোকাস টাইমার', "Today's Tasks & Focus", language)}
              </h3>
              <button
                type="button"
                onClick={() => onOpenPocketTool('planner')}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
              >
                <Timer className="w-3 h-3" />
                <span>{t('ফোকাস ২৫মি.', 'Start 25m Focus', language)}</span>
              </button>
            </div>

            {onQuickAddDailyTask && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = quickTaskText.trim();
                  if (!clean) return;
                  onQuickAddDailyTask(clean);
                  setQuickTaskText('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={quickTaskText}
                  onChange={(e) => setQuickTaskText(e.target.value)}
                  placeholder={t('নতুন কাজ লিখুন...', 'Add a quick task...', language)}
                  className="flex-1 min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!quickTaskText.trim()}
                  className="px-3 py-2 ct-btn-radius bg-indigo-600 text-white text-xs font-bold disabled:opacity-45 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            <div className="space-y-1.5">
              {pendingTasks.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2 text-center">
                  {t('কোনো কাজ বাকি নেই!', 'All tasks completed!', language)}
                </p>
              ) : (
                pendingTasks.slice(0, 4).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onToggleDailyTask?.(task)}
                    className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl ct-surface-alt hover:border-indigo-400 border border-transparent text-left"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded border border-indigo-400 flex items-center justify-center shrink-0">
                        {task.done && <Check className="w-3 h-3 text-indigo-600" />}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {task.title}
                      </span>
                    </span>
                    {task.dueTime && (
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">{task.dueTime}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}

        {activeDrawer === 'actions' && (
          <motion.div
            key="drawer_actions"
            initial={{opacity: 0, y: -6}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -4}}
            transition={{duration: 0.16}}
            className="ct-surface-card border border-sky-200 dark:border-sky-800/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                {t('দ্রুত এক্সপোর্ট, শপিং ও পকেট টুলস', 'Quick Exports, Lists & Pocket Tools', language)}
              </h3>
              {onOpenSpotlightSearch && (
                <button
                  type="button"
                  onClick={onOpenSpotlightSearch}
                  className="px-2.5 py-1 rounded-lg ct-surface-alt border text-[11px] font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"
                >
                  <Search className="w-3 h-3 ct-accent-text" />
                  <span>{t('খুঁজুন ⌘K', 'Search ⌘K', language)}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={onOpenPrintModal}
                className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/70 text-left flex items-center gap-2.5 hover:shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-rose-950 dark:text-rose-100 truncate">
                  {t('PDF স্টেটমেন্ট', 'Statement PDF', language)}
                </span>
              </button>

              <button
                type="button"
                onClick={onExportExcel}
                className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/70 text-left flex items-center gap-2.5 hover:shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100 truncate">
                  {t('এক্সেল এক্সপোর্ট', 'Export Excel', language)}
                </span>
              </button>

              <button
                type="button"
                onClick={handleShareSummaryCard}
                disabled={sharingCard}
                className="p-3 rounded-xl bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800/70 text-left flex items-center gap-2.5 hover:shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                  {sharingCard ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImageDown className="w-4 h-4" />
                  )}
                </span>
                <span className="text-xs font-bold text-sky-950 dark:text-sky-100 truncate">
                  {t('সামারি কার্ড PNG', 'Summary Card', language)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('shopping')}
                className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/70 text-left flex items-center gap-2.5 hover:shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <ShoppingBasket className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-amber-950 dark:text-amber-100 truncate">
                  {t(`বাজার (${pendingShoppingCount})`, `Lists (${pendingShoppingCount})`, language)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('reports')}
                className="p-3 rounded-xl bg-violet-100 dark:bg-violet-950/60 border border-violet-300 dark:border-violet-800/70 text-left flex items-center gap-2.5 hover:shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
                  <PieChart className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-violet-950 dark:text-violet-100 truncate">
                  {t('চার্ট ও রিপোর্ট', 'Analytics', language)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('tools')}
                className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-left flex items-center gap-2.5 shadow-xs transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                  <Wrench className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold truncate">
                  {t('ইউটিলিটি টুলস', 'All Utility Tools', language)}
                </span>
              </button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Compact Recent Transactions Feed */}
      <div className="ct-surface-card border p-4 sm:p-5 space-y-2.5 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('সাম্প্রতিক লেনদেন', 'Recent Transactions', language)}
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-200 transition-colors shrink-0"
          >
            {t('সব দেখুন →', 'See All →', language)}
          </button>
        </div>

        {recentTx.length === 0 ? (
          <div className="py-6 text-center space-y-2.5">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {t('এই মাসে এখনো কোনো আয় বা খরচ যোগ করা হয়নি।', 'No transactions yet for this month.', language)}
            </p>
            <button
              type="button"
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
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
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2.5 text-left py-1 px-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isInc
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                            : isTransfer
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isInc ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isTransfer ? (
                          <ArrowLeftRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {tx.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {formatDisplayDate(tx.date, language)} · {walletMap.get(tx.walletId) || 'Cash'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-bold tabular-nums shrink-0 ${
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

                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:ct-accent-text rounded-lg"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx)}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg"
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
                  className="flex-1 py-2.5 ct-btn-radius bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
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
