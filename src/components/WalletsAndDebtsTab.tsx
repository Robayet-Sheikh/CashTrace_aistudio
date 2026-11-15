import React, {useMemo, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {
  ArrowLeftRight,
  CheckCircle2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Share2,
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
  onAddDebt: (debt: Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>, syncWalletId?: string) => void;
  onPayDebt: (debtId: string, payAmount: number, syncWalletId?: string) => void;
  onDeleteDebt: (debtId: string) => void;
  onShowToast: (msg: string) => void;
}

interface PersonGroup {
  key: string;
  personName: string;
  records: DebtRecord[];
  receivableRemaining: number;
  payableRemaining: number;
  netPending: number; // +ve = user receives, -ve = user owes
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
  onShowToast,
}) => {
  const [editingWallet, setEditingWallet] = useState<WalletAccount | null>(null);
  const [walletInitialInput, setWalletInitialInput] = useState('');

  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtType, setDebtType] = useState<'lent' | 'borrowed'>('lent');
  const [personName, setPersonName] = useState('');
  const [debtAmountText, setDebtAmountText] = useState('');
  const [debtDate, setDebtDate] = useState(getLocalDateStr());
  const [debtNote, setDebtNote] = useState('');
  const [syncWalletOnCreate, setSyncWalletOnCreate] = useState(false);
  const [createSyncWalletId, setCreateSyncWalletId] = useState(wallets[0]?.id || 'cash');

  const [payDebtTarget, setPayDebtTarget] = useState<DebtRecord | null>(null);
  const [payAmountText, setPayAmountText] = useState('');
  const [syncWalletOnPay, setSyncWalletOnPay] = useState(false);
  const [paySyncWalletId, setPaySyncWalletId] = useState(wallets[0]?.id || 'cash');

  const [personSearch, setPersonSearch] = useState('');
  const [debtFilter, setDebtFilter] = useState<'pending' | 'lent' | 'borrowed' | 'all'>('pending');

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

  const personGroups = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    const map = new Map<string, PersonGroup>();

    debts.forEach((d) => {
      const display = d.personName.trim() || 'Unknown';
      const key = display.toLowerCase();
      if (query && !key.includes(query)) return;

      const existing = map.get(key) || {
        key,
        personName: display,
        records: [],
        receivableRemaining: 0,
        payableRemaining: 0,
        netPending: 0,
      };
      existing.records.push(d);
      if (!d.settled) {
        const rem = Math.max(0, d.amount - d.paidAmount);
        if (d.type === 'lent') {
          existing.receivableRemaining += rem;
        } else {
          existing.payableRemaining += rem;
        }
      }
      existing.netPending = existing.receivableRemaining - existing.payableRemaining;
      map.set(key, existing);
    });

    return Array.from(map.values())
      .filter((g) => {
        if (debtFilter === 'pending') return g.records.some((r) => !r.settled);
        if (debtFilter === 'lent') return g.receivableRemaining > 0;
        if (debtFilter === 'borrowed') return g.payableRemaining > 0;
        return true;
      })
      .sort((a, b) => Math.abs(b.netPending) - Math.abs(a.netPending));
  }, [debts, personSearch, debtFilter]);

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

  const openNewDebtModal = (prefillPerson = '') => {
    setPersonName(prefillPerson);
    setDebtAmountText('');
    setDebtNote('');
    setDebtDate(getLocalDateStr());
    setSyncWalletOnCreate(false);
    setCreateSyncWalletId(wallets[0]?.id || 'cash');
    setDebtModalOpen(true);
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseLocaleNumber(debtAmountText);
    if (!personName.trim() || isNaN(amt) || amt <= 0) return;
    onAddDebt(
      {
        personName: personName.trim(),
        type: debtType,
        amount: amt,
        date: debtDate,
        note: debtNote.trim() || undefined,
      },
      syncWalletOnCreate ? createSyncWalletId : undefined
    );
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
    onPayDebt(payDebtTarget.id, amt, syncWalletOnPay ? paySyncWalletId : undefined);
    setPayDebtTarget(null);
    setPayAmountText('');
  };

  const handleSharePersonSummary = async (group: PersonGroup) => {
    const pendingItems = group.records.filter((r) => !r.settled);
    const lines = pendingItems.map((r) => {
      const rem = Math.max(0, r.amount - r.paidAmount);
      const label = r.type === 'lent' ? t('পাবো', 'Receivable', language) : t('দেবো', 'Payable', language);
      return `• ${r.date}: ${label} ${currency}${rem}${r.note ? ` (${r.note})` : ''}`;
    });
    const netLabel =
      group.netPending > 0
        ? `${t('মোট পাবো', 'Net Receivable', language)}: ${currency}${group.netPending}`
        : group.netPending < 0
        ? `${t('মোট দেবো', 'Net Payable', language)}: ${currency}${Math.abs(group.netPending)}`
        : t('হিসাব সমান', 'All Settled', language);

    const text = `📒 ${group.personName} — ${t('বকেয়া হিসাব', 'Pending Ledger', language)}\n${netLabel}\n\n${lines.join('\n')}`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: `${group.personName} - CashTrace`,
          text,
          dialogTitle: t('হিসাব শেয়ার করুন', 'Share Ledger Summary', language),
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onShowToast(t('হিসাবের সারাংশ কপি হয়েছে!', 'Ledger summary copied!', language));
      }
    } catch {
      onShowToast(t('শেয়ার করতে সমস্যা হয়েছে', 'Failed to share summary', language));
    }
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

      {/* Person-Wise Pending Ledger (দেনা-পাওনা / বাকি খাতা) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('ব্যক্তিভিত্তিক বাকি খাতা (দেনা-পাওনা)', 'Person-Wise Pending Ledger', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('মোট পাবো', 'Receivable', language)}:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatMoney(totalLentRemaining, currency, language, hideBalance)}
                </strong>{' '}
                · {t('মোট দেবো', 'Payable', language)}:{' '}
                <strong className="text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatMoney(totalBorrowedRemaining, currency, language, hideBalance)}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openNewDebtModal()}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('নতুন হিসাব', 'Add Record', language)}</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        {debts.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
              {(
                [
                  {id: 'pending', bn: 'চলমান বাকি', en: 'Pending'},
                  {id: 'lent', bn: 'পাবো', en: 'Receivable'},
                  {id: 'borrowed', bn: 'দেবো', en: 'Payable'},
                  {id: 'all', bn: 'সব', en: 'All'},
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDebtFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    debtFilter === tab.id
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
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder={t('ব্যক্তির নাম খুঁজুন...', 'Search person...', language)}
                className="w-full sm:w-52 bg-slate-100 dark:bg-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {personGroups.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {debts.length === 0
              ? t(
                  'কোনো দেনা-পাওনার হিসাব নেই। কারো সাথে লেনদেন বাকি থাকলে এখানে যোগ করুন।',
                  'No pending records yet. Add anyone you lent to or borrowed from.',
                  language
                )
              : t('এই ফিল্টারে কোনো বকেয়া হিসাব নেই', 'No matching pending records', language)}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {personGroups.map((group) => {
              const netAbs = Math.abs(group.netPending);
              const visibleRecords =
                debtFilter === 'pending'
                  ? group.records.filter((r) => !r.settled)
                  : debtFilter === 'lent'
                  ? group.records.filter((r) => r.type === 'lent')
                  : debtFilter === 'borrowed'
                  ? group.records.filter((r) => r.type === 'borrowed')
                  : group.records;

              return (
                <div
                  key={group.key}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-3"
                >
                  {/* Person Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {group.personName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {group.personName}
                        </h3>
                        <p
                          className={`text-xs font-bold tabular-nums ${
                            group.netPending > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : group.netPending < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {group.netPending > 0
                            ? `${t('মোট পাবো', 'Net Receivable', language)}: ${formatMoney(netAbs, currency, language, hideBalance)}`
                            : group.netPending < 0
                            ? `${t('মোট দেবো', 'Net Payable', language)}: ${formatMoney(netAbs, currency, language, hideBalance)}`
                            : t('হিসাব সমান (পরিশোধিত)', 'All Settled', language)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openNewDebtModal(group.personName)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 hover:bg-emerald-600/20"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('লেনদেন', 'Add', language)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSharePersonSummary(group)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                        title={t('হিসাব শেয়ার / কপি', 'Share Summary', language)}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Individual Pending Transactions with this Person */}
                  <div className="space-y-2.5">
                    {visibleRecords.map((debt) => {
                      const remaining = Math.max(0, debt.amount - debt.paidAmount);
                      const pct = Math.min(100, Math.round((debt.paidAmount / debt.amount) * 100));
                      const isLent = debt.type === 'lent';

                      return (
                        <div
                          key={debt.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/70 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] font-semibold">
                                <span className={isLent ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                  {isLent ? t('পাবো (ধার দিয়েছি)', 'Lent', language) : t('দেবো (ধার নিয়েছি)', 'Borrowed', language)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {formatDisplayDate(debt.date, language)}
                                </span>
                              </div>
                              {debt.note && (
                                <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                                  {debt.note}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => onDeleteDebt(debt.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              aria-label="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${debt.settled ? 'bg-emerald-500' : isLent ? 'bg-teal-500' : 'bg-amber-500'}`}
                              style={{width: `${pct}%`}}
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                              {t('বাকি', 'Left', language)}:{' '}
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
                                  setSyncWalletOnPay(false);
                                  setPaySyncWalletId(wallets[0]?.id || 'cash');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90"
                              >
                                {t('পরিশোধ আপডেট', 'Settle', language)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                  {t('কারণ / নোট (ঐচ্ছিক)', 'Reason / Note (Optional)', language)}
                </label>
                <input
                  type="text"
                  value={debtNote}
                  onChange={(e) => setDebtNote(e.target.value)}
                  placeholder={t('যেমন: দুপুরের বিল, নগদ ধার', 'e.g. Lunch split, cash loan', language)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="pt-1 space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncWalletOnCreate}
                    onChange={(e) => setSyncWalletOnCreate(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    {t('ওয়ালেট ব্যালেন্সেও এই লেনদেন যোগ করুন', 'Also update wallet balance & ledger', language)}
                  </span>
                </label>

                {syncWalletOnCreate && (
                  <select
                    value={createSyncWalletId}
                    onChange={(e) => setCreateSyncWalletId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
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

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncWalletOnPay}
                    onChange={(e) => setSyncWalletOnPay(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    {t('ওয়ালেট ব্যালেন্সেও সমন্বয় করুন', 'Also update wallet balance', language)}
                  </span>
                </label>

                {syncWalletOnPay && (
                  <select
                    value={paySyncWalletId}
                    onChange={(e) => setPaySyncWalletId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
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

