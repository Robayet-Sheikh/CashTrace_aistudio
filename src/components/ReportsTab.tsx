import React, {useMemo, useState} from 'react';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  FileText,
  ImageDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Table,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {
  CategoryBudget,
  CategoryItem,
  LanguageCode,
  MonthStore,
  Transaction,
  WalletAccount,
} from '../types';
import {exportMonthlySummaryPNGCard} from '../utils/exportHelper';
import {
  formatDisplayDate,
  formatMonthTitle,
  parseLocaleNumber,
  parseMonthKey,
} from '../utils/formatters';
import {t} from '../utils/i18n';
import {ExpenseDonutChart, SixMonthComparisonChart} from './Charts';

interface ReportsTabProps {
  selectedMonthKey: string;
  monthOptions?: Array<{key: string; label: string}>;
  onSelectMonth?: (monthKey: string) => void;
  onShiftMonth?: (delta: number) => void;
  months: Record<string, MonthStore>;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  categoryBudgets?: CategoryBudget[];
  userName?: string;
  accentColor?: string;
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onEditTransaction: (tx: Transaction) => void;
  onDuplicateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onSaveCategoryBudget?: (budget: CategoryBudget) => void;
  onDeleteCategoryBudget?: (budgetId: string) => void;
  onOpenNewTransactionForDate?: (dateStr: string) => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onShowToast?: (msg: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  selectedMonthKey,
  monthOptions = [],
  onSelectMonth,
  onShiftMonth,
  months,
  wallets,
  categories,
  categoryBudgets = [],
  userName = 'User',
  accentColor = '#059669',
  currency,
  language,
  hideBalance,
  onEditTransaction,
  onDuplicateTransaction,
  onDeleteTransaction,
  onSaveCategoryBudget,
  onDeleteCategoryBudget,
  onOpenNewTransactionForDate,
  onOpenPrintModal,
  onExportExcel,
  onExportCSV,
  onShowToast,
}) => {
  const {displayCurrency, rate, convertToBase, convertToDisplay, formatConverted} = useCurrency();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [walletFilter, setWalletFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sharingCard, setSharingCard] = useState(false);

  // Category Budget Modal state
  const [catBudgetModalOpen, setCatBudgetModalOpen] = useState(false);
  const [editingCatBudget, setEditingCatBudget] = useState<CategoryBudget | null>(null);
  const [catBudgetName, setCatBudgetName] = useState('');
  const [catBudgetLimitText, setCatBudgetLimitText] = useState('');

  const currentMonthStore = months[selectedMonthKey];
  const currentTransactions = currentMonthStore?.transactions || [];
  const walletMap = useMemo(() => new Map(wallets.map((w) => [w.id, w.name])), [wallets]);
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    categories.forEach((c) => {
      if (typeFilter === 'all' || c.type === typeFilter) {
        names.add(c.name);
      }
    });
    currentTransactions.forEach((tx) => {
      if (typeFilter === 'all' || tx.type === typeFilter) {
        names.add(tx.category);
      }
    });
    return Array.from(names);
  }, [categories, currentTransactions, typeFilter]);

  const totalIncome = currentTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = currentTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    currentTransactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        map.set(tx.category, (map.get(tx.category) || 0) + tx.amount);
      });
    return map;
  }, [currentTransactions]);

  const dailyTotals = useMemo(() => {
    const map = new Map<string, {expense: number; income: number; count: number}>();
    currentTransactions.forEach((tx) => {
      const cur = map.get(tx.date) || {expense: 0, income: 0, count: 0};
      if (tx.type === 'expense') cur.expense += tx.amount;
      else if (tx.type === 'income') cur.income += tx.amount;
      cur.count += 1;
      map.set(tx.date, cur);
    });
    return map;
  }, [currentTransactions]);

  const calendarCells = useMemo(() => {
    const monthDate = parseMonthKey(selectedMonthKey);
    const year = monthDate.getFullYear();
    const monthIdx = monthDate.getMonth();
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const firstWeekday = new Date(year, monthIdx, 1).getDay(); // 0=Sun..6=Sat
    let maxDailyExpense = 0;
    dailyTotals.forEach((v) => {
      if (v.expense > maxDailyExpense) maxDailyExpense = v.expense;
    });

    const cells: Array<{
      dateStr: string | null;
      dayNum: number | null;
      expense: number;
      income: number;
      count: number;
      intensity: number;
    }> = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push({dateStr: null, dayNum: null, expense: 0, income: 0, count: 0, intensity: 0});
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(monthIdx + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      const stats = dailyTotals.get(dateStr) || {expense: 0, income: 0, count: 0};
      const intensity =
        stats.expense <= 0 || maxDailyExpense <= 0
          ? 0
          : Math.min(4, Math.ceil((stats.expense / maxDailyExpense) * 4));
      cells.push({
        dateStr,
        dayNum: d,
        expense: stats.expense,
        income: stats.income,
        count: stats.count,
        intensity,
      });
    }
    return cells;
  }, [selectedMonthKey, dailyTotals]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...currentTransactions]
      .filter((tx) => {
        if (selectedDay && tx.date !== selectedDay) return false;
        if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
        if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
        if (walletFilter !== 'all' && tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) {
          return false;
        }
        if (q) {
          const hay = `${tx.title} ${tx.category} ${tx.subcategory || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [currentTransactions, selectedDay, search, typeFilter, categoryFilter, walletFilter]);

  const filteredSum = useMemo(
    () =>
      filteredTransactions.reduce((acc, tx) => {
        if (tx.type === 'income') return acc + tx.amount;
        if (tx.type === 'expense') return acc - tx.amount;
        return acc;
      }, 0),
    [filteredTransactions]
  );

  const isFiltered =
    selectedDay !== null ||
    typeFilter !== 'all' ||
    walletFilter !== 'all' ||
    categoryFilter !== 'all' ||
    search.trim().length > 0;

  const handleSharePNG = async () => {
    if (sharingCard) return;
    setSharingCard(true);
    try {
      const catColorMap = new Map(categories.map((c) => [c.name, c.color]));
      const topCategories = Array.from(expenseByCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, amount]) => ({
          name,
          amount,
          color: catColorMap.get(name) || accentColor,
        }));
      const res = await exportMonthlySummaryPNGCard({
        periodLabel: formatMonthTitle(selectedMonthKey, language),
        userName,
        currency: displayCurrency,
        language,
        accentColor,
        totalIncome,
        totalExpense,
        netBalance,
        budgetCap: currentMonthStore?.budgetCap || 0,
        topCategories,
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

  const openNewCatBudget = () => {
    setEditingCatBudget(null);
    const usedNames = new Set(categoryBudgets.map((b) => b.category));
    const firstUnused = expenseCategories.find((c) => !usedNames.has(c.name)) || expenseCategories[0];
    setCatBudgetName(firstUnused?.name || '');
    setCatBudgetLimitText('');
    setCatBudgetModalOpen(true);
  };

  const openEditCatBudget = (cb: CategoryBudget) => {
    setEditingCatBudget(cb);
    setCatBudgetName(cb.category);
    setCatBudgetLimitText(String(convertToDisplay(cb.limit)));
    setCatBudgetModalOpen(true);
  };

  const handleSaveCatBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveCategoryBudget || !catBudgetName) return;
    const limitDisplay = parseLocaleNumber(catBudgetLimitText);
    if (isNaN(limitDisplay) || limitDisplay <= 0) return;
    onSaveCategoryBudget({
      id: editingCatBudget?.id || `cb_${Date.now()}`,
      category: catBudgetName,
      limit: convertToBase(limitDisplay),
    });
    setCatBudgetModalOpen(false);
    setEditingCatBudget(null);
  };

  const selectedDayStats = selectedDay ? dailyTotals.get(selectedDay) || {expense: 0, income: 0, count: 0} : null;

  return (
    <div className="space-y-5">
      {/* Compact Header + Corner Month Picker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
          {t('রিপোর্ট ও অ্যানালিটিক্স', 'Reports & Analytics', language)}
        </h2>
        {monthOptions.length > 0 && onSelectMonth && onShiftMonth && (
          <div className="bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 rounded-xl px-1.5 py-1 inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onShiftMonth(-1)}
              className="w-7 h-7 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="inline-flex items-center gap-1 px-1">
              <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <select
                value={selectedMonthKey}
                onChange={(e) => onSelectMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-sky-950 dark:text-sky-100 outline-none cursor-pointer"
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
              className="w-7 h-7 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        <div className="ct-surface-card border p-5 flex flex-col justify-between space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('খাতভিত্তিক খরচের অনুপাত', 'Expense Breakdown by Category', language)}
          </h3>
          <ExpenseDonutChart
            transactions={currentTransactions}
            categories={categories}
            currency={currency}
            language={language}
            hideBalance={hideBalance}
          />
        </div>

        <div className="ct-surface-card border p-5 flex flex-col justify-between space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('গত ৬ মাসের আয় বনাম খরচ', '6-Month Income vs Expense', language)}
          </h3>
          <SixMonthComparisonChart
            selectedMonthKey={selectedMonthKey}
            months={months}
            currency={currency}
            language={language}
            hideBalance={hideBalance}
          />
        </div>
      </div>

      {/* Category Budgets + Spending Calendar Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* Category Budgets Tracker */}
        <div className="ct-surface-card border p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 ct-accent-text shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('খাতভিত্তিক বাজেট লিমিট', 'Category Budgets', language)}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('প্রতিটি খরচের খাতের আলাদা মাসিক সীমা নির্ধারণ করুন', 'Set monthly limits per expense category', language)}
                </p>
              </div>
            </div>
            {onSaveCategoryBudget && (
              <button
                type="button"
                onClick={openNewCatBudget}
                className="px-3 py-1.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('সীমা যোগ', 'Add Limit', language)}</span>
              </button>
            )}
          </div>

          {categoryBudgets.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 ct-surface-alt rounded-xl p-4">
              {t(
                'এখনো কোনো খাতভিত্তিক বাজেট সেট করা হয়নি। কাঁচা বাজার বা যাতায়াতের সীমা ঠিক করতে "সীমা যোগ" চাপুন।',
                'No category budgets set yet. Tap "Add Limit" to cap groceries, transport, or dining.',
                language
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBudgets.map((cb) => {
                const spent = expenseByCategory.get(cb.category) || 0;
                const pct = cb.limit > 0 ? Math.round((spent / cb.limit) * 100) : 0;
                const widthPct = Math.min(100, Math.max(0, pct));
                const barCls =
                  pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div
                    key={cb.id}
                    className="p-3 rounded-xl ct-surface-alt border border-slate-200/70 dark:border-slate-700/70 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">{cb.category}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`font-bold tabular-nums ${
                            pct >= 100
                              ? 'text-rose-600 dark:text-rose-400'
                              : pct >= 80
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {pct}%
                        </span>
                        {onSaveCategoryBudget && (
                          <button
                            type="button"
                            onClick={() => openEditCatBudget(cb)}
                            className="p-1 text-slate-400 hover:ct-accent-text"
                            aria-label="Edit category budget"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteCategoryBudget && (
                          <button
                            type="button"
                            onClick={() => onDeleteCategoryBudget(cb.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            aria-label="Delete category budget"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barCls}`} style={{width: `${widthPct}%`}} />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>
                        {t('খরচ', 'Spent', language)}: <strong className="text-slate-800 dark:text-slate-200">{formatConverted(spent, hideBalance)}</strong>
                      </span>
                      <span>
                        {t('সীমা', 'Limit', language)}: <strong>{formatConverted(cb.limit, hideBalance)}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly Spending Calendar Heatmap */}
        <div className="ct-surface-card border p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 ct-accent-text shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('দৈনিক খরচের হিটম্যাপ', 'Daily Spending Heatmap', language)}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('যেকোনো তারিখে ট্যাপ করে সেই দিনের লেনদেন দেখুন', 'Tap any day to inspect or add entries', language)}
                </p>
              </div>
            </div>
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-xs font-semibold ct-accent-text hover:underline"
              >
                {t('সব দিন দেখান', 'Clear Day', language)}
              </button>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell.dateStr || cell.dayNum === null) {
                return <div key={`empty_${idx}`} className="h-9 sm:h-10" />;
              }
              const isSelected = selectedDay === cell.dateStr;
              const bgClass =
                cell.intensity === 0
                  ? 'ct-surface-alt text-slate-500 dark:text-slate-400'
                  : cell.intensity === 1
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
                  : cell.intensity === 2
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200'
                  : cell.intensity === 3
                  ? 'bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-100'
                  : 'bg-rose-500 text-white';

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
                  className={`h-9 sm:h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold transition-all relative ${bgClass} ${
                    isSelected ? 'ring-2 ring-slate-900 dark:ring-white scale-105' : 'hover:opacity-85'
                  }`}
                  title={`${cell.dateStr}: ${formatConverted(cell.expense, hideBalance)}`}
                >
                  <span className="leading-none">{cell.dayNum}</span>
                  {cell.count > 0 && (
                    <span className="w-1 h-1 rounded-full bg-current opacity-70 mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {selectedDay && selectedDayStats && (
            <div className="p-3 rounded-xl ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  {formatDisplayDate(selectedDay, language)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('আয়', 'In', language)}: +{formatConverted(selectedDayStats.income, hideBalance)} ·{' '}
                  {t('খরচ', 'Out', language)}: -{formatConverted(selectedDayStats.expense, hideBalance)}
                </p>
              </div>
              {onOpenNewTransactionForDate && (
                <button
                  type="button"
                  onClick={() => onOpenNewTransactionForDate(selectedDay)}
                  className="px-3 py-1.5 ct-btn-radius ct-accent-bg text-white text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{t('এই দিনে এন্ট্রি', 'Add Entry', language)}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary & Export Bar */}
      <div className="ct-surface-card border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('মোট আয়', 'Income', language)}</span>
            <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatConverted(totalIncome, hideBalance)}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('মোট খরচ', 'Expense', language)}</span>
            <p className="text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatConverted(totalExpense, hideBalance)}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('অবশিষ্ট', 'Net Balance', language)}</span>
            <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {formatConverted(netBalance, hideBalance)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sharingCard}
            onClick={handleSharePNG}
            className="px-3.5 py-2.5 ct-btn-radius bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs min-h-[40px]"
          >
            {sharingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
            <span>{t('PNG কার্ড', 'PNG Card', language)}</span>
          </button>
          <button
            type="button"
            onClick={onOpenPrintModal}
            className="px-3.5 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs min-h-[40px]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('PDF রিপোর্ট', 'PDF Report', language)}</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="px-3.5 py-2.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs min-h-[40px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('এক্সেল', 'Excel', language)}</span>
          </button>
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3.5 py-2.5 ct-btn-radius bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs min-h-[40px]"
          >
            <Table className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Full Filterable Transactions Ledger */}
      <div className="ct-surface-card border p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('সকল লেনদেনের বিস্তারিত তালিকা', 'All Transactions Ledger', language)}
            </h3>
            {isFiltered && (
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {t(`${filteredTransactions.length} টি এন্ট্রি`, `${filteredTransactions.length} results`, language)}
                  {' · '}
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {filteredSum >= 0 ? '+' : '-'}
                    {formatConverted(Math.abs(filteredSum), hideBalance)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(null);
                    setTypeFilter('all');
                    setWalletFilter('all');
                    setCategoryFilter('all');
                    setSearch('');
                  }}
                  className="ct-accent-text font-semibold hover:underline"
                >
                  {t('রিসেট', 'Reset', language)}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Type Filter */}
            <div className="flex items-center gap-1 p-1 ct-surface-alt rounded-xl">
              {(['all', 'expense', 'income', 'transfer'] as const).map((mode) => {
                const isActive = typeFilter === mode;
                const activeCls =
                  mode === 'expense'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : mode === 'income'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : mode === 'transfer'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setTypeFilter(mode);
                      setCategoryFilter('all');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      isActive ? activeCls : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'all'
                      ? t('সব', 'All', language)
                      : mode === 'expense'
                      ? t('খরচ', 'Expense', language)
                      : mode === 'income'
                      ? t('আয়', 'Income', language)
                      : t('ট্রান্সফার', 'Transfer', language)}
                  </button>
                );
              })}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="ct-surface-alt border-0 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none max-w-[180px]"
              aria-label="Filter by category"
            >
              <option value="all">{t('সব খাত / ক্যাটাগরি', 'All Categories', language)}</option>
              {categoryOptions.map((cName) => (
                <option key={cName} value={cName}>
                  {cName}
                </option>
              ))}
            </select>

            <select
              value={walletFilter}
              onChange={(e) => setWalletFilter(e.target.value)}
              className="ct-surface-alt border-0 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
              aria-label="Filter by wallet"
            >
              <option value="all">{t('সব ওয়ালেট', 'All Wallets', language)}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[180px] sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('বিবরণ বা খাত খুঁজুন...', 'Search transactions...', language)}
                className="w-full sm:w-52 ct-surface-alt rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Mobile Card Ledger View */}
        <div className="md:hidden space-y-2.5">
          {filteredTransactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('কোনো লেনদেন পাওয়া যায়নি', 'No matching transactions found', language)}
            </p>
          ) : (
            filteredTransactions.map((tx) => {
              const isInc = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';
              return (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 ct-surface-alt flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="flex-1 min-w-0 text-left space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tx.title}</p>
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
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {formatDisplayDate(tx.date, language)} · {tx.category} · {walletMap.get(tx.walletId) || 'Cash'}
                      {isTransfer && tx.toWalletId ? ` → ${walletMap.get(tx.toWalletId) || tx.toWalletId}` : ''}
                    </p>
                    {tx.subcategory && (
                      <p className="text-[11px] text-slate-400 truncate">{tx.subcategory}</p>
                    )}
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(tx)}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-emerald-600 rounded-lg"
                      title={t('সম্পাদনা', 'Edit', language)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateTransaction(tx)}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-sky-600 rounded-lg"
                      title={t('ডুপ্লিকেট', 'Duplicate', language)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx)}
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg"
                      title={t('ডিলিট', 'Delete', language)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">{t('ধরন', 'Type', language)}</th>
                <th className="py-2.5 px-3">{t('তারিখ', 'Date', language)}</th>
                <th className="py-2.5 px-3">{t('বিবরণ', 'Title', language)}</th>
                <th className="py-2.5 px-3">{t('খাত ও ওয়ালেট', 'Category & Wallet', language)}</th>
                <th className="py-2.5 px-3 text-right">{t('পরিমাণ', 'Amount', language)}</th>
                <th className="py-2.5 px-3 text-center">{t('অ্যাকশন', 'Actions', language)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t('কোনো লেনদেন পাওয়া যায়নি', 'No matching transactions found', language)}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isInc = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            isInc
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isTransfer
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isInc
                            ? t('আয়', 'Income', language)
                            : isTransfer
                            ? t('ট্রান্সফার', 'Transfer', language)
                            : t('খরচ', 'Expense', language)}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDisplayDate(tx.date, language)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => onEditTransaction(tx)}
                          className="text-left hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          {tx.title}
                        </button>
                        {tx.subcategory && (
                          <span className="block text-[11px] font-normal text-slate-400">{tx.subcategory}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                        {tx.category}
                        <span className="block text-[11px] text-slate-400">
                          {walletMap.get(tx.walletId) || 'Cash'}
                          {isTransfer && tx.toWalletId ? ` → ${walletMap.get(tx.toWalletId) || tx.toWalletId}` : ''}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-bold tabular-nums whitespace-nowrap ${
                          isInc
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isTransfer
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatConverted(tx.amount, hideBalance)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditTransaction(tx)}
                            className="p-2 text-slate-400 hover:ct-accent-text rounded-lg"
                            title={t('সম্পাদনা', 'Edit', language)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateTransaction(tx)}
                            className="p-2 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg"
                            title={t('ডুপ্লিকেট', 'Duplicate', language)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTransaction(tx)}
                            className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg"
                            title={t('ডিলিট', 'Delete', language)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Budget Modal */}
      {catBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingCatBudget
                  ? t('খাতের বাজেট এডিট', 'Edit Category Limit', language)
                  : t('নতুন খাত বাজেট', 'Add Category Limit', language)}
              </h3>
              <button
                type="button"
                onClick={() => setCatBudgetModalOpen(false)}
                className="p-1.5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCatBudget} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('খরচের খাত', 'Expense Category', language)}
                </label>
                <select
                  value={catBudgetName}
                  onChange={(e) => setCatBudgetName(e.target.value)}
                  disabled={Boolean(editingCatBudget)}
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none disabled:opacity-60"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`মাসিক সর্বোচ্চ সীমা (${displayCurrency})`, `Monthly Limit (${displayCurrency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={catBudgetLimitText}
                  onChange={(e) => setCatBudgetLimitText(e.target.value)}
                  placeholder="5000"
                  required
                  autoFocus
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCatBudgetModalOpen(false)}
                  className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
                >
                  {t('বাতিল', 'Cancel', language)}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 ct-btn-radius ct-accent-bg text-white text-xs font-bold"
                >
                  {t('সেভ করুন', 'Save Limit', language)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
