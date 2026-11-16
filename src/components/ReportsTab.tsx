import React, {useMemo, useState} from 'react';
import {Copy, FileSpreadsheet, FileText, Pencil, Search, Table, Trash2} from 'lucide-react';
import {
  CategoryItem,
  LanguageCode,
  MonthStore,
  Transaction,
  WalletAccount,
} from '../types';
import {formatDisplayDate, formatMoney} from '../utils/formatters';
import {t} from '../utils/i18n';
import {ExpenseDonutChart, SixMonthComparisonChart} from './Charts';

interface ReportsTabProps {
  selectedMonthKey: string;
  months: Record<string, MonthStore>;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onEditTransaction: (tx: Transaction) => void;
  onDuplicateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  selectedMonthKey,
  months,
  wallets,
  categories,
  currency,
  language,
  hideBalance,
  onEditTransaction,
  onDuplicateTransaction,
  onDeleteTransaction,
  onOpenPrintModal,
  onExportExcel,
  onExportCSV,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [walletFilter, setWalletFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const currentTransactions = months[selectedMonthKey]?.transactions || [];
  const walletMap = useMemo(() => new Map(wallets.map((w) => [w.id, w.name])), [wallets]);

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

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...currentTransactions]
      .filter((tx) => {
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
  }, [currentTransactions, search, typeFilter, categoryFilter, walletFilter]);

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
    typeFilter !== 'all' ||
    walletFilter !== 'all' ||
    categoryFilter !== 'all' ||
    search.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
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

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
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

      {/* Summary & Export Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('মোট আয়', 'Income', language)}</span>
            <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(totalIncome, currency, language, hideBalance)}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('মোট খরচ', 'Expense', language)}</span>
            <p className="text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatMoney(totalExpense, currency, language, hideBalance)}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('অবশিষ্ট', 'Net Balance', language)}</span>
            <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoney(netBalance, currency, language, hideBalance)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrintModal}
            className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('PDF রিপোর্ট', 'PDF Report', language)}</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('এক্সেল', 'Excel', language)}</span>
          </button>
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
          >
            <Table className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Full Filterable Transactions Ledger */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
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
                    {formatMoney(Math.abs(filteredSum), currency, language, hideBalance)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setWalletFilter('all');
                    setCategoryFilter('all');
                    setSearch('');
                  }}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  {t('রিসেট', 'Reset', language)}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Type Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {(['all', 'expense', 'income', 'transfer'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setTypeFilter(mode);
                    setCategoryFilter('all');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    typeFilter === mode
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
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
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border-0 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none max-w-[180px]"
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
              className="bg-slate-100 dark:bg-slate-800 border-0 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
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
                className="w-full sm:w-52 bg-slate-100 dark:bg-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-2"
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
                        {formatMoney(tx.amount, currency, language, hideBalance)}
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
                        {formatMoney(tx.amount, currency, language, hideBalance)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditTransaction(tx)}
                            className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg"
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
    </div>
  );
};
