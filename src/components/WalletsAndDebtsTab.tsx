import React, {useMemo, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
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
import {useCurrency} from '../contexts/CurrencyContext';
import {DebtRecord, LanguageCode, MonthStore, WalletAccount} from '../types';
import {
  formatDisplayDate,
  formatMoney,
  getLocalDateStr,
  getLocalMonthKey,
  hasMathOperators,
  parseLocaleNumber,
} from '../utils/formatters';
import {t} from '../utils/i18n';

interface WalletsAndDebtsTabProps {
  wallets: WalletAccount[];
  months: Record<string, MonthStore>;
  debts: DebtRecord[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onSaveWallet: (wallet: Omit<WalletAccount, 'id'>, editingId?: string) => void;
  onDeleteWallet: (walletId: string) => void;
  onOpenTransferModal: () => void;
  onAddDebt: (debt: Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>, syncWalletId?: string) => void;
  onUpdateDebt: (debt: DebtRecord) => void;
  onPayDebt: (debtId: string, payAmount: number, syncWalletId?: string) => void;
  onSettleAllPersonDebts: (personName: string, debtIds: string[]) => void;
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

const WALLET_COLORS = ['#059669', '#e11d48', '#2563eb', '#7c3aed', '#d97706', '#0d9488'];

export const WalletsAndDebtsTab: React.FC<WalletsAndDebtsTabProps> = ({
  wallets,
  months,
  debts,
  language,
  hideBalance,
  onSaveWallet,
  onDeleteWallet,
  onOpenTransferModal,
  onAddDebt,
  onUpdateDebt,
  onPayDebt,
  onSettleAllPersonDebts,
  onDeleteDebt,
  onShowToast,
}) => {
  const {displayCurrency, convertToBase, convertToDisplay, formatConverted} = useCurrency();
  // Wallet add/edit modal state
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletAccount | null>(null);
  const [walletNameInput, setWalletNameInput] = useState('');
  const [walletTypeInput, setWalletTypeInput] = useState<WalletAccount['type']>('mobile');
  const [walletInitialInput, setWalletInitialInput] = useState('');
  const [walletColorInput, setWalletColorInput] = useState(WALLET_COLORS[0]);
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState<WalletAccount | null>(null);

  // Create / Edit Debt modal state
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtRecord | null>(null);
  const [debtType, setDebtType] = useState<'lent' | 'borrowed'>('lent');
  const [personName, setPersonName] = useState('');
  const [debtAmountText, setDebtAmountText] = useState('');
  const [debtPaidText, setDebtPaidText] = useState('0');
  const [debtDate, setDebtDate] = useState(getLocalDateStr());
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [debtError, setDebtError] = useState('');
  const [syncWalletOnCreate, setSyncWalletOnCreate] = useState(false);
  const [createSyncWalletId, setCreateSyncWalletId] = useState(wallets[0]?.id || 'cash');

  // Payment / Settle modal state
  const [payDebtTarget, setPayDebtTarget] = useState<DebtRecord | null>(null);
  const [payAmountText, setPayAmountText] = useState('');
  const [syncWalletOnPay, setSyncWalletOnPay] = useState(false);
  const [paySyncWalletId, setPaySyncWalletId] = useState(wallets[0]?.id || 'cash');

  // Delete debt confirmation
  const [deleteDebtTarget, setDeleteDebtTarget] = useState<DebtRecord | null>(null);

  // Filters
  const [personSearch, setPersonSearch] = useState('');
  const [debtFilter, setDebtFilter] = useState<'pending' | 'lent' | 'borrowed' | 'all'>('pending');

  const todayStr = getLocalDateStr();

  // Unique known person names for fast autocomplete chips
  const knownPeople = useMemo(() => {
    const map = new Map<string, string>();
    debts.forEach((d) => {
      const clean = d.personName.trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    });
    return Array.from(map.values()).slice(0, 10);
  }, [debts]);

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

  const currentMonthKey = getLocalMonthKey();

  const monthlyWalletFlows = useMemo(() => {
    const map = new Map<string, {inflow: number; outflow: number}>();
    wallets.forEach((w) => map.set(w.id, {inflow: 0, outflow: 0}));
    const currentTxs = months[currentMonthKey]?.transactions || [];
    currentTxs.forEach((tx) => {
      const entry = map.get(tx.walletId) || {inflow: 0, outflow: 0};
      if (tx.type === 'income') {
        entry.inflow += tx.amount;
        map.set(tx.walletId, entry);
      } else if (tx.type === 'expense') {
        entry.outflow += tx.amount;
        map.set(tx.walletId, entry);
      } else if (tx.type === 'transfer') {
        entry.outflow += tx.amount;
        map.set(tx.walletId, entry);
        if (tx.toWalletId) {
          const dest = map.get(tx.toWalletId) || {inflow: 0, outflow: 0};
          dest.inflow += tx.amount;
          map.set(tx.toWalletId, dest);
        }
      }
    });
    return map;
  }, [wallets, months, currentMonthKey]);

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

  const overdueDebtsCount = useMemo(
    () => debts.filter((d) => !d.settled && d.dueDate && d.dueDate < todayStr).length,
    [debts, todayStr]
  );

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

  const openAddWalletModal = () => {
    setEditingWallet(null);
    setWalletNameInput('');
    setWalletTypeInput('mobile');
    setWalletInitialInput('0');
    setWalletColorInput(WALLET_COLORS[wallets.length % WALLET_COLORS.length]);
    setWalletModalOpen(true);
  };

  const openEditWalletModal = (w: WalletAccount) => {
    setEditingWallet(w);
    setWalletNameInput(w.name);
    setWalletTypeInput(w.type);
    setWalletInitialInput(String(convertToDisplay(w.initialBalance || 0)));
    setWalletColorInput(w.color || WALLET_COLORS[0]);
    setWalletModalOpen(true);
  };

  const handleSaveWalletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletNameInput.trim()) return;
    const val = parseLocaleNumber(walletInitialInput || '0');
    if (isNaN(val)) return;
    onSaveWallet(
      {
        name: walletNameInput.trim(),
        type: walletTypeInput,
        initialBalance: convertToBase(val),
        color: walletColorInput,
      },
      editingWallet?.id
    );
    setWalletModalOpen(false);
    setEditingWallet(null);
  };

  const openNewDebtModal = (prefillPerson = '') => {
    setEditingDebt(null);
    setDebtType('lent');
    setPersonName(prefillPerson);
    setDebtAmountText('');
    setDebtPaidText('0');
    setDebtDate(getLocalDateStr());
    setDebtDueDate('');
    setDebtNote('');
    setDebtError('');
    setSyncWalletOnCreate(false);
    setCreateSyncWalletId(wallets[0]?.id || 'cash');
    setDebtModalOpen(true);
  };

  const openEditDebtModal = (debt: DebtRecord) => {
    setEditingDebt(debt);
    setDebtType(debt.type);
    setPersonName(debt.personName);
    setDebtAmountText(String(convertToDisplay(debt.amount)));
    setDebtPaidText(String(convertToDisplay(debt.paidAmount)));
    setDebtDate(debt.date || getLocalDateStr());
    setDebtDueDate(debt.dueDate || '');
    setDebtNote(debt.note || '');
    setDebtError('');
    setDebtModalOpen(true);
  };

  const handleDebtFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amtDisplay = parseLocaleNumber(debtAmountText);
    if (!personName.trim() || isNaN(amtDisplay) || amtDisplay <= 0) {
      setDebtError(t('ব্যক্তির নাম এবং সঠিক টাকার পরিমাণ লিখুন', 'Enter a valid person name and amount', language));
      return;
    }

    if (editingDebt) {
      const paidDisplay = debtPaidText.trim() ? parseLocaleNumber(debtPaidText) : 0;
      if (isNaN(paidDisplay) || paidDisplay < 0 || paidDisplay > amtDisplay) {
        setDebtError(
          t(
            'পরিশোধিত টাকা ০ থেকে মোট টাকার মধ্যে হতে হবে',
            'Paid amount must be between 0 and total amount',
            language
          )
        );
        return;
      }
      const amtBase = convertToBase(amtDisplay);
      const paidBase = convertToBase(paidDisplay);
      onUpdateDebt({
        ...editingDebt,
        personName: personName.trim(),
        type: debtType,
        amount: amtBase,
        paidAmount: paidBase,
        date: debtDate || getLocalDateStr(),
        dueDate: debtDueDate.trim() || undefined,
        note: debtNote.trim() || undefined,
        settled: paidDisplay >= amtDisplay,
      });
      setDebtModalOpen(false);
      setEditingDebt(null);
      return;
    }

    onAddDebt(
      {
        personName: personName.trim(),
        type: debtType,
        amount: convertToBase(amtDisplay),
        date: debtDate || getLocalDateStr(),
        dueDate: debtDueDate.trim() || undefined,
        note: debtNote.trim() || undefined,
      },
      syncWalletOnCreate ? createSyncWalletId : undefined
    );
    setPersonName('');
    setDebtAmountText('');
    setDebtNote('');
    setDebtDueDate('');
    setDebtModalOpen(false);
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebtTarget) return;
    const amtDisplay = parseLocaleNumber(payAmountText);
    if (isNaN(amtDisplay) || amtDisplay <= 0) return;
    onPayDebt(payDebtTarget.id, convertToBase(amtDisplay), syncWalletOnPay ? paySyncWalletId : undefined);
    setPayDebtTarget(null);
    setPayAmountText('');
  };

  const handleSharePersonSummary = async (group: PersonGroup) => {
    const pendingItems = group.records.filter((r) => !r.settled);
    const lines = pendingItems.map((r) => {
      const rem = Math.max(0, r.amount - r.paidAmount);
      const label = r.type === 'lent' ? t('পাবো', 'Receivable', language) : t('দেবো', 'Payable', language);
      const duePart = r.dueDate ? ` · ${t('তারিখ', 'Due', language)}: ${r.dueDate}` : '';
      const paidPart = r.paidAmount > 0 ? ` (${t('পরিশোধ', 'Paid', language)}: ${formatConverted(r.paidAmount, false)})` : '';
      return `• ${r.date}: ${label} ${formatConverted(rem, false)}${paidPart}${duePart}${r.note ? ` — ${r.note}` : ''}`;
    });
    const netLabel =
      group.netPending > 0
        ? `${t('মোট পাবো', 'Net Receivable', language)}: ${formatConverted(group.netPending, false)}`
        : group.netPending < 0
        ? `${t('মোট দেবো', 'Net Payable', language)}: ${formatConverted(Math.abs(group.netPending), false)}`
        : t('হিসাব সমান (পরিশোধিত)', 'All Settled', language);

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

  const debtAmountParsed = parseLocaleNumber(debtAmountText);
  const debtPaidParsed = parseLocaleNumber(debtPaidText);
  const payAmountParsed = parseLocaleNumber(payAmountText);
  const walletInitParsed = parseLocaleNumber(walletInitialInput);

  return (
    <div className="space-y-6">
      {/* Wallets Overview */}
      <div className="ct-surface-card p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('আমার ওয়ালেট ও অ্যাকাউন্টসমূহ', 'Wallets & Accounts', language)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('মোট সম্পদ', 'Combined Balance', language)}:{' '}
              <strong className="ct-accent-text tabular-nums">
                {formatConverted(totalNetWorth, hideBalance)}
              </strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddWalletModal}
              className="px-3 py-2.5 ct-btn-radius ct-surface-alt hover:opacity-90 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('নতুন ওয়ালেট', 'New Wallet', language)}</span>
            </button>
            <button
              type="button"
              onClick={onOpenTransferModal}
              className="px-3.5 py-2.5 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{t('ওয়ালেট ট্রান্সফার', 'Transfer', language)}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {wallets.map((w) => {
            const bal = walletBalances.get(w.id) || 0;
            const flow = monthlyWalletFlows.get(w.id) || {inflow: 0, outflow: 0};
            return (
              <div
                key={w.id}
                className="relative overflow-hidden p-4 rounded-2xl ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between space-y-3.5"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{backgroundColor: w.color}}
                />
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{backgroundColor: w.color}}
                    >
                      {getWalletIcon(w.type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{w.name}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {t('শুরুর ব্যালেন্স', 'Opening', language)}: {formatConverted(w.initialBalance, hideBalance)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditWalletModal(w)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:ct-accent-text rounded-lg"
                      title={t('ওয়ালেট এডিট করুন', 'Edit wallet', language)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {wallets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWallet(w)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg"
                        title={t('ওয়ালেট ডিলিট করুন', 'Delete wallet', language)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatConverted(bal, hideBalance)}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-[11px] font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ArrowDownLeft className="w-3 h-3" />
                      +{formatConverted(flow.inflow, hideBalance)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                      <ArrowUpRight className="w-3 h-3" />
                      -{formatConverted(flow.outflow, hideBalance)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Person-Wise Pending Ledger (দেনা-পাওনা / বাকি খাতা) */}
      <div className="ct-surface-card p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 ct-accent-text shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('ব্যক্তিভিত্তিক বাকি খাতা (দেনা-পাওনা)', 'Person-Wise Pending Ledger', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('মোট পাবো', 'Receivable', language)}:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatConverted(totalLentRemaining, hideBalance)}
                </strong>{' '}
                · {t('মোট দেবো', 'Payable', language)}:{' '}
                <strong className="text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatConverted(totalBorrowedRemaining, hideBalance)}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openNewDebtModal()}
            className="px-3.5 py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('নতুন হিসাব', 'Add Record', language)}</span>
          </button>
        </div>

        {overdueDebtsCount > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {t(
                `${overdueDebtsCount}টি বাকি হিসাবের নির্ধারিত সময় পার হয়ে গেছে`,
                `${overdueDebtsCount} pending record(s) are past their due date`,
                language
              )}
            </span>
          </div>
        )}

        {/* Search & Filter Controls */}
        {debts.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 ct-surface-alt rounded-xl overflow-x-auto no-scrollbar">
              {(
                [
                  {id: 'pending', bn: 'চলমান বাকি', en: 'Pending'},
                  {id: 'lent', bn: 'পাবো', en: 'Receivable'},
                  {id: 'borrowed', bn: 'দেবো', en: 'Payable'},
                  {id: 'all', bn: 'সব (পরিশোধিত সহ)', en: 'All'},
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
                className="w-full sm:w-52 ct-surface-alt rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
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
              const pendingIdsForPerson = group.records.filter((r) => !r.settled).map((r) => r.id);

              return (
                <div
                  key={group.key}
                  className="p-4 rounded-2xl ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 space-y-3"
                >
                  {/* Person Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl ct-accent-bg text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {group.personName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
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
                            ? `${t('মোট পাবো', 'Net Receivable', language)}: ${formatConverted(netAbs, hideBalance)}`
                            : group.netPending < 0
                            ? `${t('মোট দেবো', 'Net Payable', language)}: ${formatConverted(netAbs, hideBalance)}`
                            : t('হিসাব সমান (পরিশোধিত)', 'All Settled', language)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openNewDebtModal(group.personName)}
                        className="px-2.5 py-1.5 rounded-lg ct-accent-soft ct-accent-text text-[11px] font-bold inline-flex items-center gap-1 hover:opacity-90"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('লেনদেন', 'Add', language)}</span>
                      </button>
                      {pendingIdsForPerson.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onSettleAllPersonDebts(group.personName, pendingIdsForPerson)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90"
                        >
                          {t('সব সেটেল', 'Settle All', language)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSharePersonSummary(group)}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-500 hover:ct-accent-text hover:bg-slate-200/60 dark:hover:bg-slate-700"
                        title={t('হিসাব শেয়ার / কপি', 'Share Summary', language)}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Individual Transactions with this Person */}
                  <div className="space-y-2.5">
                    {visibleRecords.map((debt) => {
                      const remaining = Math.max(0, debt.amount - debt.paidAmount);
                      const pct = Math.min(100, Math.round((debt.paidAmount / debt.amount) * 100));
                      const isLent = debt.type === 'lent';
                      const isOverdue = Boolean(!debt.settled && debt.dueDate && debt.dueDate < todayStr);

                      return (
                        <div
                          key={debt.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/70 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                                <span
                                  className={
                                    isLent
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }
                                >
                                  {isLent ? t('পাবো (ধার দিয়েছি)', 'Lent', language) : t('দেবো (ধার নিয়েছি)', 'Borrowed', language)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {formatDisplayDate(debt.date, language)}
                                </span>
                                {debt.dueDate && !debt.settled && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span
                                      className={`inline-flex items-center gap-1 ${
                                        isOverdue
                                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {isOverdue ? (
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                      ) : (
                                        <CalendarClock className="w-3 h-3 shrink-0" />
                                      )}
                                      {isOverdue
                                        ? t(`মেয়াদ শেষ (${formatDisplayDate(debt.dueDate, language)})`, `Overdue (${formatDisplayDate(debt.dueDate, language)})`, language)
                                        : t(`টার্গেট ${formatDisplayDate(debt.dueDate, language)}`, `Due ${formatDisplayDate(debt.dueDate, language)}`, language)}
                                    </span>
                                  </>
                                )}
                              </div>
                              {debt.note && (
                                <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
                                  {debt.note}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditDebtModal(debt)}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-emerald-600 rounded-lg"
                                aria-label="Edit record"
                                title={t('তথ্য এডিট করুন', 'Edit record', language)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteDebtTarget(debt)}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg"
                                aria-label="Delete record"
                                title={t('হিসাব ডিলিট করুন', 'Delete record', language)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                debt.settled ? 'bg-emerald-500' : isLent ? 'bg-teal-500' : 'bg-amber-500'
                              }`}
                              style={{width: `${pct}%`}}
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                              {t('বাকি', 'Left', language)}:{' '}
                              <strong>{formatConverted(remaining, hideBalance)}</strong> /{' '}
                              {formatConverted(debt.amount, hideBalance)}
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
                                  setPayAmountText(String(convertToDisplay(remaining)));
                                  setSyncWalletOnPay(false);
                                  setPaySyncWalletId(wallets[0]?.id || 'cash');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90"
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

      {/* Add / Edit Wallet Modal */}
      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingWallet
                  ? t('ওয়ালেট সম্পাদনা করুন', 'Edit Wallet', language)
                  : t('নতুন ওয়ালেট যোগ করুন', 'Add New Wallet', language)}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setWalletModalOpen(false);
                  setEditingWallet(null);
                }}
                className="p-1.5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveWalletSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('ওয়ালেটের নাম *', 'Wallet Name *', language)}
                </label>
                <input
                  type="text"
                  value={walletNameInput}
                  onChange={(e) => setWalletNameInput(e.target.value)}
                  placeholder={t('যেমন: নগদ, রকেট, City Bank', 'e.g. Cash, Rocket, City Bank', language)}
                  required
                  autoFocus
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('ধরন', 'Type', language)}
                  </label>
                  <select
                    value={walletTypeInput}
                    onChange={(e) => setWalletTypeInput(e.target.value as WalletAccount['type'])}
                    className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                  >
                    <option value="cash">{t('নগদ (Cash)', 'Cash', language)}</option>
                    <option value="mobile">{t('মোবাইল ব্যাংকিং', 'Mobile Banking', language)}</option>
                    <option value="bank">{t('ব্যাংক', 'Bank', language)}</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t(`শুরুর ব্যালেন্স (${displayCurrency})`, `Opening (${displayCurrency})`, language)}
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="text"
                    value={walletInitialInput}
                    onChange={(e) => setWalletInitialInput(e.target.value)}
                    className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {hasMathOperators(walletInitialInput) && Number.isFinite(walletInitParsed) && (
                    <p className="text-[11px] font-mono font-bold ct-accent-text mt-0.5">
                      = {formatMoney(walletInitParsed, displayCurrency, language)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('কার্ডের রং', 'Color', language)}
                </label>
                <div className="flex items-center gap-2">
                  {WALLET_COLORS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      onClick={() => setWalletColorInput(clr)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        walletColorInput === clr
                          ? 'border-slate-900 dark:border-white scale-110'
                          : 'border-transparent'
                      }`}
                      style={{backgroundColor: clr}}
                      aria-label={`Color ${clr}`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {editingWallet
                  ? t('পরিবর্তন সেভ করুন', 'Save Wallet', language)
                  : t('ওয়ালেট তৈরি করুন', 'Create Wallet', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Wallet Confirmation Modal */}
      {confirmDeleteWallet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('ওয়ালেট ডিলিট করবেন?', 'Delete Wallet?', language)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              "{confirmDeleteWallet.name}" —{' '}
              {t(
                'এই ওয়ালেটটি মুছে যাবে (আগের লেনদেনগুলো রিপোর্টে থাকবে)।',
                'This wallet will be removed (past transactions stay in reports).',
                language
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteWallet(null)}
                className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', language)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteWallet(confirmDeleteWallet.id);
                  setConfirmDeleteWallet(null);
                }}
                className="flex-1 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('ডিলিট করুন', 'Delete', language)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Debt Modal */}
      {debtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md ct-surface-card rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingDebt
                  ? t('বাকি / বকেয়া তথ্য এডিট করুন', 'Edit Debt / Receivable Record', language)
                  : t('নতুন দেনা-পাওনার হিসাব', 'New Lent / Borrowed Record', language)}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDebtModalOpen(false);
                  setEditingDebt(null);
                }}
                className="p-1.5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {debtError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {debtError}
              </div>
            )}

            <form onSubmit={handleDebtFormSubmit} className="space-y-3.5">
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
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {knownPeople.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] text-slate-400">
                      {t('আগের নাম:', 'Known:', language)}
                    </span>
                    {knownPeople.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setPersonName(name)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          personName.trim().toLowerCase() === name.toLowerCase()
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t(`মোট টাকা (${displayCurrency}) *`, `Total (${displayCurrency}) *`, language)}
                    </label>
                    {hasMathOperators(debtAmountText) && Number.isFinite(debtAmountParsed) && debtAmountParsed > 0 && (
                      <span className="text-[10px] font-mono font-bold ct-accent-text">
                        = {formatMoney(debtAmountParsed, displayCurrency, language)}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="text"
                    value={debtAmountText}
                    onChange={(e) => setDebtAmountText(e.target.value)}
                    placeholder="500"
                    required
                    className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {editingDebt ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {t(`পরিশোধিত (${displayCurrency})`, `Paid (${displayCurrency})`, language)}
                      </label>
                      {hasMathOperators(debtPaidText) && Number.isFinite(debtPaidParsed) && debtPaidParsed >= 0 && (
                        <span className="text-[10px] font-mono font-bold ct-accent-text">
                          = {formatMoney(debtPaidParsed, displayCurrency, language)}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="text"
                      value={debtPaidText}
                      onChange={(e) => setDebtPaidText(e.target.value)}
                      placeholder="0"
                      className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                ) : (
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
                )}
              </div>

              {editingDebt && (
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    {Number.isFinite(debtAmountParsed) && Number.isFinite(debtPaidParsed) && debtPaidParsed >= debtAmountParsed && debtAmountParsed > 0
                      ? t('পরিশোধিত (Settled) হিসেবে সেভ হবে', 'Will be marked as Settled', language)
                      : t('চলমান (Pending) হিসেবে সেভ হবে', 'Will remain Pending', language)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDebtPaidText('0')}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                    >
                      {t('শূন্য (Reopen)', 'Reset 0', language)}
                    </button>
                    {Number.isFinite(debtAmountParsed) && debtAmountParsed > 0 && (
                      <button
                        type="button"
                        onClick={() => setDebtPaidText(String(debtAmountParsed))}
                        className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold"
                      >
                        {t('পুরো শোধ', 'Full Paid', language)}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editingDebt && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {t('লেনদেনের তারিখ', 'Date', language)}
                    </label>
                    <input
                      type="date"
                      value={debtDate}
                      onChange={(e) => setDebtDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                )}

                <div className={editingDebt ? '' : 'sm:col-span-2'}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('পরিশোধের সম্ভাব্য তারিখ (ঐচ্ছিক)', 'Due Date (Optional)', language)}
                    </label>
                    {debtDueDate && (
                      <button
                        type="button"
                        onClick={() => setDebtDueDate('')}
                        className="text-[11px] text-rose-600 font-semibold"
                      >
                        {t('মুছুন', 'Clear', language)}
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
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

              {!editingDebt && (
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
              )}

              <button
                type="submit"
                className="w-full py-3 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {editingDebt
                  ? t('পরিবর্তন সেভ করুন', 'Save Changes', language)
                  : t('হিসাব সেভ করুন', 'Save Record', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pay/Settle Debt Modal */}
      {payDebtTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t(`পরিশোধের পরিমাণ (${displayCurrency})`, `Payment Amount (${displayCurrency})`, language)}
                  </label>
                  {hasMathOperators(payAmountText) && Number.isFinite(payAmountParsed) && payAmountParsed > 0 && (
                    <span className="text-[11px] font-mono font-bold ct-accent-text">
                      = {formatMoney(payAmountParsed, displayCurrency, language)}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="text"
                  value={payAmountText}
                  onChange={(e) => setPayAmountText(e.target.value)}
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
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
                    className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none"
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
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('আপডেট করুন', 'Confirm Payment', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Debt Confirmation Modal */}
      {deleteDebtTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('বাকি হিসাব ডিলিট করবেন?', 'Delete Ledger Record?', language)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {deleteDebtTarget.personName} ({formatConverted(deleteDebtTarget.amount)}) —{' '}
              {t('এই রেকর্ডটি স্থায়ীভাবে মুছে ফেলা হবে।', 'This record will be permanently removed.', language)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteDebtTarget(null)}
                className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', language)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDebt(deleteDebtTarget.id);
                  setDeleteDebtTarget(null);
                }}
                className="flex-1 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('ডিলিট করুন', 'Delete', language)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
