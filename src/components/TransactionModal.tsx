import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Globe,
  ListPlus,
  MinusCircle,
  PlusCircle,
  X,
  Zap,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {convertCurrencyAmount, SUPPORTED_CURRENCIES} from '../services/currencyService';
import {
  CategoryItem,
  LanguageCode,
  QuickTemplate,
  Transaction,
  TransactionType,
  WalletAccount,
} from '../types';
import {
  formatMoney,
  getLocalDateStr,
  hasMathOperators,
  parseLocaleNumber,
} from '../utils/formatters';
import {t} from '../utils/i18n';

interface TransactionModalProps {
  isOpen: boolean;
  editingTransaction: Transaction | null;
  defaultType?: TransactionType;
  initialDate?: string;
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
  initialDate,
  categories,
  wallets,
  quickTemplates,
  language,
  onClose,
  onSave,
}) => {
  const {
    baseCurrency,
    displayCurrency,
    rates,
    convertToBase,
    convertToDisplay,
    formatConverted,
  } = useCurrency();

  const [txType, setTxType] = useState<TransactionType>(defaultType);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [date, setDate] = useState(initialDate || getLocalDateStr());
  const [walletId, setWalletId] = useState(wallets[0]?.id || 'cash');
  const [toWalletId, setToWalletId] = useState(wallets[1]?.id || wallets[0]?.id || 'bkash');
  const [errorMsg, setErrorMsg] = useState('');

  // Optional FX helper state
  const [useForeignFx, setUseForeignFx] = useState(false);
  const [fxCurrency, setFxCurrency] = useState('$');
  const [fxAmountText, setFxAmountText] = useState('');

  // Batch / Continuous entry state
  const [sessionCount, setSessionCount] = useState(0);
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const prevEditIdRef = useRef<string | null>(null);

  const filteredCategories = categories.filter(
    (c) => c.type === (txType === 'income' ? 'income' : 'expense')
  );

  // Initialize form ONLY when modal transitions open->closed or editing target changes,
  // so saving in Continuous Mode doesn't reset user's kept context (date/type/wallet/category)
  useEffect(() => {
    const editId = editingTransaction?.id || null;
    if (!isOpen) {
      wasOpenRef.current = false;
      prevEditIdRef.current = null;
      return;
    }

    const justOpened = !wasOpenRef.current;
    const editTargetChanged = prevEditIdRef.current !== editId;
    if (!justOpened && !editTargetChanged) {
      return;
    }

    wasOpenRef.current = true;
    prevEditIdRef.current = editId;
    setErrorMsg('');
    setSessionCount(0);
    setLastSavedNotice(null);
    setUseForeignFx(false);
    setFxAmountText('');
    setFxCurrency(displayCurrency === '$' ? '€' : '$');

    if (editingTransaction) {
      setTxType(editingTransaction.type);
      setTitle(editingTransaction.title);
      setAmountText(String(convertToDisplay(editingTransaction.amount)));
      setCategory(editingTransaction.category);
      setSubcategory(editingTransaction.subcategory || '');
      setDate(editingTransaction.date);
      setWalletId(editingTransaction.walletId || wallets[0]?.id || 'cash');
      setToWalletId(editingTransaction.toWalletId || wallets[1]?.id || 'bkash');
    } else {
      setTxType(defaultType);
      setTitle('');
      setAmountText('');
      const initialCat = categories.find(
        (c) => c.type === (defaultType === 'income' ? 'income' : 'expense')
      );
      setCategory(initialCat?.name || '');
      setSubcategory('');
      setDate(initialDate || getLocalDateStr());
      setWalletId(wallets[0]?.id || 'cash');
      setToWalletId(wallets[1]?.id || wallets[0]?.id || 'bkash');
    }

    window.setTimeout(() => {
      amountInputRef.current?.focus();
    }, 60);
  }, [isOpen, editingTransaction, defaultType, initialDate, categories, wallets, displayCurrency, convertToDisplay]);

  useEffect(() => {
    if (!isOpen || txType === 'transfer') return;
    const valid = filteredCategories.some((c) => c.name === category);
    if (!valid && filteredCategories.length > 0) {
      setCategory(filteredCategories[0].name);
    }
  }, [txType, isOpen, category, filteredCategories]);

  if (!isOpen) return null;

  const parsedPreviewAmount = parseLocaleNumber(amountText);
  const showCalcPreview =
    hasMathOperators(amountText) && Number.isFinite(parsedPreviewAmount) && parsedPreviewAmount > 0;

  const fxParsed = parseLocaleNumber(fxAmountText);
  const fxConvertedToDisplay =
    useForeignFx && Number.isFinite(fxParsed) && fxParsed > 0
      ? convertCurrencyAmount(fxParsed, fxCurrency, displayCurrency, rates)
      : 0;

  const applyTemplate = (tpl: QuickTemplate) => {
    setUseForeignFx(false);
    setTxType(tpl.type);
    setTitle(tpl.title);
    setAmountText(String(convertToDisplay(tpl.amount)));
    setCategory(tpl.category);
    setWalletId(tpl.walletId);
    setErrorMsg('');
  };

  const commitSave = (keepOpen: boolean) => {
    let resolvedBaseAmount = NaN;
    let displayShownAmount = NaN;

    if (useForeignFx && Number.isFinite(fxParsed) && fxParsed > 0) {
      resolvedBaseAmount = convertCurrencyAmount(fxParsed, fxCurrency, baseCurrency, rates);
      displayShownAmount = convertCurrencyAmount(fxParsed, fxCurrency, displayCurrency, rates);
    } else {
      const parsedAmount = parseLocaleNumber(amountText);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setErrorMsg(
          t('সঠিক টাকার পরিমাণ লিখুন (০-এর বেশি)', 'Please enter a valid amount greater than 0', language)
        );
        amountInputRef.current?.focus();
        return;
      }
      displayShownAmount = parsedAmount;
      resolvedBaseAmount = convertToBase(parsedAmount);
    }

    if (!Number.isFinite(resolvedBaseAmount) || resolvedBaseAmount <= 0) {
      setErrorMsg(
        t('সঠিক টাকার পরিমাণ লিখুন (০-এর বেশি)', 'Please enter a valid amount greater than 0', language)
      );
      return;
    }

    const fxNoteTag =
      useForeignFx && fxParsed > 0 ? `[${fxCurrency}${fxParsed}]` : '';
    const mergedSub = [subcategory.trim(), fxNoteTag].filter(Boolean).join(' · ');

    if (txType === 'transfer') {
      if (walletId === toWalletId) {
        setErrorMsg(
          t('উৎস ও গন্তব্য ওয়ালেট আলাদা হতে হবে', 'Source and destination wallets must differ', language)
        );
        return;
      }
      const fromName = wallets.find((w) => w.id === walletId)?.name || walletId;
      const toName = wallets.find((w) => w.id === toWalletId)?.name || toWalletId;
      const resolvedTitle = title.trim() || `${fromName} → ${toName}`;
      onSave(
        {
          type: 'transfer',
          title: resolvedTitle,
          amount: resolvedBaseAmount,
          category: t('ওয়ালেট ট্রান্সফার', 'Wallet Transfer', language),
          subcategory: mergedSub || undefined,
          date,
          walletId,
          toWalletId,
        },
        editingTransaction?.id
      );

      if (keepOpen && !editingTransaction) {
        const nextCount = sessionCount + 1;
        setSessionCount(nextCount);
        setLastSavedNotice(
          t(
            `"${resolvedTitle}" (${formatMoney(displayShownAmount, displayCurrency, language)}) সেভ হয়েছে`,
            `Saved "${resolvedTitle}" (${formatMoney(displayShownAmount, displayCurrency, language)})`,
            language
          )
        );
        setTitle('');
        setAmountText('');
        setFxAmountText('');
        setSubcategory('');
        setErrorMsg('');
        window.setTimeout(() => amountInputRef.current?.focus(), 40);
      } else {
        onClose();
      }
      return;
    }

    if (!title.trim()) {
      setErrorMsg(t('লেনদেনের বিবরণ লিখুন', 'Please enter a description', language));
      return;
    }

    const cleanTitle = title.trim();
    onSave(
      {
        type: txType,
        title: cleanTitle,
        amount: resolvedBaseAmount,
        category: category || filteredCategories[0]?.name || 'Other',
        subcategory: mergedSub || undefined,
        date,
        walletId,
      },
      editingTransaction?.id
    );

    if (keepOpen && !editingTransaction) {
      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      setLastSavedNotice(
        t(
          `"${cleanTitle}" (${formatMoney(displayShownAmount, displayCurrency, language)}) সেভ হয়েছে`,
          `Saved "${cleanTitle}" (${formatMoney(displayShownAmount, displayCurrency, language)})`,
          language
        )
      );
      setTitle('');
      setAmountText('');
      setFxAmountText('');
      setSubcategory('');
      setErrorMsg('');
      window.setTimeout(() => amountInputRef.current?.focus(), 40);
    } else {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitSave(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg ct-surface-card border-t sm:border rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Drag handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingTransaction
                ? t('লেনদেন সম্পাদনা করুন', 'Edit Transaction', language)
                : t('নতুন লেনদেন যুক্ত করুন', 'Add Transaction', language)}
            </h3>
            {!editingTransaction && sessionCount > 0 && (
              <p className="text-[11px] font-semibold ct-accent-text mt-0.5 tabular-nums">
                {t(`এই সেশনে ${sessionCount}টি এন্ট্রি সেভ হয়েছে`, `${sessionCount} entries saved in this session`, language)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center ct-btn-radius text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {lastSavedNotice && (
            <div className="px-3.5 py-2.5 ct-btn-radius bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{lastSavedNotice}</span>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
                {t('পরেরটি লিখুন', 'Ready for next', language)}
              </span>
            </div>
          )}

          {/* Type Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 ct-surface-alt ct-btn-radius">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                txType === 'expense'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
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
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
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
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-sky-600'
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
                    className="px-2.5 py-1.5 ct-btn-radius text-xs font-medium ct-surface-alt text-slate-700 dark:text-slate-200 border hover:ct-accent-border transition-colors"
                  >
                    {tpl.title} · {formatConverted(tpl.amount)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 ct-btn-radius bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t(`পরিমাণ (${displayCurrency}) *`, `Amount (${displayCurrency}) *`, language)}
                </label>
                {!useForeignFx && showCalcPreview && (
                  <span className="text-[11px] font-bold font-mono tabular-nums ct-accent-text">
                    = {formatMoney(parsedPreviewAmount, displayCurrency, language)}
                  </span>
                )}
              </div>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="text"
                disabled={useForeignFx}
                value={useForeignFx && fxConvertedToDisplay > 0 ? String(fxConvertedToDisplay) : amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder={t('যেমন: 250 বা 120+80', 'e.g. 250 or 120+80', language)}
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none disabled:opacity-60"
                required={!useForeignFx}
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
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                required
              />
            </div>
          </div>

          {/* Foreign Currency Conversion Entry Helper */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setUseForeignFx((v) => !v)}
              className="text-[11px] font-semibold ct-accent-text inline-flex items-center gap-1 hover:underline"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>
                {useForeignFx
                  ? t('স্বাভাবিক মুদ্রায় ফিরে যান', 'Use primary currency input', language)
                  : t('অন্য মুদ্রায় এন্ট্রি (FX কনভার্টার)', 'Enter in foreign currency (auto-convert)', language)}
              </span>
            </button>

            {useForeignFx && (
              <div className="p-3 ct-btn-radius ct-surface-alt border space-y-2">
                <div className="grid grid-cols-5 gap-2">
                  <select
                    value={fxCurrency}
                    onChange={(e) => setFxCurrency(e.target.value)}
                    className="col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 ct-btn-radius px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.symbol}>
                        {c.symbol} {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fxAmountText}
                    onChange={(e) => setFxAmountText(e.target.value)}
                    placeholder={t('পরিমাণ লিখুন', 'Foreign amount', language)}
                    className="col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 ct-btn-radius px-3 py-2 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
                {fxConvertedToDisplay > 0 && (
                  <p className="text-xs font-semibold ct-accent-text tabular-nums">
                    ≈ {formatMoney(fxConvertedToDisplay, displayCurrency, language)}{' '}
                    <span className="text-slate-500 dark:text-slate-400 font-normal">
                      ({t('লাইভ রেট অনুযায়ী', 'at current FX rate', language)})
                    </span>
                  </p>
                )}
              </div>
            )}
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
              className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
              className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            />
          </div>

          <div className="pt-2 pb-safe">
            {editingTransaction ? (
              <button
                type="submit"
                className={`w-full py-3.5 ct-btn-radius font-bold text-sm text-white shadow-sm transition-colors ${
                  txType === 'income'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : txType === 'transfer'
                    ? 'bg-sky-600 hover:bg-sky-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {t('পরিবর্তন সেভ করুন', 'Save Changes', language)}
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => commitSave(true)}
                  className="w-full py-3.5 px-3 ct-btn-radius font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all inline-flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <ListPlus className="w-4 h-4 shrink-0" />
                  <span>{t('সেভ ও আরও যোগ করুন', 'Save & Add Another', language)}</span>
                </button>
                <button
                  type="submit"
                  className={`w-full py-3.5 px-3 ct-btn-radius font-bold text-xs sm:text-sm text-white shadow-sm transition-colors min-h-[44px] ${
                    txType === 'income'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : txType === 'transfer'
                      ? 'bg-sky-600 hover:bg-sky-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {t('সেভ ও বন্ধ', 'Save & Close', language)}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

