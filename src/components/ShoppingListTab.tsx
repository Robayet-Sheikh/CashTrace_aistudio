import React, {useEffect, useMemo, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {
  Check,
  CheckCircle2,
  ListChecks,
  Pencil,
  Plus,
  Receipt,
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
import {formatMoney, getLocalDateStr, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

interface ShoppingListTabProps {
  lists: ShoppingList[];
  wallets: WalletAccount[];
  categories: CategoryItem[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onCreateList: (title: string) => string;
  onDeleteList: (listId: string) => void;
  onAddItem: (listId: string, item: Omit<ShoppingItem, 'id' | 'checked' | 'createdAt'>) => void;
  onToggleItem: (listId: string, itemId: string) => void;
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
  onDeleteList,
  onAddItem,
  onToggleItem,
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

  // New list modal
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  // Edit item modal
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPriceText, setEditPriceText] = useState('');

  // Convert checked items to expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountText, setExpenseAmountText] = useState('');
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
  };

  const handleCreateListSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    const createdId = onCreateList(newListTitle.trim());
    setActiveListId(createdId);
    setNewListTitle('');
    setNewListOpen(false);
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
        date: getLocalDateStr(),
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
    const text = `🛒 ${activeList.title}\n\n${lines.join('\n')}\n\n${t('মোট আনুমানিক', 'Est. Total', language)}: ${currency}${totalEstimated}`;

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
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShoppingBasket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('বাজার ও কেনাকাটার লিস্ট', 'Shopping & Bazar Lists', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'বাজারের ফর্দ তৈরি করুন, দাম লিখুন এবং কেনা শেষে ১ ক্লিকে খরচে যোগ করুন',
                  'Plan groceries, track item prices, and log bought items directly as expenses',
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

        {/* List Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {lists.map((lst) => {
            const isActive = lst.id === activeList?.id;
            const pendingCount = lst.items.filter((i) => !i.checked).length;
            return (
              <div key={lst.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveListId(lst.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 border transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{lst.title}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pendingCount}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Live List Summary Metrics */}
        {activeList && (
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                {t('কেনা হয়েছে', 'Bought', language)}
              </span>
              <strong className="text-sm sm:text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {checkedItems.length} / {items.length}
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
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                {t('বাকি আনুমানিক', 'Remaining', language)}
              </span>
              <strong className="text-sm sm:text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {formatMoney(remainingTotal, currency, language, hideBalance)}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Add Item + Checklist Card */}
      {activeList && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
          {/* Quick Inline Add Bar */}
          <form onSubmit={handleAddInlineItem} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
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
              inputMode="decimal"
              value={itemPriceText}
              onChange={(e) => setItemPriceText(e.target.value)}
              placeholder={t(`দাম (${currency})`, `Price (${currency})`, language)}
              className="sm:col-span-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 min-h-[42px]"
            >
              <Plus className="w-4 h-4" />
              <span>{t('যোগ করুন', 'Add', language)}</span>
            </button>
          </form>

          {/* List Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 dark:border-slate-800 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={openLogExpenseModal}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
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
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('শেয়ার / কপি', 'Share / Copy', language)}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {checkedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearChecked(activeList.id)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                >
                  {t('কেনা আইটেম মুছুন', 'Clear Bought', language)}
                </button>
              )}
              {lists.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteList(activeList.id)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  {t('লিস্ট ডিলিট', 'Delete List', language)}
                </button>
              )}
            </div>
          </div>

          {/* Checklist Items */}
          {items.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <ShoppingBasket className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t(
                  'এই লিস্টটি খালি। উপরের বক্সে জিনিসের নাম লিখে বাজারের ফর্দ তৈরি করুন।',
                  'This list is empty. Add items above to build your shopping checklist.',
                  language
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...uncheckedItems, ...checkedItems].map((item) => (
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
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.estimatedPrice !== undefined && item.estimatedPrice > 0 && (
                      <span
                        className={`text-xs sm:text-sm font-bold tabular-nums mr-1 ${
                          item.checked ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {formatMoney(item.estimatedPrice, currency, language, hideBalance)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg"
                      aria-label="Edit item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(activeList.id, item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  placeholder={t('পরিমাণ', 'Quantity', language)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPriceText}
                  onChange={(e) => setEditPriceText(e.target.value)}
                  placeholder={t(`দাম (${currency})`, `Price (${currency})`, language)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`মোট খরচ (${currency}) *`, `Total Amount (${currency}) *`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={expenseAmountText}
                  onChange={(e) => setExpenseAmountText(e.target.value)}
                  placeholder="1200"
                  required
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
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
                    {t('খরচে যোগ করার পর কেনা আইটেমগুলো লিস্ট থেকে মুছে দিন', 'Remove checked items from list after logging', language)}
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
