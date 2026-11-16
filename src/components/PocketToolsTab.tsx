import React, {useEffect, useMemo, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {
  ArrowLeftRight,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  Lock,
  Percent,
  Pin,
  PinOff,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Share2,
  Smartphone,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {
  convertCurrencyAmount,
  getConversionRate,
  getCurrencyInfo,
  SUPPORTED_CURRENCIES,
} from '../services/currencyService';
import {
  CategoryItem,
  DebtRecord,
  FinancialNote,
  LanguageCode,
  RecurringBill,
  Transaction,
  WalletAccount,
} from '../types';
import {formatMoney, getLocalDateStr, getLocalMonthKey, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

export type PocketToolId =
  | 'converter'
  | 'fees'
  | 'bills'
  | 'split'
  | 'calc'
  | 'receipt'
  | 'notes';

interface PocketToolsTabProps {
  initialTool?: PocketToolId;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  recurringBills: RecurringBill[];
  financialNotes: FinancialNote[];
  totalWalletBalance: number;
  language: LanguageCode;
  hideBalance: boolean;
  onAddExpenseTx: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onSaveRecurringBill: (bill: RecurringBill) => void;
  onDeleteRecurringBill: (billId: string) => void;
  onPayRecurringBill: (bill: RecurringBill, monthKey: string) => void;
  onPushSplitsToDebts: (debts: Array<Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>>) => void;
  onSaveNote: (note: FinancialNote) => void;
  onDeleteNote: (noteId: string) => void;
  onShowToast: (msg: string) => void;
}

interface SplitExpenseRow {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
}

interface BillSplitSaved {
  groupTitle: string;
  members: string[];
  expenses: SplitExpenseRow[];
}

const SPLIT_STORAGE_KEY = 'cashtrace_bill_split_v1';

interface ReceiptItemRow {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

const MFS_PROVIDERS = [
  {id: 'bkash_app', labelBn: 'বিকাশ (প্রিয়/অ্যাপ ১.৪৯%)', labelEn: 'bKash App (1.49%)', rate: 1.49},
  {id: 'bkash_agent', labelBn: 'বিকাশ (এজেন্ট ১.৮৫%)', labelEn: 'bKash Agent (1.85%)', rate: 1.85},
  {id: 'nagad_app', labelBn: 'নগদ (অ্যাপ ১.২৫%)', labelEn: 'Nagad App (1.25%)', rate: 1.25},
  {id: 'nagad_agent', labelBn: 'নগদ (এজেন্ট ১.৫০%)', labelEn: 'Nagad Agent (1.50%)', rate: 1.5},
  {id: 'rocket', labelBn: 'রকেট (১.৬৭%)', labelEn: 'Rocket (1.67%)', rate: 1.67},
  {id: 'upay', labelBn: 'উপায় (১.৪০%)', labelEn: 'Upay (1.40%)', rate: 1.4},
  {id: 'custom', labelBn: 'কাস্টম চার্জ (%)', labelEn: 'Custom Rate (%)', rate: 1.5},
] as const;

export const PocketToolsTab: React.FC<PocketToolsTabProps> = ({
  initialTool = 'converter',
  wallets,
  categories,
  recurringBills,
  financialNotes,
  totalWalletBalance,
  language,
  hideBalance,
  onAddExpenseTx,
  onSaveRecurringBill,
  onDeleteRecurringBill,
  onPayRecurringBill,
  onPushSplitsToDebts,
  onSaveNote,
  onDeleteNote,
  onShowToast,
}) => {
  const {
    baseCurrency,
    displayCurrency,
    baseCode,
    rates,
    ratesUpdatedAt,
    isLiveRate,
    refreshingRates,
    refreshRates,
    convertToDisplay,
    formatConverted,
  } = useCurrency();

  const [activeTool, setActiveTool] = useState<PocketToolId>(initialTool);

  useEffect(() => {
    setActiveTool(initialTool);
  }, [initialTool]);

  // ── 1. Live Currency Converter State ──
  const [fxAmountText, setFxAmountText] = useState('100');
  const [fxFrom, setFxFrom] = useState('USD');
  const [fxTo, setFxTo] = useState('BDT');

  const fxAmountVal = parseLocaleNumber(fxAmountText);
  const safeFxAmount = Number.isFinite(fxAmountVal) && fxAmountVal >= 0 ? fxAmountVal : 0;
  const fxDirectRate = getConversionRate(fxFrom, fxTo, rates);
  const fxResult = convertCurrencyAmount(safeFxAmount, fxFrom, fxTo, rates);
  const fxFromInfo = getCurrencyInfo(fxFrom);
  const fxToInfo = getCurrencyInfo(fxTo);

  const handleLogFxAsExpense = () => {
    const amountInBase = convertCurrencyAmount(safeFxAmount, fxFrom, baseCurrency, rates);
    if (!Number.isFinite(amountInBase) || amountInBase <= 0) {
      onShowToast(t('সঠিক পরিমাণ লিখুন', 'Enter a valid amount', language));
      return;
    }
    const defaultExpCat =
      categories.find((c) => c.type === 'expense')?.name || '💡 অন্যান্য খরচ';
    onAddExpenseTx({
      type: 'expense',
      title: `${fxFromInfo.symbol}${safeFxAmount} ${fxFrom} (${fxToInfo.symbol}${fxResult})`,
      amount: Math.round(amountInBase * 100) / 100,
      category: defaultExpCat,
      subcategory: `FX 1 ${fxFrom} = ${fxDirectRate.toFixed(2)} ${fxTo}`,
      date: getLocalDateStr(),
      walletId: wallets[0]?.id || 'cash',
    });
  };

  // ── 2. MFS Cash-Out Charge Calculator State ──
  const [mfsProviderId, setMfsProviderId] = useState<string>('bkash_app');
  const [mfsCustomRateText, setMfsCustomRateText] = useState('1.85');
  const [mfsMode, setMfsMode] = useState<'forward' | 'reverse'>('forward');
  const [mfsAmountText, setMfsAmountText] = useState('1000');

  const selectedMfs = MFS_PROVIDERS.find((p) => p.id === mfsProviderId) || MFS_PROVIDERS[0];
  const mfsPct =
    mfsProviderId === 'custom'
      ? Math.max(0, parseLocaleNumber(mfsCustomRateText) || 0)
      : selectedMfs.rate;
  const mfsInputVal = Math.max(0, parseLocaleNumber(mfsAmountText) || 0);
  const mfsCharge =
    mfsMode === 'forward'
      ? Math.round(mfsInputVal * (mfsPct / 100) * 100) / 100
      : mfsPct > 0
      ? Math.round((mfsInputVal / (1 - mfsPct / 100) - mfsInputVal) * 100) / 100
      : 0;
  const mfsTotalSendOrDeduct =
    mfsMode === 'forward'
      ? Math.round((mfsInputVal + mfsCharge) * 100) / 100
      : Math.round((mfsInputVal + mfsCharge) * 100) / 100;
  const mfsNetCash = mfsMode === 'forward' ? mfsInputVal : mfsInputVal;

  const handleLogMfsCharge = () => {
    if (mfsCharge <= 0) return;
    const baseFeeAmount = convertCurrencyAmount(mfsCharge, displayCurrency, baseCurrency, rates);
    onAddExpenseTx({
      type: 'expense',
      title: t(
        `${selectedMfs.labelBn.split(' ')[0]} ক্যাশআউট চার্জ`,
        `${selectedMfs.labelEn.split(' ')[0]} Cash-out Fee`,
        language
      ),
      amount: Math.max(0.01, Math.round(baseFeeAmount * 100) / 100),
      category:
        categories.find((c) => c.type === 'expense' && c.name.includes('অন্যান্য'))?.name ||
        categories.find((c) => c.type === 'expense')?.name ||
        '💡 অন্যান্য খরচ',
      subcategory: `${displayCurrency}${mfsInputVal} @ ${mfsPct}%`,
      date: getLocalDateStr(),
      walletId: wallets.find((w) => w.type === 'mobile')?.id || wallets[0]?.id || 'cash',
    });
  };

  // ── 3. Recurring Monthly Bills Tracker State ──
  const currentMonthKey = getLocalMonthKey();
  const todayDayNum = new Date().getDate();
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const [billTitle, setBillTitle] = useState('');
  const [billAmountText, setBillAmountText] = useState('');
  const [billDueDay, setBillDueDay] = useState('5');
  const [billCategory, setBillCategory] = useState(
    categories.find((c) => c.type === 'expense')?.name || '🏠 বাসা ভাড়া ও বিল'
  );
  const [billWalletId, setBillWalletId] = useState(wallets[0]?.id || 'cash');

  const openBillModal = (bill?: RecurringBill) => {
    if (bill) {
      setEditingBill(bill);
      setBillTitle(bill.title);
      setBillAmountText(String(convertToDisplay(bill.amount)));
      setBillDueDay(String(bill.dueDay || 5));
      setBillCategory(bill.category);
      setBillWalletId(bill.walletId || wallets[0]?.id || 'cash');
    } else {
      setEditingBill(null);
      setBillTitle('');
      setBillAmountText('');
      setBillDueDay('5');
      setBillCategory(
        categories.find((c) => c.type === 'expense' && c.name.includes('বিল'))?.name ||
          categories.find((c) => c.type === 'expense')?.name ||
          '🏠 বাসা ভাড়া ও বিল'
      );
      setBillWalletId(wallets[0]?.id || 'cash');
    }
    setBillModalOpen(true);
  };

  const handleBillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = parseLocaleNumber(billAmountText);
    const due = Math.min(31, Math.max(1, Math.round(Number(billDueDay) || 1)));
    if (!billTitle.trim() || isNaN(entered) || entered <= 0) return;

    const amountBase = convertCurrencyAmount(entered, displayCurrency, baseCurrency, rates);
    const saved: RecurringBill = editingBill
      ? {
          ...editingBill,
          title: billTitle.trim(),
          amount: Math.max(0.01, Math.round(amountBase * 100) / 100),
          category: billCategory,
          walletId: billWalletId,
          dueDay: due,
        }
      : {
          id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          title: billTitle.trim(),
          amount: Math.max(0.01, Math.round(amountBase * 100) / 100),
          category: billCategory,
          walletId: billWalletId,
          dueDay: due,
          paidMonths: [],
          createdAt: Date.now(),
        };

    onSaveRecurringBill(saved);
    setBillModalOpen(false);
    setEditingBill(null);
  };

  const totalBillsBase = recurringBills.reduce((s, b) => s + b.amount, 0);
  const unpaidBillsBase = recurringBills
    .filter((b) => !b.paidMonths.includes(currentMonthKey))
    .reduce((s, b) => s + b.amount, 0);

  // ── 4. Group / Mess Bill Splitter State ──
  const [splitData, setSplitData] = useState<BillSplitSaved>(() => {
    try {
      const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BillSplitSaved;
        if (Array.isArray(parsed.members) && Array.isArray(parsed.expenses)) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      groupTitle: language === 'bn' ? 'গ্রুপ ট্যুর / মেস হিসাব' : 'Group Trip / Mess Split',
      members: ['আমি', 'রাফি', 'সাকিব'],
      expenses: [],
    };
  });
  const [newMemberName, setNewMemberName] = useState('');
  const [splitExpTitle, setSplitExpTitle] = useState('');
  const [splitExpAmountText, setSplitExpAmountText] = useState('');
  const [splitExpPaidBy, setSplitExpPaidBy] = useState(splitData.members[0] || 'আমি');

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(splitData));
    } catch {
      // Ignore quota errors
    }
  }, [splitData]);

  useEffect(() => {
    if (!splitData.members.includes(splitExpPaidBy) && splitData.members.length > 0) {
      setSplitExpPaidBy(splitData.members[0]);
    }
  }, [splitData.members, splitExpPaidBy]);

  const splitSummary = useMemo(() => {
    const members = splitData.members;
    const total = splitData.expenses.reduce((s, e) => s + e.amount, 0);
    const perPerson = members.length > 0 ? total / members.length : 0;

    const paidMap = new Map<string, number>();
    members.forEach((m) => paidMap.set(m, 0));
    splitData.expenses.forEach((e) => {
      paidMap.set(e.paidBy, (paidMap.get(e.paidBy) || 0) + e.amount);
    });

    const balances = members.map((m) => ({
      name: m,
      paid: paidMap.get(m) || 0,
      net: (paidMap.get(m) || 0) - perPerson,
    }));

    // Greedy settlement solver
    const debtors = balances
      .filter((b) => b.net < -0.5)
      .map((b) => ({name: b.name, rem: -b.net}))
      .sort((a, b) => b.rem - a.rem);
    const creditors = balances
      .filter((b) => b.net > 0.5)
      .map((b) => ({name: b.name, rem: b.net}))
      .sort((a, b) => b.rem - a.rem);

    const settlements: Array<{from: string; to: string; amount: number}> = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const give = Math.min(debtors[i].rem, creditors[j].rem);
      if (give > 0.5) {
        settlements.push({
          from: debtors[i].name,
          to: creditors[j].name,
          amount: Math.round(give * 100) / 100,
        });
      }
      debtors[i].rem -= give;
      creditors[j].rem -= give;
      if (debtors[i].rem <= 0.5) i += 1;
      if (creditors[j].rem <= 0.5) j += 1;
    }

    return {total, perPerson, balances, settlements};
  }, [splitData]);

  const handleAddSplitMember = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newMemberName.trim();
    if (!clean || splitData.members.includes(clean)) return;
    setSplitData((prev) => ({...prev, members: [...prev.members, clean]}));
    setNewMemberName('');
  };

  const handleAddSplitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseLocaleNumber(splitExpAmountText);
    if (!splitExpTitle.trim() || isNaN(amt) || amt <= 0 || !splitExpPaidBy) return;
    setSplitData((prev) => ({
      ...prev,
      expenses: [
        {
          id: `sp_${Date.now()}`,
          title: splitExpTitle.trim(),
          amount: amt,
          paidBy: splitExpPaidBy,
        },
        ...prev.expenses,
      ],
    }));
    setSplitExpTitle('');
    setSplitExpAmountText('');
  };

  const handleShareSplit = async () => {
    const lines = [
      `🧾 ${splitData.groupTitle}`,
      `${t('মোট খরচ', 'Total', language)}: ${displayCurrency}${splitSummary.total.toFixed(0)}`,
      `${t('জনপ্রতি ভাগ', 'Per Person', language)}: ${displayCurrency}${splitSummary.perPerson.toFixed(0)}`,
      '',
      ...splitSummary.settlements.map(
        (s) => `• ${s.from} ➔ ${s.to}: ${displayCurrency}${s.amount.toFixed(0)}`
      ),
    ];
    const text = lines.join('\n');
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({title: splitData.groupTitle, text});
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onShowToast(t('বিল স্প্লিট সারাংশ কপি হয়েছে!', 'Split summary copied!', language));
      }
    } catch {
      onShowToast(t('শেয়ার করতে সমস্যা হয়েছে', 'Failed to share summary', language));
    }
  };

  const handlePushSplitsToLedger = () => {
    if (splitSummary.settlements.length === 0) return;
    const today = getLocalDateStr();
    const myName = splitData.members[0] || 'আমি';
    const records: Array<Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>> = splitSummary.settlements.map((s) => {
      const iAmCreditor = s.to === myName;
      const baseAmt = convertCurrencyAmount(s.amount, displayCurrency, baseCurrency, rates);
      return {
        personName: iAmCreditor ? s.from : s.to === myName ? s.from : `${s.from} → ${s.to}`,
        type: iAmCreditor ? 'lent' : s.from === myName ? 'borrowed' : 'lent',
        amount: Math.max(0.01, Math.round(baseAmt * 100) / 100),
        date: today,
        note: `${splitData.groupTitle} (${s.from} → ${s.to})`,
      };
    });
    onPushSplitsToDebts(records);
  };

  // ── 5. Financial Calculator Suite State ──
  const [calcMode, setCalcMode] = useState<'emi' | 'dps' | 'discount' | 'zakat'>('emi');
  // EMI
  const [emiPrincipalText, setEmiPrincipalText] = useState('100000');
  const [emiRateText, setEmiRateText] = useState('10');
  const [emiMonthsText, setEmiMonthsText] = useState('12');
  // DPS
  const [dpsMonthlyText, setDpsMonthlyText] = useState('5000');
  const [dpsRateText, setDpsRateText] = useState('8.5');
  const [dpsMonthsText, setDpsMonthsText] = useState('60');
  // Discount + VAT
  const [discPriceText, setDiscPriceText] = useState('2000');
  const [discPctText, setDiscPctText] = useState('15');
  const [vatPctText, setVatPctText] = useState('5');
  // Zakat
  const [zakatCashText, setZakatCashText] = useState('0');
  const [zakatGoldText, setZakatGoldText] = useState('0');
  const [zakatInvestText, setZakatInvestText] = useState('0');
  const [zakatDebtText, setZakatDebtText] = useState('0');
  const [zakatNisabText, setZakatNisabText] = useState('135000');

  const emiP = Math.max(0, parseLocaleNumber(emiPrincipalText) || 0);
  const emiR = Math.max(0, parseLocaleNumber(emiRateText) || 0) / 12 / 100;
  const emiN = Math.max(1, Math.round(parseLocaleNumber(emiMonthsText) || 1));
  const emiMonthly =
    emiR === 0
      ? emiP / emiN
      : (emiP * emiR * Math.pow(1 + emiR, emiN)) / (Math.pow(1 + emiR, emiN) - 1);
  const emiTotalPay = emiMonthly * emiN;
  const emiTotalInt = Math.max(0, emiTotalPay - emiP);

  const dpsM = Math.max(0, parseLocaleNumber(dpsMonthlyText) || 0);
  const dpsRate = Math.max(0, parseLocaleNumber(dpsRateText) || 0) / 12 / 100;
  const dpsMonths = Math.max(1, Math.round(parseLocaleNumber(dpsMonthsText) || 1));
  const dpsDeposited = dpsM * dpsMonths;
  const dpsMaturity =
    dpsRate === 0
      ? dpsDeposited
      : dpsM * ((Math.pow(1 + dpsRate, dpsMonths) - 1) / dpsRate) * (1 + dpsRate);
  const dpsProfit = Math.max(0, dpsMaturity - dpsDeposited);

  const origPrice = Math.max(0, parseLocaleNumber(discPriceText) || 0);
  const discPct = Math.max(0, parseLocaleNumber(discPctText) || 0);
  const vatPct = Math.max(0, parseLocaleNumber(vatPctText) || 0);
  const savedAmt = origPrice * (discPct / 100);
  const afterDisc = Math.max(0, origPrice - savedAmt);
  const vatAmt = afterDisc * (vatPct / 100);
  const finalPayable = afterDisc + vatAmt;

  const zakatNetWealth = Math.max(
    0,
    (parseLocaleNumber(zakatCashText) || 0) +
      (parseLocaleNumber(zakatGoldText) || 0) +
      (parseLocaleNumber(zakatInvestText) || 0) -
      (parseLocaleNumber(zakatDebtText) || 0)
  );
  const zakatNisab = Math.max(0, parseLocaleNumber(zakatNisabText) || 0);
  const zakatDue = zakatNetWealth >= zakatNisab ? zakatNetWealth * 0.025 : 0;

  // ── 6. Quick Customer Receipt / Invoice Maker ──
  const [rcShop, setRcShop] = useState('CashTrace স্টোর');
  const [rcCustomer, setRcCustomer] = useState('');
  const [rcItems, setRcItems] = useState<ReceiptItemRow[]>([
    {id: 'r1', name: 'পণ্য / সার্ভিস', qty: 1, unitPrice: 500},
  ]);
  const [rcDiscountText, setRcDiscountText] = useState('0');
  const [rcNote, setRcNote] = useState('');

  const rcSubtotal = rcItems.reduce((s, r) => s + r.qty * r.unitPrice, 0);
  const rcDiscount = Math.max(0, parseLocaleNumber(rcDiscountText) || 0);
  const rcGrandTotal = Math.max(0, rcSubtotal - rcDiscount);

  const handleShareReceipt = async () => {
    const lines = [
      `🧾 ${rcShop || 'CashTrace Receipt'}`,
      `${t('তারিখ', 'Date', language)}: ${getLocalDateStr()}`,
      rcCustomer ? `${t('ক্রেতা', 'Customer', language)}: ${rcCustomer}` : '',
      '────────────────────',
      ...rcItems.map(
        (it) =>
          `${it.name} (${it.qty} × ${displayCurrency}${it.unitPrice}) = ${displayCurrency}${(it.qty * it.unitPrice).toFixed(0)}`
      ),
      '────────────────────',
      rcDiscount > 0 ? `${t('ছাড়', 'Discount', language)}: -${displayCurrency}${rcDiscount}` : '',
      `${t('মোট বিল', 'Grand Total', language)}: ${displayCurrency}${rcGrandTotal.toFixed(0)}`,
      rcNote ? `${t('নোট', 'Note', language)}: ${rcNote}` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({title: rcShop || 'Receipt', text});
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onShowToast(t('রসিদ কপি হয়েছে!', 'Receipt copied to clipboard!', language));
      }
    } catch {
      onShowToast(t('শেয়ার করতে সমস্যা হয়েছে', 'Share failed', language));
    }
  };

  // ── 7. Financial Quick Notes Vault ──
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<FinancialNote | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');

  const sortedNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    return [...financialNotes]
      .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [financialNotes, noteSearch]);

  const openNoteEditor = (note?: FinancialNote) => {
    if (note) {
      setEditingNote(note);
      setNoteTitle(note.title);
      setNoteBody(note.body);
      setNotePinned(note.pinned);
    } else {
      setEditingNote(null);
      setNoteTitle('');
      setNoteBody('');
      setNotePinned(false);
    }
    setNoteModalOpen(true);
  };

  const handleSaveNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    onSaveNote({
      id: editingNote?.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: noteTitle.trim(),
      body: noteBody.trim(),
      pinned: notePinned,
      updatedAt: Date.now(),
    });
    setNoteModalOpen(false);
    setEditingNote(null);
  };

  const toolTabs: Array<{id: PocketToolId; bn: string; en: string; icon: React.ReactNode}> = [
    {id: 'converter', bn: 'কারেন্সি কনভার্টার', en: 'FX Converter', icon: <ArrowLeftRight className="w-4 h-4" />},
    {id: 'fees', bn: 'ক্যাশআউট চার্জ', en: 'MFS Fees', icon: <Smartphone className="w-4 h-4" />},
    {id: 'bills', bn: 'মাসিক বিল ট্র্যাকার', en: 'Monthly Bills', icon: <CalendarClock className="w-4 h-4" />},
    {id: 'split', bn: 'ট্যুর ও মেস স্প্লিট', en: 'Bill Split', icon: <Users className="w-4 h-4" />},
    {id: 'calc', bn: 'আর্থিক ক্যালকুলেটর', en: 'Calculators', icon: <Calculator className="w-4 h-4" />},
    {id: 'receipt', bn: 'কুইক রসিদ মেকার', en: 'Receipt Maker', icon: <Receipt className="w-4 h-4" />},
    {id: 'notes', bn: 'নোটস ভল্ট', en: 'Notes Vault', icon: <StickyNote className="w-4 h-4" />},
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Sub-navigation Strip */}
      <div className="ct-surface-card border p-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {toolTabs.map((tab) => {
            const active = activeTool === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTool(tab.id)}
                className={`px-3.5 py-2 ct-btn-radius text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap min-h-[40px] ${
                  active
                    ? 'ct-accent-bg shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                {tab.icon}
                <span>{language === 'bn' ? tab.bn : tab.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. LIVE CURRENCY CONVERTER */}
      {activeTool === 'converter' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('লাইভ কারেন্সি কনভার্টার', 'Live Currency Converter', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isLiveRate
                  ? t(
                      `লাইভ রেট আপডেটেড: ${new Date(ratesUpdatedAt).toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US')}`,
                      `Live rate synced: ${new Date(ratesUpdatedAt).toLocaleTimeString('en-US')}`,
                      language
                    )
                  : t('অফলাইন স্ট্যান্ডার্ড রেট চালু আছে (ইন্টারনেট পেলে আপডেট হবে)', 'Using offline fallback rates', language)}
              </p>
            </div>
            <button
              type="button"
              disabled={refreshingRates}
              onClick={() => void refreshRates()}
              className="px-3.5 py-2 ct-btn-radius ct-surface-alt border text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingRates ? 'animate-spin' : ''}`} />
              <span>{t('রেট রিফ্রেশ', 'Refresh Rates', language)}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 space-y-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t('পরিমাণ', 'Amount', language)}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={fxAmountText}
                onChange={(e) => setFxAmountText(e.target.value)}
                placeholder="100"
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-base font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t('হতে (From)', 'From', language)}
              </label>
              <select
                value={fxFrom}
                onChange={(e) => setFxFrom(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setFxFrom(fxTo);
                  setFxTo(fxFrom);
                }}
                className="min-h-[44px] min-w-[44px] ct-btn-radius ct-surface-alt border flex items-center justify-center ct-accent-text hover:opacity-80"
                aria-label="Swap currencies"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            <div className="md:col-span-4 space-y-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t('রূপান্তর (To)', 'To', language)}
              </label>
              <select
                value={fxTo}
                onChange={(e) => setFxTo(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 sm:p-5 ct-btn-radius ct-accent-soft border border-[var(--ct-accent-ring)] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {fxFromInfo.flag} {safeFxAmount.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')} {fxFrom} =
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fxToInfo.flag} {formatMoney(fxResult, fxToInfo.symbol, language)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                1 {fxFrom} = {fxDirectRate.toFixed(4)} {fxTo}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogFxAsExpense}
              className="px-4 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[42px]"
            >
              <Plus className="w-4 h-4" />
              <span>{t(`খরচ হিসেবে যোগ (${baseCode})`, `Log Expense (${baseCode})`, language)}</span>
            </button>
          </div>

          {/* 12-Currency Quick Compare Grid */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {t(`${safeFxAmount} ${fxFrom}-এর সমমান অন্যান্য মুদ্রায়`, `${safeFxAmount} ${fxFrom} across world currencies`, language)}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {SUPPORTED_CURRENCIES.filter((c) => c.code !== fxFrom).map((c) => {
                const val = convertCurrencyAmount(safeFxAmount, fxFrom, c.code, rates);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setFxTo(c.code)}
                    className={`p-3 ct-btn-radius border text-left transition-colors ${
                      fxTo === c.code
                        ? 'ct-accent-border bg-[var(--ct-accent-soft)]'
                        : 'ct-surface-alt hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{c.flag} {c.code}</span>
                      <span>{c.symbol}</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                      {formatMoney(val, c.symbol, language)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. MOBILE BANKING CASH-OUT CHARGE CALCULATOR */}
      {activeTool === 'fees' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('মোবাইল ব্যাংকিং ক্যাশআউট চার্জ ক্যালকুলেটর', 'Mobile Banking Cash-Out Calculator', language)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('বিকাশ, নগদ, রকেট বা উপায়ে টাকা তুলতে কত চার্জ কাটবে তা আগে থেকেই হিসাব করুন', 'Calculate exact bKash, Nagad, Rocket & Upay cash-out fees', language)}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t('মাধ্যম ও রেট', 'Provider & Rate', language)}
              </label>
              <select
                value={mfsProviderId}
                onChange={(e) => setMfsProviderId(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none"
              >
                {MFS_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {language === 'bn' ? p.labelBn : p.labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t('হিসাবের ধরন', 'Calculation Mode', language)}
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 ct-surface-alt border ct-btn-radius">
                <button
                  type="button"
                  onClick={() => setMfsMode('forward')}
                  className={`py-1.5 rounded-md text-xs font-bold ${
                    mfsMode === 'forward' ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {t('কত তুলবেন', 'Cash Out Amt', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setMfsMode('reverse')}
                  className={`py-1.5 rounded-md text-xs font-bold ${
                    mfsMode === 'reverse' ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {t('হাতে নিট চাই', 'Need Net Cash', language)}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {mfsMode === 'forward'
                  ? t(`কত টাকা ক্যাশআউট করবেন (${displayCurrency})`, `Withdraw Amount (${displayCurrency})`, language)
                  : t(`হাতে নিট কত টাকা পেতে চান (${displayCurrency})`, `Net Cash Needed (${displayCurrency})`, language)}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={mfsAmountText}
                onChange={(e) => setMfsAmountText(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-base font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
            </div>

            {mfsProviderId === 'custom' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('কাস্টম চার্জ (%)', 'Custom Rate (%)', language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={mfsCustomRateText}
                  onChange={(e) => setMfsCustomRateText(e.target.value)}
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-base font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 ct-surface-alt border ct-btn-radius space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t(`ক্যাশআউট চার্জ (${mfsPct}%)`, `Fee (${mfsPct}%)`, language)}
              </span>
              <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {formatMoney(mfsCharge, displayCurrency, language)}
              </p>
            </div>
            <div className="p-4 ct-surface-alt border ct-btn-radius space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('মোট ব্যালেন্স লাগবে', 'Total Deducted', language)}
              </span>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMoney(mfsTotalSendOrDeduct, displayCurrency, language)}
              </p>
            </div>
            <div className="p-4 ct-surface-alt border ct-btn-radius space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('হাতে নগদ পাবেন', 'Net Cash Received', language)}
              </span>
              <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(mfsNetCash, displayCurrency, language)}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={mfsCharge <= 0}
              onClick={handleLogMfsCharge}
              className="px-4 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[42px] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{t('শুধু চার্জ খরচ হিসেবে যোগ করুন', 'Log Fee as Expense', language)}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. MONTHLY BILLS & SUBSCRIPTIONS TRACKER */}
      {activeTool === 'bills' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('মাসিক বিল ও সাবস্ক্রিপশন ট্র্যাকার', 'Monthly Bills & Subscriptions', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('মোট মাসিক বিল', 'Total Monthly', language)}:{' '}
                <strong className="text-slate-900 dark:text-white tabular-nums">
                  {formatConverted(totalBillsBase, hideBalance)}
                </strong>{' '}
                · {t('এই মাসে বাকি', 'Unpaid Now', language)}:{' '}
                <strong className="text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatConverted(unpaidBillsBase, hideBalance)}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBillModal()}
              className="px-3.5 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>{t('নতুন বিল যোগ', 'Add Bill', language)}</span>
            </button>
          </div>

          {recurringBills.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <CalendarClock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('বাসা ভাড়া, ওয়াইফাই, বিদ্যুৎ বা গ্যাস বিল যোগ করলে প্রতি মাসে ১ ট্যাপে পরিশোধ করতে পারবেন।', 'Add rent, Wi-Fi, electricity, or subscriptions for 1-tap monthly payment.', language)}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {recurringBills.map((bill) => {
                const isPaid = bill.paidMonths.includes(currentMonthKey);
                const isDueSoon = !isPaid && todayDayNum >= bill.dueDay - 3;
                const walletName = wallets.find((w) => w.id === bill.walletId)?.name || 'Cash';
                return (
                  <div
                    key={bill.id}
                    className={`p-4 ct-btn-radius border space-y-3 ${
                      isPaid
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50'
                        : isDueSoon
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/70'
                        : 'ct-surface-alt'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {bill.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t(`প্রতি মাসের ${bill.dueDay} তারিখ`, `Due day ${bill.dueDay}`, language)} · {walletName}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openBillModal(bill)}
                          className="p-1.5 text-slate-400 hover:ct-accent-text rounded-lg"
                          aria-label="Edit bill"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecurringBill(bill.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          aria-label="Delete bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatConverted(bill.amount, hideBalance)}
                      </span>
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          {t('এই মাসে পরিশোধিত', 'Paid this month', language)}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPayRecurringBill(bill, currentMonthKey)}
                          className="px-3 py-2 ct-btn-radius ct-accent-bg text-xs font-bold min-h-[38px]"
                        >
                          {t('পরিশোধ ও খরচ লগ', 'Pay & Log Expense', language)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. GROUP / TOUR & MESS BILL SPLITTER */}
      {activeTool === 'split' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={splitData.groupTitle}
                onChange={(e) => setSplitData((p) => ({...p, groupTitle: e.target.value}))}
                className="text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 outline-none w-full sm:w-auto pb-0.5"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('মোট খরচ', 'Total', language)}:{' '}
                <strong className="tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(splitSummary.total, displayCurrency, language)}
                </strong>{' '}
                · {t('জনপ্রতি', 'Per person', language)}:{' '}
                <strong className="tabular-nums ct-accent-text">
                  {formatMoney(splitSummary.perPerson, displayCurrency, language)}
                </strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {splitSummary.settlements.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleShareSplit}
                    className="px-3 py-2 ct-btn-radius ct-surface-alt border text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{t('শেয়ার / কপি', 'Share', language)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePushSplitsToLedger}
                    className="px-3 py-2 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('বাকি খাতায় পাঠান', 'Add to Debts', language)}</span>
                  </button>
                </>
              )}
              {splitData.expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSplitData((p) => ({...p, expenses: []}))}
                  className="px-2.5 py-2 ct-btn-radius text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  {t('খরচ রিসেট', 'Reset', language)}
                </button>
              )}
            </div>
          </div>

          {/* Members Row */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              {t('সদস্যবৃন্দ', 'Members', language)} ({splitData.members.length})
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {splitData.members.map((m) => (
                <div
                  key={m}
                  className="px-3 py-1.5 ct-btn-radius ct-surface-alt border text-xs font-semibold inline-flex items-center gap-2"
                >
                  <span>{m}</span>
                  {splitData.members.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSplitData((p) => ({
                          ...p,
                          members: p.members.filter((x) => x !== m),
                        }))
                      }
                      className="text-slate-400 hover:text-rose-500"
                      aria-label={`Remove ${m}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <form onSubmit={handleAddSplitMember} className="inline-flex items-center gap-1.5">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder={t('নতুন সদস্য...', 'Add member...', language)}
                  className="ct-surface-alt border ct-btn-radius px-2.5 py-1.5 text-xs outline-none w-32"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 ct-btn-radius ct-accent-bg text-xs font-bold"
                >
                  +
                </button>
              </form>
            </div>
          </div>

          {/* Add Expense Row */}
          <form onSubmit={handleAddSplitExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              value={splitExpTitle}
              onChange={(e) => setSplitExpTitle(e.target.value)}
              placeholder={t('খরচের নাম (যেমন: হোটেল, নাস্তা)', 'Expense item (e.g. Hotel, Dinner)', language)}
              required
              className="sm:col-span-5 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs text-slate-900 dark:text-white outline-none"
            />
            <input
              type="text"
              inputMode="decimal"
              value={splitExpAmountText}
              onChange={(e) => setSplitExpAmountText(e.target.value)}
              placeholder={t(`টাকা (${displayCurrency})`, `Amount (${displayCurrency})`, language)}
              required
              className="sm:col-span-3 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
            />
            <select
              value={splitExpPaidBy}
              onChange={(e) => setSplitExpPaidBy(e.target.value)}
              className="sm:col-span-2 ct-surface-alt border ct-btn-radius px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none"
            >
              {splitData.members.map((m) => (
                <option key={m} value={m}>
                  {t(`${m} দিয়েছে`, `Paid: ${m}`, language)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="sm:col-span-2 py-2 ct-btn-radius ct-accent-bg text-xs font-bold min-h-[38px]"
            >
              {t('যোগ করুন', 'Add', language)}
            </button>
          </form>

          {/* Settlements Result + Expense List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 ct-surface-alt border ct-btn-radius space-y-2.5">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('কে কাকে কত টাকা দেবে (চূড়ান্ত হিসাব)', 'Minimal Settlements', language)}
              </h3>
              {splitSummary.settlements.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  {t('খরচ যোগ করলে কে কাকে কত দেবে তা স্বয়ংক্রিয়ভাবে হিসাব হবে।', 'Add shared expenses to see who owes whom.', language)}
                </p>
              ) : (
                <div className="space-y-2">
                  {splitSummary.settlements.map((s, idx) => (
                    <div
                      key={`${s.from}-${s.to}-${idx}`}
                      className="p-2.5 ct-surface-card border ct-btn-radius flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {s.from} ➔ {s.to}
                      </span>
                      <strong className="tabular-nums ct-accent-text">
                        {formatMoney(s.amount, displayCurrency, language)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 ct-surface-alt border ct-btn-radius space-y-2.5 max-h-64 overflow-y-auto">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('যুক্ত খরচের তালিকা', 'Expense Log', language)} ({splitData.expenses.length})
              </h3>
              {splitData.expenses.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  {t('এখনো কোনো খরচ যোগ হয়নি।', 'No expenses added yet.', language)}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {splitData.expenses.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-2 ct-surface-card border ct-btn-radius flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{ex.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t(`দিয়েছে: ${ex.paidBy}`, `Paid by ${ex.paidBy}`, language)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold tabular-nums">
                          {formatMoney(ex.amount, displayCurrency, language)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitData((p) => ({
                              ...p,
                              expenses: p.expenses.filter((x) => x.id !== ex.id),
                            }))
                          }
                          className="text-slate-400 hover:text-rose-500"
                          aria-label="Delete split expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. FINANCIAL CALCULATOR SUITE */}
      {activeTool === 'calc' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('স্মার্ট ফিন্যান্সিয়াল ক্যালকুলেটর', 'Financial Calculator Suite', language)}
            </h2>
            <div className="flex items-center gap-1 p-1 ct-surface-alt border ct-btn-radius overflow-x-auto">
              {(
                [
                  {id: 'emi', bn: 'লোন EMI', en: 'Loan EMI'},
                  {id: 'dps', bn: 'DPS সঞ্চয়', en: 'DPS Growth'},
                  {id: 'discount', bn: 'ছাড় ও VAT', en: 'Discount/VAT'},
                  {id: 'zakat', bn: 'যাকাত', en: 'Zakat'},
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCalcMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                    calcMode === m.id
                      ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {language === 'bn' ? m.bn : m.en}
                </button>
              ))}
            </div>
          </div>

          {calcMode === 'emi' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t(`লোনের পরিমাণ (${displayCurrency})`, `Loan Amount (${displayCurrency})`, language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={emiPrincipalText}
                    onChange={(e) => setEmiPrincipalText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('বার্ষিক সুদ/মুনাফা (%)', 'Annual Interest (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={emiRateText}
                    onChange={(e) => setEmiRateText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('মেয়াদ (মাস)', 'Tenure (Months)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={emiMonthsText}
                    onChange={(e) => setEmiMonthsText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 ct-accent-soft ct-btn-radius border border-[var(--ct-accent-ring)]">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t('মাসিক কিস্তি (EMI)', 'Monthly EMI', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(emiMonthly, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('মোট সুদ', 'Total Interest', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-rose-600 mt-1">
                    {formatMoney(emiTotalInt, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('মোট পরিশোধ', 'Total Payment', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(emiTotalPay, displayCurrency, language)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {calcMode === 'dps' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t(`মাসিক জমা (${displayCurrency})`, `Monthly Deposit (${displayCurrency})`, language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dpsMonthlyText}
                    onChange={(e) => setDpsMonthlyText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('বার্ষিক মুনাফা (%)', 'Annual Profit (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dpsRateText}
                    onChange={(e) => setDpsRateText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('সময়কাল (মাস)', 'Duration (Months)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={dpsMonthsText}
                    onChange={(e) => setDpsMonthsText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 ct-accent-soft ct-btn-radius border border-[var(--ct-accent-ring)]">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t('মেয়াদ শেষে পাবেন', 'Maturity Value', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(dpsMaturity, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('মোট আসল জমা', 'Total Deposited', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(dpsDeposited, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('মোট মুনাফা লাভ', 'Estimated Profit', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-emerald-600 mt-1">
                    +{formatMoney(dpsProfit, displayCurrency, language)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {calcMode === 'discount' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t(`পণ্যের দাম (${displayCurrency})`, `Original Price (${displayCurrency})`, language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discPriceText}
                    onChange={(e) => setDiscPriceText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('ডিসকাউন্ট (%)', 'Discount (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discPctText}
                    onChange={(e) => setDiscPctText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {t('ভ্যাট / ট্যাক্স (%)', 'VAT / Tax (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vatPctText}
                    onChange={(e) => setVatPctText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-mono font-bold outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 ct-accent-soft ct-btn-radius border border-[var(--ct-accent-ring)]">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t('সর্বমোট বিল', 'Final Payable', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(finalPayable, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('ছাড়ে সাশ্রয়', 'Discount Saved', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-emerald-600 mt-1">
                    {formatMoney(savedAmt, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('ভ্যাট যোগ', 'VAT Added', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-amber-600 mt-1">
                    {formatMoney(vatAmt, displayCurrency, language)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {calcMode === 'zakat' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('১ বছর স্থিতিশীল সম্পদ নিসাব সীমার বেশি হলে ২.৫% যাকাত প্রযোজ্য', '2.5% Zakat applies when net zakatable wealth meets Nisab', language)}
                </p>
                <button
                  type="button"
                  onClick={() => setZakatCashText(String(Math.max(0, Math.round(convertToDisplay(totalWalletBalance)))))}
                  className="px-3 py-1.5 ct-btn-radius ct-accent-soft text-xs font-bold inline-flex items-center gap-1"
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>{t('ওয়ালেট ব্যালেন্স আনুন', 'Import Wallet Cash', language)}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('নগদ ও ব্যাংক', 'Cash & Bank', language)}</label>
                  <input type="text" inputMode="decimal" value={zakatCashText} onChange={(e) => setZakatCashText(e.target.value)} className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('স্বর্ণ / রুপা মূল্য', 'Gold & Silver', language)}</label>
                  <input type="text" inputMode="decimal" value={zakatGoldText} onChange={(e) => setZakatGoldText(e.target.value)} className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('বিনিয়োগ / পণ্য', 'Investments', language)}</label>
                  <input type="text" inputMode="decimal" value={zakatInvestText} onChange={(e) => setZakatInvestText(e.target.value)} className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('দেনা (-) বাদ', 'Debts (-)', language)}</label>
                  <input type="text" inputMode="decimal" value={zakatDebtText} onChange={(e) => setZakatDebtText(e.target.value)} className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('নিসাব সীমা', 'Nisab Limit', language)}</label>
                  <input type="text" inputMode="decimal" value={zakatNisabText} onChange={(e) => setZakatNisabText(e.target.value)} className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 ct-surface-alt ct-btn-radius border">
                  <span className="text-xs text-slate-500">{t('যাকাতযোগ্য নিট সম্পদ', 'Net Zakatable Wealth', language)}</span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(zakatNetWealth, displayCurrency, language)}
                  </p>
                </div>
                <div className="p-4 ct-accent-soft ct-btn-radius border border-[var(--ct-accent-ring)]">
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {zakatNetWealth >= zakatNisab
                      ? t('প্রদেয় যাকাত (২.৫%)', 'Zakat Due (2.5%)', language)
                      : t('নিসাব সীমার নিচে (যাকাত ফরজ নয়)', 'Below Nisab Threshold', language)}
                  </span>
                  <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {formatMoney(zakatDue, displayCurrency, language)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. QUICK RECEIPT / INVOICE MAKER */}
      {activeTool === 'receipt' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('কুইক কাস্টমার রসিদ / ইনভয়েস', 'Quick Customer Receipt Maker', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('দোকান, ফ্রিল্যান্সিং বা সার্ভিসের জন্য মুহূর্তেই রসিদ তৈরি ও শেয়ার করুন', 'Create clean receipts & share or print instantly', language)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShareReceipt}
                className="px-3 py-2 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('কপি / শেয়ার', 'Copy / Share', language)}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 ct-btn-radius ct-surface-alt border text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px]"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('প্রিন্ট', 'Print', language)}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Builder side */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={rcShop}
                  onChange={(e) => setRcShop(e.target.value)}
                  placeholder={t('প্রতিষ্ঠানের নাম', 'Business Name', language)}
                  className="ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-semibold outline-none"
                />
                <input
                  type="text"
                  value={rcCustomer}
                  onChange={(e) => setRcCustomer(e.target.value)}
                  placeholder={t('ক্রেতার নাম (ঐচ্ছিক)', 'Customer Name', language)}
                  className="ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="space-y-2">
                {rcItems.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) =>
                        setRcItems((p) =>
                          p.map((x) => (x.id === row.id ? {...x, name: e.target.value} : x))
                        )
                      }
                      placeholder={t('পণ্য', 'Item', language)}
                      className="col-span-5 ct-surface-alt border ct-btn-radius px-2.5 py-2 text-xs outline-none"
                    />
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) =>
                        setRcItems((p) =>
                          p.map((x) => (x.id === row.id ? {...x, qty: Math.max(1, Number(e.target.value) || 1)} : x))
                        )
                      }
                      className="col-span-2 ct-surface-alt border ct-btn-radius px-2 py-2 text-xs font-mono font-bold outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.unitPrice}
                      onChange={(e) =>
                        setRcItems((p) =>
                          p.map((x) => (x.id === row.id ? {...x, unitPrice: Math.max(0, Number(e.target.value) || 0)} : x))
                        )
                      }
                      className="col-span-4 ct-surface-alt border ct-btn-radius px-2.5 py-2 text-xs font-mono font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => rcItems.length > 1 && setRcItems((p) => p.filter((x) => x.id !== row.id))}
                      className="col-span-1 text-slate-400 hover:text-rose-500 flex justify-center"
                      aria-label="Remove item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setRcItems((p) => [
                      ...p,
                      {id: `r_${Date.now()}`, name: t('নতুন আইটেম', 'New Item', language), qty: 1, unitPrice: 100},
                    ])
                  }
                  className="text-xs font-bold ct-accent-text hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('আরো লাইন যোগ', 'Add Line Item', language)}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={rcDiscountText}
                  onChange={(e) => setRcDiscountText(e.target.value)}
                  placeholder={t(`ছাড় (${displayCurrency})`, `Discount (${displayCurrency})`, language)}
                  className="ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none"
                />
                <input
                  type="text"
                  value={rcNote}
                  onChange={(e) => setRcNote(e.target.value)}
                  placeholder={t('নোট (যেমন: পরিশোধিত)', 'Note (e.g. Paid)', language)}
                  className="ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
              </div>
            </div>

            {/* Live Receipt Preview */}
            <div className="p-5 ct-surface-alt border-2 border-dashed ct-btn-radius space-y-3 font-sans">
              <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-2.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{rcShop || 'CashTrace'}</h3>
                <p className="text-[11px] text-slate-500">
                  {getLocalDateStr()} {rcCustomer ? `· ${rcCustomer}` : ''}
                </p>
              </div>

              <div className="space-y-1.5 text-xs">
                {rcItems.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2">
                    <span className="text-slate-700 dark:text-slate-200 truncate">
                      {it.name} ({it.qty} × {displayCurrency}{it.unitPrice})
                    </span>
                    <span className="font-bold tabular-nums shrink-0">
                      {formatMoney(it.qty * it.unitPrice, displayCurrency, language)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 space-y-1 text-xs">
                {rcDiscount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>{t('ছাড়', 'Discount', language)}</span>
                    <span className="tabular-nums">-{formatMoney(rcDiscount, displayCurrency, language)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                  <span>{t('মোট বিল', 'Grand Total', language)}</span>
                  <span className="tabular-nums ct-accent-text">
                    {formatMoney(rcGrandTotal, displayCurrency, language)}
                  </span>
                </div>
                {rcNote && <p className="text-[11px] text-slate-500 pt-1">{rcNote}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. FINANCIAL QUICK NOTES VAULT */}
      {activeTool === 'notes' && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 ct-accent-text shrink-0" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('সুরক্ষিত আর্থিক নোটস ভল্ট', 'Financial Quick Notes Vault', language)}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('ব্যাংক অ্যাকাউন্ট নম্বর, জমি/ভাড়া চুক্তি বা জরুরি আর্থিক নোট সংরক্ষণ করুন', 'Store account memos, contract notes & quick reminders behind PIN lock', language)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openNoteEditor()}
              className="px-3.5 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>{t('নতুন নোট', 'New Note', language)}</span>
            </button>
          </div>

          {financialNotes.length > 0 && (
            <input
              type="text"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder={t('নোট খুঁজুন...', 'Search notes...', language)}
              className="w-full sm:w-72 ct-surface-alt border ct-btn-radius px-3.5 py-2 text-xs outline-none"
            />
          )}

          {sortedNotes.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <StickyNote className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('কোনো নোট সেভ করা নেই।', 'No notes saved yet.', language)}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {sortedNotes.map((note) => (
                <div
                  key={note.id}
                  className={`p-4 ct-btn-radius border space-y-2 flex flex-col justify-between ${
                    note.pinned ? 'ct-accent-border bg-[var(--ct-accent-soft)]' : 'ct-surface-alt'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {note.title}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSaveNote({...note, pinned: !note.pinned, updatedAt: Date.now()})}
                          className={`p-1 rounded-lg ${note.pinned ? 'ct-accent-text' : 'text-slate-400 hover:text-slate-700'}`}
                          aria-label="Pin note"
                        >
                          {note.pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteNote(note.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                          aria-label="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {note.body && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
                        {note.body}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openNoteEditor(note)}
                    className="text-left text-[11px] font-bold ct-accent-text hover:underline pt-1"
                  >
                    {t('সম্পাদনা করুন', 'Edit Note', language)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bill Add / Edit Modal */}
      {billModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingBill ? t('বিল তথ্য এডিট', 'Edit Recurring Bill', language) : t('নতুন মাসিক বিল', 'New Monthly Bill', language)}
              </h3>
              <button type="button" onClick={() => setBillModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleBillSubmit} className="space-y-3">
              <input
                type="text"
                value={billTitle}
                onChange={(e) => setBillTitle(e.target.value)}
                placeholder={t('বিলের নাম (যেমন: ওয়াইফাই বিল)', 'Bill name (e.g. Wi-Fi)', language)}
                required
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={billAmountText}
                  onChange={(e) => setBillAmountText(e.target.value)}
                  placeholder={t(`পরিমাণ (${displayCurrency})`, `Amount (${displayCurrency})`, language)}
                  required
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono font-bold outline-none"
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={billDueDay}
                  onChange={(e) => setBillDueDay(e.target.value)}
                  placeholder={t('তারিখ (১-৩১)', 'Due day (1-31)', language)}
                  required
                  className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono font-bold outline-none"
                />
              </div>
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-xs font-semibold outline-none"
              >
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <select
                value={billWalletId}
                onChange={(e) => setBillWalletId(e.target.value)}
                className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-xs font-semibold outline-none"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold min-h-[42px]"
              >
                {t('সেভ করুন', 'Save Bill', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Note Add / Edit Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-md ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingNote ? t('নোট সম্পাদনা', 'Edit Note', language) : t('নতুন আর্থিক নোট', 'New Note', language)}
              </h3>
              <button type="button" onClick={() => setNoteModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveNoteSubmit} className="space-y-3">
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder={t('শিরোনাম *', 'Title *', language)}
                required
                autoFocus
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-semibold outline-none"
              />
              <textarea
                rows={4}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder={t('বিস্তারিত লিখুন...', 'Write memo details...', language)}
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none resize-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notePinned}
                  onChange={(e) => setNotePinned(e.target.checked)}
                  className="rounded"
                />
                <span>{t('উপরে পিন করে রাখুন', 'Pin this note to top', language)}</span>
              </label>
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold min-h-[42px]"
              >
                {t('নোট সেভ করুন', 'Save Note', language)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
