import React, {useEffect, useState} from 'react';
import {ArrowLeftRight, MinusCircle, PlusCircle, X, Zap} from 'lucide-react';
import {
  CategoryItem,
  LanguageCode,
  QuickTemplate,
  Transaction,
  TransactionType,
  WalletAccount,
} from '../types';
import {getLocalDateStr, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

interface TransactionModalProps {
  isOpen: boolean;
  editingTransaction: Transaction | null;
  defaultType?: TransactionType;
  categories: CategoryItem[];
  wallets: WalletAccount[];
  quickTemplates: QuickTemplate[];
  currency: string;
  language: LanguageCode;
  onClose: () => void;
  onSave: (txData: Omit<Transaction, 'id' | 'createdAt'>, editingId?: string) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  editingTransaction,
  defaultType = 'expense',
  categories,
  wallets,
  quickTemplates,
  currency,
  language,
  onClose,
  onSave,
}) => {
  const [txType, setTxType] = useState<TransactionType>(defaultType);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [walletId, setWalletId] = useState(wallets[0]?.id || 'cash');
  const [toWalletId, setToWalletId] = useState(wallets[1]?.id || wallets[0]?.id || 'bkash');
  const [errorMsg, setErrorMsg] = useState('');

  const filteredCategories = categories.filter(
    (c) => c.type === (txType === 'income' ? 'income' : 'expense')
  );

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (editingTransaction) {
      setTxType(editingTransaction.type);
      setTitle(editingTransaction.title);
      setAmountText(String(editingTransaction.amount));
      setCategory(editingTransaction.category);
      setSubcategory(editingTransaction.subcategory || '');
      setDate(editingTransaction.date);
      setWalletId(editingTransaction.walletId || wallets[0]?.id || 'cash');
      setToWalletId(editingTransaction.toWalletId || wallets[1]?.id || 'bkash');
    } else {
      setTxType(defaultType);
      setTitle('');
      setAmountText('');
      const initialCat = categories.find((c) => c.type === (defaultType === 'income' ? 'income' : 'expense'));
      setCategory(initialCat?.name || '');
      setSubcategory('');
      setDate(getLocalDateStr());
      setWalletId(wallets[0]?.id || 'cash');
      setToWalletId(wallets[1]?.id || wallets[0]?.id || 'bkash');
    }
  }, [isOpen, editingTransaction, defaultType, categories, wallets]);

  useEffect(() => {
    if (!isOpen || txType === 'transfer') return;
    const valid = filteredCategories.some((c) => c.name === category);
    if (!valid && filteredCategories.length > 0) {
      setCategory(filteredCategories[0].name);
    }
  }, [txType, isOpen]);

  if (!isOpen) return null;

  const applyTemplate = (tpl: QuickTemplate) => {
    setTxType(tpl.type);
    setTitle(tpl.title);
    setAmountText(String(tpl.amount));
    setCategory(tpl.category);
    setWalletId(tpl.walletId);
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseLocaleNumber(amountText);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('সঠিক টাকার পরিমাণ লিখুন (০-এর বেশি)', 'Please enter a valid amount greater than 0', language));
      return;
    }

    if (txType === 'transfer') {
      if (walletId === toWalletId) {
        setErrorMsg(t('উৎস ও গন্তব্য ওয়ালেট আলাদা হতে হবে', 'Source and destination wallets must differ', language));
        return;
      }
      const fromName = wallets.find((w) => w.id === walletId)?.name || walletId;
      const toName = wallets.find((w) => w.id === toWalletId)?.name || toWalletId;
      onSave(
        {
          type: 'transfer',
          title: title.trim() || `${fromName} → ${toName}`,
          amount: parsedAmount,
          category: t('ওয়ালেট ট্রান্সফার', 'Wallet Transfer', language),
          subcategory: subcategory.trim() || undefined,
          date,
          walletId,
          toWalletId,
        },
        editingTransaction?.id
      );
      onClose();
      return;
    }

    if (!title.trim()) {
      setErrorMsg(t('লেনদেনের বিবরণ লিখুন', 'Please enter a description', language));
      return;
    }

    onSave(
      {
        type: txType,
        title: title.trim(),
        amount: parsedAmount,
        category: category || filteredCategories[0]?.name || 'Other',
        subcategory: subcategory.trim() || undefined,
        date,
        walletId,
      },
      editingTransaction?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Drag handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {editingTransaction
              ? t('লেনদেন সম্পাদনা করুন', 'Edit Transaction', language)
              : t('নতুন লেনদেন যুক্ত করুন', 'Add Transaction', language)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Type Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                txType === 'expense'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              {t('খরচ', 'Expense', language)}
            </button>
            <button
              type="button"
              onClick={() => setTxType('income')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                txType === 'income'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {t('আয়', 'Income', language)}
            </button>
            <button
              type="button"
              onClick={() => setTxType('transfer')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                txType === 'transfer'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {t('ট্রান্সফার', 'Transfer', language)}
            </button>
          </div>

          {/* 1-Tap Quick Templates (only on new entry) */}
          {!editingTransaction && quickTemplates.length > 0 && txType !== 'transfer' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>{t('কুইক টেমপ্লেট (এক ট্যাপে পূরণ করুন)', 'Quick Templates', language)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    {tpl.title} · {currency}{tpl.amount}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t(`পরিমাণ (${currency}) *`, `Amount (${currency}) *`, language)}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder={t('যেমন: ২৫০ বা 250', 'e.g. 250', language)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t('তারিখ *', 'Date *', language)}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {txType === 'transfer'
                ? t('ট্রান্সফার বিবরণ (ঐচ্ছিক)', 'Transfer Note (Optional)', language)
                : t('বিবরণ / নাম *', 'Title / Description *', language)}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                txType === 'income'
                  ? t('যেমন: মাসিক বেতন, টিউশন ফি, ফ্রিল্যান্সিং', 'e.g. Monthly Salary, Freelancing', language)
                  : txType === 'transfer'
                  ? t('যেমন: ব্যাংক থেকে ক্যাশ উত্তোলন', 'e.g. ATM Withdrawal', language)
                  : t('যেমন: দুপুরের খাবার, বাস ভাড়া, বাজার', 'e.g. Lunch, Bus Fare, Groceries', language)
              }
              required={txType !== 'transfer'}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Category & Wallet Selection */}
          {txType === 'transfer' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('কোন ওয়ালেট থেকে', 'From Wallet', language)}
                </label>
                <select
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('কোন ওয়ালেটে যাবে', 'To Wallet', language)}
                </label>
                <select
                  value={toWalletId}
                  onChange={(e) => setToWalletId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('খাত / ক্যাটাগরি *', 'Category *', language)}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('ওয়ালেট / মাধ্যম', 'Wallet', language)}
                </label>
                <select
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('নোট / উপ-খাত (ঐচ্ছিক)', 'Note (Optional)', language)}
            </label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder={t('যেমন: সুপারশপ, বন্ধুকে ট্রিট', 'e.g. Receipt #42, Notes', language)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="pt-2 pb-safe">
            <button
              type="submit"
              className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-sm transition-colors ${
                txType === 'income'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : txType === 'transfer'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {editingTransaction
                ? t('পরিবর্তন সেভ করুন', 'Save Changes', language)
                : txType === 'income'
                ? t('আয় জমা করুন', 'Save Income', language)
                : txType === 'transfer'
                ? t('ট্রান্সফার সম্পন্ন করুন', 'Confirm Transfer', language)
                : t('খরচ সেভ করুন', 'Save Expense', language)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
