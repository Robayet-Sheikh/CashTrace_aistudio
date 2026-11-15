import React, {useMemo, useState} from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Landmark,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {DebtRecord, LanguageCode, MonthStore, WalletAccount} from '../types';
import {formatDisplayDate, formatMoney, getLocalDateStr, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

interface WalletsAndDebtsTabProps {
  wallets: WalletAccount[];
  months: Record<string, MonthStore>;
  debts: DebtRecord[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onUpdateWalletInitial: (walletId: string, initialBalance: number) => void;
  onOpenTransferModal: () => void;
  onAddDebt: (debt: Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>) => void;
  onPayDebt: (debtId: string, payAmount: number) => void;
  onDeleteDebt: (debtId: string) => void;
}

export const WalletsAndDebtsTab: React.FC<WalletsAndDebtsTabProps> = ({
  wallets,
  months,
  debts,
  currency,
  language,
  hideBalance,
  onUpdateWalletInitial,
  onOpenTransferModal,
  onAddDebt,
  onPayDebt,
  onDeleteDebt,
}) => {
  const [editingWallet, setEditingWallet] = useState<WalletAccount | null>(null);
  const [walletInitialInput, setWalletInitialInput] = useState('');

  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtType, setDebtType] = useState<'lent' | 'borrowed'>('lent');
  const [personName, setPersonName] = useState('');
  const [debtAmountText, setDebtAmountText] = useState('');
  const [debtDate, setDebtDate] = useState(getLocalDateStr());
  const [debtNote, setDebtNote] = useState('');

  const [payDebtTarget, setPayDebtTarget] = useState<DebtRecord | null>(null);
  const [payAmountText, setPayAmountText] = useState('');

  // Compute live balance for each wallet across all stored months
  const walletBalances = useMemo(() => {
    const map = new Map<string, number>();
    wallets.forEach((w) => map.set(w.id, w.initialBalance || 0));

    Object.values(months).forEach((m) => {
      m.transactions.forEach((tx) => {
        if (tx.type === 'income') {
          map.set(tx.walletId, (map.get(tx.walletId) || 0) + tx.amount);
        } else if (tx.type === 'expense') {
          map.set(tx.walletId, (map.get(tx.walletId) || 0) - tx.amount);
        } else if (tx.type === 'transfer') {
          map.set(tx.walletId, (map.get(tx.walletId) || 0) - tx.amount);
          if (tx.toWalletId) {
            map.set(tx.toWalletId, (map.get(tx.toWalletId) || 0) + tx.amount);
          }
        }
      });
    });

    return map;
  }, [wallets, months]);

  const totalNetWorth = useMemo(
    () => Array.from(walletBalances.values()).reduce((s, v) => s + v, 0),
    [walletBalances]
  );

  const totalLentRemaining = debts
    .filter((d) => d.type === 'lent' && !d.settled)
    .reduce((s, d) => s + Math.max(0, d.amount - d.paidAmount), 0);

  const totalBorrowedRemaining = debts
    .filter((d) => d.type === 'borrowed' && !d.settled)
    .reduce((s, d) => s + Math.max(0, d.amount - d.paidAmount), 0);

  const getWalletIcon = (type: WalletAccount['type']) => {
    if (type === 'mobile') return <Smartphone className="w-5 h-5" />;
    if (type === 'bank') return <Landmark className="w-5 h-5" />;
    return <Wallet className="w-5 h-5" />;
  };

  const saveWalletInitial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWallet) return;
    const val = parseLocaleNumber(walletInitialInput);
    if (!isNaN(val)) {
      onUpdateWalletInitial(editingWallet.id, val);
      setEditingWallet(null);
    }
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseLocaleNumber(debtAmountText);
    if (!personName.trim() || isNaN(amt) || amt <= 0) return;
    onAddDebt({
      personName: personName.trim(),
      type: debtType,
      amount: amt,
      date: debtDate,
      note: debtNote.trim() || undefined,
    });
    setPersonName('');
    setDebtAmountText('');
    setDebtNote('');
    setDebtModalOpen(false);
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebtTarget) return;
    const amt = parseLocaleNumber(payAmountText);
    if (isNaN(amt) || amt <= 0) return;
    onPayDebt(payDebtTarget.id, amt);
    setPayDebtTarget(null);
    setPayAmountText('');
  };

  return (
    <div className="space-y-6">
      {/* Wallets Overview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('আমার ওয়ালেট ও অ্যাকাউন্টসমূহ', 'Wallets & Accounts', language)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('মোট সম্পদ', 'Combined Balance', language)}:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatMoney(totalNetWorth, currency, language, hideBalance)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenTransferModal}
            className="px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{t('ওয়ালেট ট্রান্সফার', 'Transfer', language)}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {wallets.map((w) => {
            const bal = walletBalances.get(w.id) || 0;
            return (
              <div
                key={w.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{backgroundColor: w.color}}
                    >
                      {getWalletIcon(w.type)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{w.name}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('শুরুর ব্যালেন্স', 'Opening', language)}: {formatMoney(w.initialBalance, currency, language, hideBalance)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingWallet(w);
                      setWalletInitialInput(String(w.initialBalance || 0));
                    }}
                    className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg"
                    title={t('প্রাথমিক ব্যালেন্স এডিট', 'Edit opening balance', language)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(bal, currency, language, hideBalance)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lent & Borrowed Tracker */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('দেনা-পাওনা / বাকি খাতা', 'Lent & Borrowed Tracker', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('পাওনা', 'Receivable', language)}:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatMoney(totalLentRemaining, currency, language, hideBalance)}
                </strong>{' '}
                · {t('দেনা', 'Payable', language)}:{' '}
                <strong className="text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatMoney(totalBorrowedRemaining, currency, language, hideBalance)}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDebtModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('নতুন হিসাব', 'Add Record', language)}</span>
          </button>
        </div>

        {debts.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('কোনো দেনা-পাওনার হিসাব নেই। কাউকে ধার দিলে বা নিলে এখানে যোগ করুন।', 'No lent or borrowed records yet.', language)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {debts.map((debt) => {
              const remaining = Math.max(0, debt.amount - debt.paidAmount);
              const pct = Math.min(100, Math.round((debt.paidAmount / debt.amount) * 100));
              const isLent = debt.type === 'lent';

              return (
                <div
                  key={debt.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className={isLent ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {isLent ? t('পাবো (ধার দিয়েছি)', 'Lent (Receivable)', language) : t('দেবো (ধার নিয়েছি)', 'Borrowed (Payable)', language)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500 dark:text-slate-400">{formatDisplayDate(debt.date, language)}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{debt.personName}</h4>
                      {debt.note && <p className="text-xs text-slate-500 dark:text-slate-400">{debt.note}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteDebt(debt.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      aria-label="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${debt.settled ? 'bg-emerald-500' : isLent ? 'bg-teal-500' : 'bg-amber-500'}`}
                      style={{width: `${pct}%`}}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {t('বাকি', 'Remaining', language)}:{' '}
                      <strong>{formatMoney(remaining, currency, language, hideBalance)}</strong> /{' '}
                      {formatMoney(debt.amount, currency, language, hideBalance)}
                    </span>

                    {debt.settled ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('পরিশোধিত', 'Settled', language)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPayDebtTarget(debt);
                          setPayAmountText(String(remaining));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90"
                      >
                        {t('পরিশোধ আপডেট', 'Record Payment', language)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Wallet Initial Balance Modal */}
      {editingWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{editingWallet.name}</h3>
              <button type="button" onClick={() => setEditingWallet(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={saveWalletInitial} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`শুরুর ব্যালেন্স (${currency})`, `Opening Balance (${currency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={walletInitialInput}
                  onChange={(e) => setWalletInitialInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('সেভ করুন', 'Save Opening Balance', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Debt Modal */}
      {debtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন দেনা-পাওনার হিসাব', 'New Lent / Borrowed Record', language)}
              </h3>
              <button type="button" onClick={() => setDebtModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDebt} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDebtType('lent')}
                  className={`py-2 rounded-lg text-xs font-bold ${
                    debtType === 'lent'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {t('ধার দিয়েছি (পাওনা)', 'Lent (Receivable)', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setDebtType('borrowed')}
                  className={`py-2 rounded-lg text-xs font-bold ${
                    debtType === 'borrowed'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {t('ধার নিয়েছি (দেনা)', 'Borrowed (Payable)', language)}
                </button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('ব্যক্তির নাম *', 'Person Name *', language)}
                </label>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder={t('যেমন: রাফি, সুমন ভাই', 'e.g. Rafi, Sumon', language)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t(`টাকার পরিমাণ (${currency}) *`, `Amount (${currency}) *`, language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={debtAmountText}
                    onChange={(e) => setDebtAmountText(e.target.value)}
                    placeholder="500"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('তারিখ', 'Date', language)}
                  </label>
                  <input
                    type="date"
                    value={debtDate}
                    onChange={(e) => setDebtDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('নোট (ঐচ্ছিক)', 'Note (Optional)', language)}
                </label>
                <input
                  type="text"
                  value={debtNote}
                  onChange={(e) => setDebtNote(e.target.value)}
                  placeholder={t('যেমন: আগামী মাসে ফেরত দেবে', 'e.g. Due next month', language)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('হিসাব সেভ করুন', 'Save Record', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pay/Settle Debt Modal */}
      {payDebtTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {payDebtTarget.personName} — {t('পরিশোধ', 'Payment', language)}
              </h3>
              <button type="button" onClick={() => setPayDebtTarget(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handlePayDebtSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`পরিশোধের পরিমাণ (${currency})`, `Payment Amount (${currency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={payAmountText}
                  onChange={(e) => setPayAmountText(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('আপডেট করুন', 'Confirm Payment', language)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
