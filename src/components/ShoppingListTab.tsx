import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {
  Check,
  CheckCircle2,
  Copy,
  ListChecks,
  Pencil,
  Plus,
  Receipt,
  Search,
  Share2,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import {
  CategoryItem,
  LanguageCode,
  ShoppingItem,
  ShoppingList,
  Transaction,
  WalletAccount,
} from '../types';
import {
  formatMoney,
  getLocalDateStr,
  hasMathOperators,
  parseLocaleNumber,
} from '../utils/formatters';
import {t} from '../utils/i18n';

interface ShoppingListTabProps {
  lists: ShoppingList[];
  wallets: WalletAccount[];
  categories: CategoryItem[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onCreateList: (title: string) => string;
  onRenameList: (listId: string, nextTitle: string) => void;
  onDuplicateList: (listId: string) => string;
  onDeleteList: (listId: string) => void;
  onAddItem: (listId: string, item: Omit<ShoppingItem, 'id' | 'checked' | 'createdAt'>) => void;
  onToggleItem: (listId: string, itemId: string) => void;
  onBulkToggleChecked: (listId: string, checked: boolean) => void;
  onUpdateItem: (listId: string, itemId: string, patch: Partial<ShoppingItem>) => void;
  onDeleteItem: (listId: string, itemId: string) => void;
  onClearChecked: (listId: string) => void;
  onLogExpenseFromList: (
    listId: string,
    tx: Omit<Transaction, 'id' | 'createdAt'>,
    clearCheckedItems: boolean
  ) => void;
  onShowToast: (msg: string) => void;
}

export const ShoppingListTab: React.FC<ShoppingListTabProps> = ({
  lists,
  wallets,
  categories,
  currency,
  language,
  hideBalance,
  onCreateList,
  onRenameList,
  onDuplicateList,
  onDeleteList,
  onAddItem,
  onToggleItem,
  onBulkToggleChecked,
  onUpdateItem,
  onDeleteItem,
  onClearChecked,
  onLogExpenseFromList,
  onShowToast,
}) => {
  const [activeListId, setActiveListId] = useState<string>(() => lists[0]?.id || '');

  useEffect(() => {
    if (!lists.some((l) => l.id === activeListId)) {
      setActiveListId(lists[0]?.id || '');
    }
  }, [lists, activeListId]);

  const activeList = useMemo(
    () => lists.find((l) => l.id === activeListId) || lists[0] || null,
    [lists, activeListId]
  );

  // Quick inline item form
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemPriceText, setItemPriceText] = useState('');
  const itemNameInputRef = useRef<HTMLInputElement | null>(null);

  // Search & filter
  const [itemSearch, setItemSearch] = useState('');
  const [itemFilter, setItemFilter] = useState<'all' | 'pending' | 'bought'>('all');

  // New / Rename / Delete list modals
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [renameListTarget, setRenameListTarget] = useState<ShoppingList | null>(null);
  const [renameListTitle, setRenameListTitle] = useState('');
  const [confirmDeleteList, setConfirmDeleteList] = useState<ShoppingList | null>(null);

  // Edit item modal
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPriceText, setEditPriceText] = useState('');

  // Convert checked items to expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountText, setExpenseAmountText] = useState('');
  const [expenseDate, setExpenseDate] = useState(getLocalDateStr());
  const [expenseWalletId, setExpenseWalletId] = useState(wallets[0]?.id || 'cash');
  const [expenseCategory, setExpenseCategory] = useState(
    categories.find((c) => c.type === 'expense')?.name || '🛒 কাঁচা বাজার'
  );
  const [clearAfterLog, setClearAfterLog] = useState(true);

  const items = activeList?.items || [];
  const checkedItems = items.filter((it) => it.checked);
  const uncheckedItems = items.filter((it) => !it.checked);

  const totalEstimated = items.reduce((s, it) => s + (it.estimatedPrice || 0), 0);
  const checkedTotal = checkedItems.reduce((s, it) => s + (it.estimatedPrice || 0), 0);
  const remainingTotal = Math.max(0, totalEstimated - checkedTotal);
  const progressPct = items.length > 0 ? Math.round((checkedItems.length / items.length) * 100) : 0;

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const base =
      itemFilter === 'pending'
        ? uncheckedItems
        : itemFilter === 'bought'
        ? checkedItems
        : [...uncheckedItems, ...checkedItems];
    if (!q) return base;
    return base.filter((it) => `${it.name} ${it.quantity || ''}`.toLowerCase().includes(q));
  }, [uncheckedItems, checkedItems, itemFilter, itemSearch]);

  const inlinePriceParsed = parseLocaleNumber(itemPriceText);
  const editPriceParsed = parseLocaleNumber(editPriceText);
  const expenseAmountParsed = parseLocaleNumber(expenseAmountText);

  const handleAddInlineItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList || !itemName.trim()) return;
    const parsedPrice = itemPriceText.trim() ? parseLocaleNumber(itemPriceText) : NaN;
    onAddItem(activeList.id, {
      name: itemName.trim(),
      quantity: itemQty.trim() || undefined,
      estimatedPrice: !isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : undefined,
    });
    setItemName('');
    setItemQty('');
    setItemPriceText('');
    window.setTimeout(() => itemNameInputRef.current?.focus(), 30);
  };

  const handleCreateListSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    const createdId = onCreateList(newListTitle.trim());
    setActiveListId(createdId);
    setNewListTitle('');
    setNewListOpen(false);
  };

  const handleRenameListSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameListTarget || !renameListTitle.trim()) return;
    onRenameList(renameListTarget.id, renameListTitle.trim());
    setRenameListTarget(null);
  };

  const openEditItem = (item: ShoppingItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditQty(item.quantity || '');
    setEditPriceText(item.estimatedPrice !== undefined ? String(item.estimatedPrice) : '');
  };

  const handleSaveItemEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList || !editingItem || !editName.trim()) return;
    const parsedPrice = editPriceText.trim() ? parseLocaleNumber(editPriceText) : NaN;
    onUpdateItem(activeList.id, editingItem.id, {
      name: editName.trim(),
      quantity: editQty.trim() || undefined,
      estimatedPrice: !isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : undefined,
    });
    setEditingItem(null);
  };

  const openLogExpenseModal = () => {
    if (!activeList) return;
    const targetItems = checkedItems.length > 0 ? checkedItems : items;
    const sum = targetItems.reduce((s, it) => s + (it.estimatedPrice || 0), 0);
    setExpenseTitle(activeList.title);
    setExpenseAmountText(sum > 0 ? String(sum) : '');
    setExpenseDate(getLocalDateStr());
    setExpenseWalletId(wallets[0]?.id || 'cash');
    const bazarCat =
      categories.find((c) => c.type === 'expense' && c.name.includes('বাজার'))?.name ||
      categories.find((c) => c.type === 'expense')?.name ||
      '🛒 কাঁচা বাজার';
    setExpenseCategory(bazarCat);
    setExpenseModalOpen(true);
  };

  const handleConfirmLogExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList) return;
    const amt = parseLocaleNumber(expenseAmountText);
    if (isNaN(amt) || amt <= 0) return;

    const targetItems = checkedItems.length > 0 ? checkedItems : items;
    const noteItems = targetItems
      .slice(0, 8)
      .map((it) => (it.quantity ? `${it.name} (${it.quantity})` : it.name))
      .join(', ');

    onLogExpenseFromList(
      activeList.id,
      {
        type: 'expense',
        title: expenseTitle.trim() || activeList.title,
        amount: amt,
        category: expenseCategory,
        subcategory: noteItems || undefined,
        date: expenseDate || getLocalDateStr(),
        walletId: expenseWalletId,
      },
      clearAfterLog && checkedItems.length > 0
    );
    setExpenseModalOpen(false);
  };

  const handleShareList = async () => {
    if (!activeList || items.length === 0) {
      onShowToast(t('শেয়ার করার মতো কোনো আইটেম নেই', 'No items in list to share', language));
      return;
    }

    const lines = items.map((it, idx) => {
      const mark = it.checked ? '✅' : '⬜';
      const qty = it.quantity ? ` (${it.quantity})` : '';
      const price = it.estimatedPrice ? ` — ${currency}${it.estimatedPrice}` : '';
      return `${idx + 1}. ${mark} ${it.name}${qty}${price}`;
    });
    const text = `🛒 ${activeList.title}\n\n${lines.join('\n')}\n\n${t('কেনা হয়েছে', 'Bought', language)}: ${currency}${checkedTotal} | ${t('মোট আনুমানিক', 'Est. Total', language)}: ${currency}${totalEstimated}`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: activeList.title,
          text,
          dialogTitle: t('বাজার লিস্ট শেয়ার করুন', 'Share Shopping List', language),
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onShowToast(t('বাজার লিস্ট কপি করা হয়েছে!', 'Shopping list copied!', language));
      }
    } catch {
      onShowToast(t('শেয়ার করতে সমস্যা হয়েছে', 'Failed to share list', language));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header & Lists Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShoppingBasket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('বাজার ও কেনাকাটার লিস্ট', 'Shopping & Bazar Lists', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'একটানা বাজারের ফর্দ লিখুন, দাম আপডেট করুন এবং ১ ক্লিকে খরচে যোগ করুন',
                  'Rapidly build checklists, adjust prices, and log bought items directly as expenses',
                  language
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNewListOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{t('নতুন লিস্ট', 'New List', language)}</span>
          </button>
        </div>

        {/* List Tabs + Active List Rename */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
            {lists.map((lst) => {
              const isActive = lst.id === activeList?.id;
              const pendingCount = lst.items.filter((i) => !i.checked).length;
              return (
                <button
                  key={lst.id}
                  type="button"
                  onClick={() => setActiveListId(lst.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 border transition-colors shrink-0 min-h-[40px] ${
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{lst.title}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pendingCount}
                  </span>
                </button>
              );
            })}
          </div>

          {activeList && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setRenameListTarget(activeList);
                  setRenameListTitle(activeList.title);
                }}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 flex items-center justify-center"
                title={t('লিস্টের নাম এডিট করুন', 'Rename List', language)}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextId = onDuplicateList(activeList.id);
                  setActiveListId(nextId);
                }}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-600 flex items-center justify-center"
                title={t('লিস্ট কপি করে নতুন লিস্ট', 'Duplicate List', language)}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Live List Summary Metrics & Progress Bar */}
        {activeList && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                  {t(`কেনা (${checkedItems.length}/${items.length})`, `Bought (${checkedItems.length}/${items.length})`, language)}
                </span>
                <strong className="text-sm sm:text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(checkedTotal, currency, language, hideBalance)}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  {t('মোট বাজেট', 'Est. Total', language)}
                </span>
                <strong className="text-sm sm:text-base font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(totalEstimated, currency, language, hideBalance)}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40">
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                  {t('বাকি আনুমানিক', 'Remaining', language)}
                </span>
                <strong className="text-sm sm:text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatMoney(remainingTotal, currency, language, hideBalance)}
                </strong>
              </div>
            </div>

            {items.length > 0 && (
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{width: `${progressPct}%`}}
                  />
                </div>
                <span className="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                  {progressPct}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Item + Checklist Card */}
      {activeList && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          {/* Quick Inline Add Bar */}
          <form onSubmit={handleAddInlineItem} className="space-y-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                ref={itemNameInputRef}
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t('জিনিসের নাম * (যেমন: চাল, ডিম, তেল)', 'Item name * (e.g. Rice, Eggs)', language)}
                required
                className="sm:col-span-5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
                placeholder={t('পরিমাণ (যেমন: ২ কেজি)', 'Qty (e.g. 2 kg)', language)}
                className="sm:col-span-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                inputMode="text"
                value={itemPriceText}
                onChange={(e) => setItemPriceText(e.target.value)}
                placeholder={t(`দাম (${currency}) বা 65*2`, `Price (${currency})`, language)}
                className="sm:col-span-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>{t('যোগ করুন', 'Add', language)}</span>
              </button>
            </div>
            {hasMathOperators(itemPriceText) && Number.isFinite(inlinePriceParsed) && inlinePriceParsed >= 0 && (
              <p className="text-[11px] font-bold font-mono text-emerald-600 dark:text-emerald-400 text-right">
                = {formatMoney(inlinePriceParsed, currency, language)}
              </p>
            )}
          </form>

          {/* List Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 dark:border-slate-800 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={openLogExpenseModal}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>
                    {checkedItems.length > 0
                      ? t(`কেনাগুলো (${checkedItems.length}) খরচে যোগ`, `Log ${checkedItems.length} Bought as Expense`, language)
                      : t('সব খরচে যোগ করুন', 'Log List as Expense', language)}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleShareList}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('শেয়ার / কপি', 'Share / Copy', language)}</span>
              </button>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onBulkToggleChecked(activeList.id, uncheckedItems.length > 0)
                  }
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold min-h-[38px]"
                >
                  {uncheckedItems.length > 0
                    ? t('সব টিক দিন', 'Check All', language)
                    : t('সব আনটিক করুন', 'Uncheck All', language)}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {checkedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearChecked(activeList.id)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                >
                  {t('কেনা মুছুন', 'Clear Bought', language)}
                </button>
              )}
              {lists.length > 1 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteList(activeList)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  {t('লিস্ট ডিলিট', 'Delete List', language)}
                </button>
              )}
            </div>
          </div>

          {/* Item Search & Filter Strip */}
          {items.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start">
                {(
                  [
                    {id: 'all', bn: `সব (${items.length})`, en: `All (${items.length})`},
                    {id: 'pending', bn: `বাকি (${uncheckedItems.length})`, en: `Left (${uncheckedItems.length})`},
                    {id: 'bought', bn: `কেনা (${checkedItems.length})`, en: `Bought (${checkedItems.length})`},
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setItemFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      itemFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t(tab.bn, tab.en, language)}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={t('আইটেম খুঁজুন...', 'Search items...', language)}
                  className="w-full sm:w-52 bg-slate-100 dark:bg-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Checklist Items */}
          {visibleItems.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <ShoppingBasket className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {items.length === 0
                  ? t(
                      'এই লিস্টটি খালি। উপরের বক্সে জিনিসের নাম লিখে বাজারের ফর্দ তৈরি করুন।',
                      'This list is empty. Add items above to build your shopping checklist.',
                      language
                    )
                  : t('খোঁজা বা ফিল্টারে কোনো আইটেম পাওয়া যায়নি', 'No matching items found', language)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                    item.checked
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/50'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleItem(activeList.id, item.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[40px]"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        item.checked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {item.checked && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${
                          item.checked
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.name}
                      </p>
                      {item.quantity && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          {item.quantity}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className={`px-2 py-1 rounded-lg text-xs sm:text-sm font-bold tabular-nums transition-colors ${
                        item.estimatedPrice !== undefined && item.estimatedPrice > 0
                          ? item.checked
                            ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                          : 'text-slate-400 hover:text-emerald-600 text-xs font-medium'
                      }`}
                      title={t('দাম বা তথ্য পরিবর্তন করুন', 'Edit price or details', language)}
                    >
                      {item.estimatedPrice !== undefined && item.estimatedPrice > 0
                        ? formatMoney(item.estimatedPrice, currency, language, hideBalance)
                        : t('+ দাম', '+ Price', language)}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-emerald-600 rounded-lg"
                      aria-label="Edit item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(activeList.id, item.id)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg"
                      aria-label="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New List Modal */}
      {newListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন বাজার / কেনাকাটার লিস্ট', 'Create Shopping List', language)}
              </h3>
              <button type="button" onClick={() => setNewListOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateListSubmit} className="space-y-4">
              <input
                type="text"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder={t('যেমন: সাপ্তাহিক বাজার, বইয়ের লিস্ট', 'e.g. Weekly Groceries, Books', language)}
                autoFocus
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('লিস্ট তৈরি করুন', 'Create List', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Rename List Modal */}
      {renameListTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('লিস্টের নাম পরিবর্তন করুন', 'Rename Shopping List', language)}
              </h3>
              <button type="button" onClick={() => setRenameListTarget(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRenameListSubmit} className="space-y-4">
              <input
                type="text"
                value={renameListTitle}
                onChange={(e) => setRenameListTitle(e.target.value)}
                autoFocus
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('নাম আপডেট করুন', 'Save Name', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete List Confirmation Modal */}
      {confirmDeleteList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('বাজার লিস্ট ডিলিট করবেন?', 'Delete Shopping List?', language)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              "{confirmDeleteList.title}" ({confirmDeleteList.items.length}{' '}
              {t('টি আইটেম', 'items', language)}) —{' '}
              {t('লিস্ট ও ভেতরের সব আইটেম স্থায়ীভাবে মুছে যাবে।', 'This list and all its items will be permanently removed.', language)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteList(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', language)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteList(confirmDeleteList.id);
                  setConfirmDeleteList(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('ডিলিট করুন', 'Delete', language)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('আইটেম এডিট করুন', 'Edit Item', language)}
              </h3>
              <button type="button" onClick={() => setEditingItem(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveItemEdit} className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  placeholder={t('পরিমাণ', 'Quantity', language)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div>
                  <input
                    type="text"
                    inputMode="text"
                    value={editPriceText}
                    onChange={(e) => setEditPriceText(e.target.value)}
                    placeholder={t(`দাম (${currency})`, `Price (${currency})`, language)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {hasMathOperators(editPriceText) && Number.isFinite(editPriceParsed) && editPriceParsed >= 0 && (
                    <p className="text-[11px] font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                      = {formatMoney(editPriceParsed, currency, language)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('আপডেট করুন', 'Save Changes', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Convert to Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {t('বাজার খরচ হিসাবে যোগ করুন', 'Log Shopping as Expense', language)}
              </h3>
              <button type="button" onClick={() => setExpenseModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmLogExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('খরচের বিবরণ *', 'Expense Title *', language)}
                </label>
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t(`মোট খরচ (${currency}) *`, `Total Amount (${currency}) *`, language)}
                    </label>
                    {hasMathOperators(expenseAmountText) && Number.isFinite(expenseAmountParsed) && expenseAmountParsed > 0 && (
                      <span className="text-[11px] font-bold font-mono text-emerald-600">
                        = {formatMoney(expenseAmountParsed, currency, language)}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="text"
                    value={expenseAmountText}
                    onChange={(e) => setExpenseAmountText(e.target.value)}
                    placeholder="1200"
                    required
                    autoFocus
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('তারিখ *', 'Date *', language)}
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('ক্যাটাগরি', 'Category', language)}
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('ওয়ালেট', 'Wallet', language)}
                  </label>
                  <select
                    value={expenseWalletId}
                    onChange={(e) => setExpenseWalletId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {checkedItems.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={clearAfterLog}
                    onChange={(e) => setClearAfterLog(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    {t(
                      'খরচে যোগ করার পর কেনা আইটেমগুলো লিস্ট থেকে মুছে দিন',
                      'Remove checked items from list after logging',
                      language
                    )}
                  </span>
                </label>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('খরচ হিসেবে সেভ করুন', 'Save Expense Entry', language)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
