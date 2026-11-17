import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Calculator,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  KeyRound,
  ListChecks,
  Lock,
  MessageCircle,
  Pause,
  Percent,
  Pin,
  PinOff,
  Play,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  StickyNote,
  Timer,
  Trash2,
  Unlock,
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
  DailyTask,
  DebtRecord,
  FinancialNote,
  LanguageCode,
  RecurringBill,
  Transaction,
  VaultCategory,
  VaultItem,
  WalletAccount,
} from '../types';
import {BusinessInvoiceLine, exportBusinessInvoicePDF} from '../utils/exportHelper';
import {formatMoney, getLocalDateStr, getLocalMonthKey, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

export type PocketToolId =
  | 'converter'
  | 'fees'
  | 'bills'
  | 'split'
  | 'calc'
  | 'receipt'
  | 'notes'
  | 'planner'
  | 'vault'
  | 'qrcard'
  | 'invoice';

interface PocketToolsTabProps {
  initialTool?: PocketToolId;
  initialViewMode?: 'hub' | 'tool';
  selectionNonce?: number;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  recurringBills: RecurringBill[];
  financialNotes: FinancialNote[];
  dailyTasks?: DailyTask[];
  vaultItems?: VaultItem[];
  userPin?: string;
  userName?: string;
  accentColor?: string;
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
  onSaveDailyTask?: (task: DailyTask) => void;
  onDeleteDailyTask?: (taskId: string) => void;
  onSaveVaultItem?: (item: VaultItem) => void;
  onDeleteVaultItem?: (itemId: string) => void;
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
  initialViewMode = 'hub',
  selectionNonce = 0,
  wallets,
  categories,
  recurringBills,
  financialNotes,
  dailyTasks = [],
  vaultItems = [],
  userPin = '',
  userName = 'CashTrace User',
  accentColor = '#059669',
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
  onSaveDailyTask,
  onDeleteDailyTask,
  onSaveVaultItem,
  onDeleteVaultItem,
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
  const [viewMode, setViewMode] = useState<'hub' | 'tool'>(initialViewMode);
  const [toolFilter, setToolFilter] = useState('');

  useEffect(() => {
    setActiveTool(initialTool);
    if (selectionNonce > 0) {
      setViewMode('tool');
    } else {
      setViewMode(initialViewMode);
    }
  }, [initialTool, initialViewMode, selectionNonce]);

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

  // ── 8. Daily To-Do & Pomodoro Focus Timer ──
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'normal' | 'high'>('normal');
  const [taskDueTime, setTaskDueTime] = useState('');
  const [taskDailyRoutine, setTaskDailyRoutine] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'done'>('all');

  const [focusDurationSec, setFocusDurationSec] = useState(25 * 60);
  const [focusRemainingSec, setFocusRemainingSec] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusLabel, setFocusLabel] = useState(t('গভীর কাজ (২৫ মি.)', 'Deep Focus (25m)', language));

  useEffect(() => {
    if (!focusRunning) return;
    const interval = window.setInterval(() => {
      setFocusRemainingSec((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          try {
            const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
            if (AudioCtx) {
              const audioCtx = new AudioCtx();
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(660, audioCtx.currentTime);
              gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.35);
            }
          } catch {
            // Audio playback blocked or unavailable
          }
          onShowToast(t('ফোকাস সেশন সম্পন্ন হয়েছে!', 'Focus session completed!', language));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusRunning, language, onShowToast]);

  const setFocusPreset = (minutes: number, label: string) => {
    setFocusRunning(false);
    const secs = minutes * 60;
    setFocusDurationSec(secs);
    setFocusRemainingSec(secs);
    setFocusLabel(label);
  };

  const filteredTasks = useMemo(() => {
    return [...dailyTasks]
      .filter((task) => {
        if (taskFilter === 'pending') return !task.done;
        if (taskFilter === 'done') return task.done;
        return true;
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  }, [dailyTasks, taskFilter]);

  const handleAddDailyTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = taskTitle.trim().slice(0, 160);
    if (!clean || !onSaveDailyTask) return;
    onSaveDailyTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: clean,
      done: false,
      priority: taskPriority,
      dueTime: taskDueTime.trim() || undefined,
      dailyRoutine: taskDailyRoutine,
      createdAt: Date.now(),
    });
    setTaskTitle('');
    setTaskDueTime('');
    setTaskDailyRoutine(false);
    setTaskPriority('normal');
  };

  const handleResetRoutines = () => {
    if (!onSaveDailyTask) return;
    const routines = dailyTasks.filter((tItem) => tItem.dailyRoutine && tItem.done);
    if (routines.length === 0) {
      onShowToast(t('রিসেট করার মতো কোনো সম্পন্ন রুটিন নেই', 'No completed daily routines to reset', language));
      return;
    }
    routines.forEach((r) => onSaveDailyTask({...r, done: false}));
    onShowToast(t(`${routines.length} টি দৈনিক রুটিন নতুন দিনের জন্য রিসেট হয়েছে`, `Reset ${routines.length} daily routine(s)`, language));
  };

  // ── 9. Secure Pocket Vault State ──
  const [vaultUnlocked, setVaultUnlocked] = useState(() => !(userPin && userPin.length === 4));
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [vaultPinError, setVaultPinError] = useState(false);
  const [vaultCatFilter, setVaultCatFilter] = useState<'all' | VaultCategory>('all');
  const [revealedVaultIds, setRevealedVaultIds] = useState<Record<string, boolean>>({});
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [editingVaultItem, setEditingVaultItem] = useState<VaultItem | null>(null);
  const [vLabel, setVLabel] = useState('');
  const [vCategory, setVCategory] = useState<VaultCategory>('bank');
  const [vValue, setVValue] = useState('');
  const [vNote, setVNote] = useState('');
  const [vExpiry, setVExpiry] = useState('');

  useEffect(() => {
    if (!(userPin && userPin.length === 4)) {
      setVaultUnlocked(true);
    }
  }, [userPin]);

  const openVaultEditor = (item?: VaultItem) => {
    if (item) {
      setEditingVaultItem(item);
      setVLabel(item.label);
      setVCategory(item.category);
      setVValue(item.value);
      setVNote(item.note || '');
      setVExpiry(item.expiryDate || '');
    } else {
      setEditingVaultItem(null);
      setVLabel('');
      setVCategory('bank');
      setVValue('');
      setVNote('');
      setVExpiry('');
    }
    setVaultModalOpen(true);
  };

  const handleSaveVaultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveVaultItem || !vLabel.trim() || !vValue.trim()) return;
    onSaveVaultItem({
      id: editingVaultItem?.id || `vault_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      label: vLabel.trim().slice(0, 120),
      category: vCategory,
      value: vValue.trim().slice(0, 400),
      note: vNote.trim().slice(0, 300) || undefined,
      expiryDate: vExpiry.trim() || undefined,
      updatedAt: Date.now(),
    });
    setVaultModalOpen(false);
    setEditingVaultItem(null);
  };

  const filteredVaultItems = useMemo(() => {
    return [...vaultItems]
      .filter((v) => vaultCatFilter === 'all' || v.category === vaultCatFilter)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [vaultItems, vaultCatFilter]);

  const handleCopySecret = async (val: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(val);
        onShowToast(t('তথ্য ক্লিপবোর্ডে কপি হয়েছে!', 'Copied to clipboard!', language));
      }
    } catch {
      onShowToast(t('কপি করা যায়নি', 'Copy failed', language));
    }
  };

  // ── 10. Digital Visiting & Payment QR Card Maker ──
  const [qrMode, setQrMode] = useState<'payment' | 'wifi' | 'vcard'>('payment');
  const [qrTitle, setQrTitle] = useState(userName || 'CashTrace');
  const [qrPayAccount, setQrPayAccount] = useState('bKash: 017XXXXXXXX');
  const [qrPayAmount, setQrPayAmount] = useState('');
  const [qrWifiSsid, setQrWifiSsid] = useState('MyHomeWiFi');
  const [qrWifiPass, setQrWifiPass] = useState('');
  const [qrWifiEnc, setQrWifiEnc] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [qrVcardPhone, setQrVcardPhone] = useState('');
  const [qrVcardEmail, setQrVcardEmail] = useState('');
  const [qrVcardOrg, setQrVcardOrg] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const qrPayload = useMemo(() => {
    if (qrMode === 'wifi') {
      const ssid = qrWifiSsid.replace(/([\\;,:"])/g, '\\$1');
      const pass = qrWifiPass.replace(/([\\;,:"])/g, '\\$1');
      return `WIFI:T:${qrWifiEnc};S:${ssid};P:${qrWifiEnc === 'nopass' ? '' : pass};;`;
    }
    if (qrMode === 'vcard') {
      const fn = qrTitle.trim() || 'Contact';
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${fn}`,
        qrVcardOrg ? `ORG:${qrVcardOrg.trim()}` : '',
        qrVcardPhone ? `TEL;TYPE=CELL:${qrVcardPhone.trim()}` : '',
        qrVcardEmail ? `EMAIL:${qrVcardEmail.trim()}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      qrTitle.trim() || 'Payment Details',
      qrPayAccount.trim(),
      qrPayAmount.trim() ? `Amount: ${displayCurrency}${qrPayAmount.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [qrMode, qrTitle, qrPayAccount, qrPayAmount, qrWifiSsid, qrWifiPass, qrWifiEnc, qrVcardOrg, qrVcardPhone, qrVcardEmail, displayCurrency]);

  useEffect(() => {
    if (activeTool !== 'qrcard' || !qrCanvasRef.current) return;
    QRCode.toCanvas(
      qrCanvasRef.current,
      qrPayload || 'CashTrace',
      {
        width: 240,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err) => {
        if (err) {
          console.error('QR generation failed:', err);
        }
      }
    );
  }, [activeTool, qrPayload]);

  const handleDownloadQRCard = async () => {
    const srcCanvas = qrCanvasRef.current;
    if (!srcCanvas) return;
    try {
      const card = document.createElement('canvas');
      card.width = 640;
      card.height = 800;
      const ctx = card.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, card.width, card.height);
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, card.width, 18);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(qrTitle.trim() || 'CashTrace QR', card.width / 2, 92);

      ctx.fillStyle = '#475569';
      ctx.font = '500 20px system-ui, sans-serif';
      const subtitle =
        qrMode === 'wifi'
          ? `Wi-Fi: ${qrWifiSsid}`
          : qrMode === 'vcard'
          ? qrVcardPhone || qrVcardOrg || 'Digital Contact Card'
          : qrPayAccount;
      ctx.fillText(subtitle.slice(0, 44), card.width / 2, 134);

      const qrSize = 420;
      ctx.drawImage(srcCanvas, (card.width - qrSize) / 2, 185, qrSize, qrSize);

      ctx.fillStyle = '#64748b';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText('Scan with any smartphone camera · CashTrace', card.width / 2, 680);

      const dataUrl = card.toDataURL('image/png');
      const filename = `CashTrace_QR_${qrMode}_${getLocalDateStr()}.png`;

      if (Capacitor.isNativePlatform()) {
        const base64 = dataUrl.split(',')[1] || '';
        const saved = await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: qrTitle || 'CashTrace QR Card',
          url: saved.uri,
        });
        onShowToast(t('QR কার্ড শেয়ারের জন্য প্রস্তুত!', 'QR card ready to share!', language));
        return;
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast(t('QR কার্ড PNG ডাউনলোড হয়েছে!', 'QR card PNG downloaded!', language));
    } catch {
      onShowToast(t('QR কার্ড তৈরি করতে সমস্যা হয়েছে', 'Failed to export QR card', language));
    }
  };

  // ── 11. Business Invoice & Quotation PDF Maker ──
  const [invStatus, setInvStatus] = useState<'PAID' | 'DUE' | 'QUOTE'>('DUE');
  const [invNo, setInvNo] = useState(`INV-${new Date().getFullYear().toString().slice(-2)}01`);
  const [invDate, setInvDate] = useState(getLocalDateStr());
  const [invDueDate, setInvDueDate] = useState('');
  const [invBizName, setInvBizName] = useState(userName || 'CashTrace Enterprise');
  const [invBizContact, setInvBizContact] = useState('');
  const [invClientName, setInvClientName] = useState('');
  const [invClientContact, setInvClientContact] = useState('');
  const [invItems, setInvItems] = useState<BusinessInvoiceLine[]>([
    {name: t('ওয়েব / সার্ভিস চার্জ', 'Consulting / Service Fee', language), qty: 1, unitPrice: 2500},
  ]);
  const [invDiscountPctText, setInvDiscountPctText] = useState('0');
  const [invVatPctText, setInvVatPctText] = useState('0');
  const [invPaymentNote, setInvPaymentNote] = useState('');
  const [exportingInvPdf, setExportingInvPdf] = useState(false);

  const invSubtotal = invItems.reduce((s, r) => s + r.qty * r.unitPrice, 0);
  const invDiscountPct = Math.max(0, Math.min(100, parseLocaleNumber(invDiscountPctText) || 0));
  const invVatPct = Math.max(0, Math.min(100, parseLocaleNumber(invVatPctText) || 0));
  const invDiscountAmt = invSubtotal * (invDiscountPct / 100);
  const invAfterDisc = Math.max(0, invSubtotal - invDiscountAmt);
  const invVatAmt = invAfterDisc * (invVatPct / 100);
  const invGrandTotal = invAfterDisc + invVatAmt;

  const invoiceShareText = useMemo(() => {
    const label = invStatus === 'QUOTE' ? 'Quotation' : 'Invoice';
    const itemLines = invItems.map(
      (it) => `• ${it.name} (${it.qty} × ${displayCurrency}${it.unitPrice}) = ${displayCurrency}${(it.qty * it.unitPrice).toFixed(0)}`
    );
    return [
      `📄 ${invBizName || 'CashTrace'} — ${label} #${invNo}`,
      invClientName ? `${t('গ্রাহক', 'Client', language)}: ${invClientName}` : '',
      `${t('স্ট্যাটাস', 'Status', language)}: ${invStatus}`,
      `${t('তারিখ', 'Date', language)}: ${invDate}`,
      '',
      ...itemLines,
      '',
      `${t('সর্বমোট বিল', 'Grand Total', language)}: ${formatMoney(invGrandTotal, displayCurrency, language)}`,
      invPaymentNote ? `${t('নোট', 'Note', language)}: ${invPaymentNote}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [invBizName, invStatus, invNo, invClientName, invDate, invItems, displayCurrency, invGrandTotal, invPaymentNote, language]);

  const handleDownloadInvoicePDF = async () => {
    if (exportingInvPdf) return;
    setExportingInvPdf(true);
    try {
      const mode = await exportBusinessInvoicePDF({
        invoiceNo: invNo,
        status: invStatus,
        date: invDate,
        dueDate: invDueDate || undefined,
        businessName: invBizName,
        businessContact: invBizContact || undefined,
        clientName: invClientName || t('সম্মানিত গ্রাহক', 'Valued Client', language),
        clientContact: invClientContact || undefined,
        items: invItems,
        discountPct: invDiscountPct,
        vatPct: invVatPct,
        paymentNote: invPaymentNote || undefined,
        currency: displayCurrency,
        language,
        accentColor,
      });
      onShowToast(
        mode === 'shared'
          ? t('ইনভয়েস PDF শেয়ারের জন্য প্রস্তুত!', 'Invoice PDF ready to share!', language)
          : t('ইনভয়েস PDF ডাউনলোড হয়েছে!', 'Invoice PDF downloaded!', language)
      );
    } catch {
      onShowToast(t('PDF তৈরি করতে সমস্যা হয়েছে', 'Failed to generate invoice PDF', language));
    } finally {
      setExportingInvPdf(false);
    }
  };

  const toolTabs: Array<{
    id: PocketToolId;
    group: 'utility' | 'business' | 'productivity';
    bn: string;
    en: string;
    descBn: string;
    descEn: string;
    cardGradient: string;
    badgeTone: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'converter',
      group: 'utility',
      bn: 'কারেন্সি কনভার্টার',
      en: 'FX Converter',
      descBn: '২০+ মুদ্রার লাইভ রেট',
      descEn: 'Live 20+ currency rates',
      cardGradient: 'bg-gradient-to-br from-sky-500 to-blue-600 border-sky-400/40',
      badgeTone: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
      icon: <ArrowLeftRight className="w-5 h-5" />,
    },
    {
      id: 'fees',
      group: 'utility',
      bn: 'MFS চার্জ ক্যালকুলেটর',
      en: 'MFS Cash-Out Fees',
      descBn: 'বিকাশ · নগদ · রকেট · উপায়',
      descEn: 'bKash · Nagad · Rocket fees',
      cardGradient: 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400/40',
      badgeTone: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
      icon: <Smartphone className="w-5 h-5" />,
    },
    {
      id: 'bills',
      group: 'utility',
      bn: 'মাসিক বিল ট্র্যাকার',
      en: 'Monthly Bills',
      descBn: 'ভাড়া, নেট ও ইউটিলিটি বিল',
      descEn: 'Rent, Wi-Fi & utility dues',
      cardGradient: 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/40',
      badgeTone: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      icon: <CalendarClock className="w-5 h-5" />,
    },
    {
      id: 'split',
      group: 'utility',
      bn: 'ট্যুর ও মেস স্প্লিট',
      en: 'Tour & Mess Split',
      descBn: 'যৌথ খরচের অটো হিসাব',
      descEn: 'Split group trips & mess',
      cardGradient: 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/40',
      badgeTone: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'calc',
      group: 'utility',
      bn: 'আর্থিক ক্যালকুলেটর',
      en: 'EMI · DPS · Zakat',
      descBn: 'লোন EMI, সঞ্চয় ও যাকাত',
      descEn: 'Loan EMI, DPS & Zakat 2.5%',
      cardGradient: 'bg-gradient-to-br from-indigo-500 to-blue-700 border-indigo-400/40',
      badgeTone: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
      icon: <Calculator className="w-5 h-5" />,
    },
    {
      id: 'invoice',
      group: 'business',
      bn: 'বিজনেস ইনভয়েস PDF',
      en: 'Invoice PDF',
      descBn: 'ভ্যাট ও PAID/DUE কোটেশন',
      descEn: 'A4 client invoices & VAT',
      cardGradient: 'bg-gradient-to-br from-teal-600 to-emerald-700 border-teal-400/40',
      badgeTone: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
      icon: <FileSpreadsheet className="w-5 h-5" />,
    },
    {
      id: 'qrcard',
      group: 'business',
      bn: 'ডিজিটাল QR কার্ড',
      en: 'QR Card Maker',
      descBn: 'পেমেন্ট, Wi-Fi ও ভিজিটিং QR',
      descEn: 'Pay, Wi-Fi & Contact PNG',
      cardGradient: 'bg-gradient-to-br from-violet-500 to-purple-700 border-violet-400/40',
      badgeTone: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
      icon: <QrCode className="w-5 h-5" />,
    },
    {
      id: 'receipt',
      group: 'business',
      bn: 'কুইক রসিদ মেকার',
      en: 'Quick Receipt',
      descBn: 'তাৎক্ষণিক কাস্টমার রসিদ',
      descEn: 'Instant printable receipts',
      cardGradient: 'bg-gradient-to-br from-cyan-600 to-sky-700 border-cyan-400/40',
      badgeTone: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300',
      icon: <Receipt className="w-5 h-5" />,
    },
    {
      id: 'planner',
      group: 'productivity',
      bn: 'টাস্ক ও ফোকাস টাইমার',
      en: 'Planner & Focus',
      descBn: 'দৈনিক কাজ ও ২৫মি. Pomodoro',
      descEn: 'To-do & 25m focus timer',
      cardGradient: 'bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-400/40',
      badgeTone: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
      icon: <ListChecks className="w-5 h-5" />,
    },
    {
      id: 'vault',
      group: 'productivity',
      bn: 'সুরক্ষিত পকেট ভল্ট',
      en: 'Pocket Vault',
      descBn: 'NID, ব্যাংক ও Wi-Fi ভল্ট',
      descEn: 'Masked IDs, cards & Wi-Fi',
      cardGradient: 'bg-gradient-to-br from-slate-700 to-slate-900 border-slate-500/40',
      badgeTone: 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
      icon: <KeyRound className="w-5 h-5" />,
    },
    {
      id: 'notes',
      group: 'productivity',
      bn: 'আর্থিক নোটস ভল্ট',
      en: 'Notes Vault',
      descBn: 'পিন করা মেমো ও রিমাইন্ডার',
      descEn: 'Pin memos & quick notes',
      cardGradient: 'bg-gradient-to-br from-amber-600 to-red-600 border-amber-400/40',
      badgeTone: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      icon: <StickyNote className="w-5 h-5" />,
    },
  ];

  const activeToolMeta = toolTabs.find((item) => item.id === activeTool) || toolTabs[0];

  const filteredTools = toolFilter.trim()
    ? toolTabs.filter((item) =>
        `${item.bn} ${item.en} ${item.descBn} ${item.descEn}`
          .toLowerCase()
          .includes(toolFilter.trim().toLowerCase())
      )
    : toolTabs;

  const toolGroups: Array<{
    key: 'utility' | 'business' | 'productivity';
    titleBn: string;
    titleEn: string;
    headerColor: string;
  }> = [
    {
      key: 'utility',
      titleBn: 'ইউটিলিটি টুলস (দৈনন্দিন হিসাব)',
      titleEn: 'Utility Tools',
      headerColor: 'text-sky-700 dark:text-sky-400',
    },
    {
      key: 'business',
      titleBn: 'বিজনেস ও বিলিং টুলস',
      titleEn: 'Business & Billing',
      headerColor: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      key: 'productivity',
      titleBn: 'প্ল্যানার, নোটস ও ভল্ট',
      titleEn: 'Planner, Notes & Security',
      headerColor: 'text-indigo-700 dark:text-indigo-400',
    },
  ];

  return (
    <div className="max-w-6xl w-full min-w-0 mx-auto space-y-5 overflow-x-hidden">
      {viewMode === 'hub' ? (
        <div className="space-y-5 min-w-0">
          {/* Hub Header + Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t('ইউটিলিটি ও স্মার্ট টুলস', 'Utility & Smart Tools', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'সব টুলস এক নজরে — যেকোনো বক্সে ট্যাপ করে সরাসরি ব্যবহার করুন',
                  'All 11 tools at a glance — tap any box to open directly',
                  language
                )}
              </p>
            </div>
            <div className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl px-3 py-2 flex items-center gap-2 w-full sm:w-64 min-w-0">
              <Search className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <input
                type="text"
                value={toolFilter}
                onChange={(e) => setToolFilter(e.target.value)}
                placeholder={t('টুলস খুঁজুন...', 'Filter tools...', language)}
                className="w-full min-w-0 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Categorized Colorful Box Grid */}
          {toolGroups.map((grp) => {
            const items = filteredTools.filter((item) => item.group === grp.key);
            if (items.length === 0) return null;
            return (
              <section key={grp.key} className="space-y-2.5">
                <h3 className={`text-xs font-bold uppercase tracking-wider px-0.5 ${grp.headerColor}`}>
                  {language === 'bn' ? grp.titleBn : grp.titleEn}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  {items.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        setActiveTool(tool.id);
                        setViewMode('tool');
                      }}
                      className={`${tool.cardGradient} border text-white rounded-2xl p-3.5 sm:p-4 min-h-[116px] sm:min-h-[126px] flex flex-col justify-between items-start text-left shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all`}
                    >
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs text-white flex items-center justify-center shrink-0">
                          {tool.icon}
                        </span>
                        <span className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                          <ChevronRight className="w-4 h-4 text-white/90" />
                        </span>
                      </div>

                      <div className="w-full min-w-0 pt-2">
                        <p className="text-xs sm:text-sm font-bold text-white leading-tight line-clamp-1">
                          {language === 'bn' ? tool.bn : tool.en}
                        </p>
                        <p className="text-[11px] text-white/85 mt-1 line-clamp-1">
                          {language === 'bn' ? tool.descBn : tool.descEn}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {/* Focused Individual Tool Header Bar */}
          <div className="ct-surface-card border rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setViewMode('hub')}
                className="px-3.5 py-2 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-sm min-h-[40px] shrink-0 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('সব টুলস', 'All Tools', language)}</span>
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-8 h-8 rounded-xl ${activeToolMeta.badgeTone} flex items-center justify-center shrink-0`}>
                  {activeToolMeta.icon}
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {language === 'bn' ? activeToolMeta.bn : activeToolMeta.en}
                </span>
              </div>
            </div>

            <select
              value={activeTool}
              onChange={(e) => setActiveTool(e.target.value as PocketToolId)}
              className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 ct-btn-radius px-3 py-2 text-xs font-bold text-sky-900 dark:text-sky-100 outline-none min-h-[40px] w-full sm:w-auto max-w-full min-w-0"
              aria-label="Switch active tool"
            >
              {toolTabs.map((item) => (
                <option key={item.id} value={item.id}>
                  {language === 'bn' ? item.bn : item.en}
                </option>
              ))}
            </select>
          </div>

          {/* 1. LIVE CURRENCY CONVERTER */}
          {activeTool === 'converter' && (
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="min-w-0">
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
              className="px-3.5 py-2 ct-btn-radius bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 hover:bg-sky-200 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-60 transition-colors"
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
                className="min-h-[44px] min-w-[44px] ct-btn-radius bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 flex items-center justify-center hover:opacity-85 transition-opacity"
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
              className="px-4 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[42px] transition-colors"
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
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
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
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
                    mfsMode === 'forward' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t('কত তুলবেন', 'Cash Out Amt', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setMfsMode('reverse')}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
                    mfsMode === 'reverse' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
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
              className="px-4 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[42px] disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('শুধু চার্জ খরচ হিসেবে যোগ করুন', 'Log Fee as Expense', language)}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. MONTHLY BILLS & SUBSCRIPTIONS TRACKER */}
      {activeTool === 'bills' && (
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="min-w-0">
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
              className="px-3.5 py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
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
                          className="px-3 py-2 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold min-h-[38px] transition-colors"
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
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4 min-w-0">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
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
                    className="px-3 py-2 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px] transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{t('শেয়ার / কপি', 'Share', language)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePushSplitsToLedger}
                    className="px-3 py-2 ct-btn-radius bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px] transition-colors"
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
              <form onSubmit={handleAddSplitMember} className="inline-flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder={t('নতুন সদস্য...', 'Add member...', language)}
                  className="ct-surface-alt border ct-btn-radius px-2.5 py-1.5 text-xs outline-none flex-1 sm:w-32 min-w-0"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0"
                >
                  +
                </button>
              </form>
            </div>
          </div>

          {/* Add Expense Row */}
          <form onSubmit={handleAddSplitExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 min-w-0">
            <input
              type="text"
              value={splitExpTitle}
              onChange={(e) => setSplitExpTitle(e.target.value)}
              placeholder={t('খরচের নাম (যেমন: হোটেল, নাস্তা)', 'Expense item (e.g. Hotel, Dinner)', language)}
              required
              className="sm:col-span-5 w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs text-slate-900 dark:text-white outline-none"
            />
            <input
              type="text"
              inputMode="decimal"
              value={splitExpAmountText}
              onChange={(e) => setSplitExpAmountText(e.target.value)}
              placeholder={t(`টাকা (${displayCurrency})`, `Amount (${displayCurrency})`, language)}
              required
              className="sm:col-span-3 w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
            />
            <select
              value={splitExpPaidBy}
              onChange={(e) => setSplitExpPaidBy(e.target.value)}
              className="sm:col-span-2 w-full min-w-0 ct-surface-alt border ct-btn-radius px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none"
            >
              {splitData.members.map((m) => (
                <option key={m} value={m}>
                  {t(`${m} দিয়েছে`, `Paid: ${m}`, language)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="sm:col-span-2 py-2 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold min-h-[38px] transition-colors"
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
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4 min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('স্মার্ট ফিন্যান্সিয়াল ক্যালকুলেটর', 'Financial Calculator Suite', language)}
            </h2>
            <div className="flex flex-wrap items-center gap-1 p-1 ct-surface-alt border ct-btn-radius w-full sm:w-auto max-w-full">
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
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                    calcMode === m.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
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
                  className="px-3 py-1.5 ct-btn-radius bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1"
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
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('কুইক কাস্টমার রসিদ / ইনভয়েস', 'Quick Customer Receipt Maker', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('দোকান, ফ্রিল্যান্সিং বা সার্ভিসের জন্য মুহূর্তেই রসিদ তৈরি ও শেয়ার করুন', 'Create clean receipts & share or print instantly', language)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShareReceipt}
                className="px-3 py-2 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px] transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('কপি / শেয়ার', 'Copy / Share', language)}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[38px] transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('প্রিন্ট', 'Print', language)}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 min-w-0">
            {/* Builder side */}
            <div className="space-y-3 min-w-0">
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={rcShop}
                  onChange={(e) => setRcShop(e.target.value)}
                  placeholder={t('প্রতিষ্ঠানের নাম', 'Business Name', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-semibold outline-none"
                />
                <input
                  type="text"
                  value={rcCustomer}
                  onChange={(e) => setRcCustomer(e.target.value)}
                  placeholder={t('ক্রেতার নাম (ঐচ্ছিক)', 'Customer Name', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="space-y-2">
                {rcItems.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-1.5 items-center min-w-0">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) =>
                        setRcItems((p) =>
                          p.map((x) => (x.id === row.id ? {...x, name: e.target.value} : x))
                        )
                      }
                      placeholder={t('পণ্য', 'Item', language)}
                      className="col-span-5 w-full min-w-0 ct-surface-alt border ct-btn-radius px-2 py-2 text-xs outline-none"
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
                      className="col-span-2 w-full min-w-0 ct-surface-alt border ct-btn-radius px-1.5 py-2 text-xs font-mono font-bold outline-none"
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
                      className="col-span-4 w-full min-w-0 ct-surface-alt border ct-btn-radius px-2 py-2 text-xs font-mono font-bold outline-none"
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
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
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
              className="px-3.5 py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
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

      {/* 8. DAILY TO-DO PLANNER & POMODORO FOCUS TIMER */}
      {activeTool === 'planner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0">
          {/* Tasks Column */}
          <div className="lg:col-span-7 ct-surface-card border p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('দৈনিক কাজের তালিকা ও রুটিন', 'Daily To-Do & Routine Planner', language)}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dailyTasks.filter((tItem) => !tItem.done).length}{' '}
                  {t('টি কাজ বাকি', 'pending tasks', language)} ·{' '}
                  {dailyTasks.filter((tItem) => tItem.done).length}{' '}
                  {t('টি সম্পন্ন', 'completed', language)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetRoutines}
                className="px-3 py-1.5 ct-btn-radius bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90"
                title={t('সম্পন্ন দৈনিক রুটিনগুলো আবার চালু করুন', 'Uncheck all completed daily routines', language)}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('রুটিন রিসেট', 'Reset Routines', language)}</span>
              </button>
            </div>

            <form onSubmit={handleAddDailyTaskSubmit} className="space-y-2.5">
              <div className="flex gap-2 min-w-0">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t('আজকের কাজের নাম লিখুন...', 'Add a task for today...', language)}
                  className="flex-1 min-w-0 ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!taskTitle.trim()}
                  className="px-4 py-2.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-45 shrink-0 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('যোগ', 'Add', language)}</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as 'normal' | 'high')}
                  className="ct-surface-alt border ct-btn-radius px-2.5 py-1.5 font-semibold outline-none max-w-full min-w-0"
                >
                  <option value="normal">{t('সাধারণ অগ্রাধিকার', 'Normal Priority', language)}</option>
                  <option value="high">{t('জরুরি / হাই প্রায়োরিটি', 'High Priority', language)}</option>
                </select>
                <input
                  type="time"
                  value={taskDueTime}
                  onChange={(e) => setTaskDueTime(e.target.value)}
                  className="ct-surface-alt border ct-btn-radius px-2.5 py-1.5 font-mono outline-none max-w-full"
                  aria-label="Due time"
                />
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 ct-surface-alt border ct-btn-radius cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taskDailyRoutine}
                    onChange={(e) => setTaskDailyRoutine(e.target.checked)}
                    className="rounded"
                  />
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {t('দৈনিক রুটিন', 'Daily Routine', language)}
                  </span>
                </label>
              </div>
            </form>

            {/* Filter tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  {id: 'all', bn: 'সব', en: 'All'},
                  {id: 'pending', bn: 'বাকি', en: 'Pending'},
                  {id: 'done', bn: 'সম্পন্ন', en: 'Done'},
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTaskFilter(f.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    taskFilter === f.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {language === 'bn' ? f.bn : f.en}
                </button>
              ))}
            </div>

            {filteredTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {t('কোনো কাজ যোগ করা হয়নি। উপরে কাজের নাম লিখে যোগ করুন।', 'No tasks here yet. Add your first task above.', language)}
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between gap-2.5 p-3 ct-btn-radius border ${
                      task.done ? 'ct-surface-alt opacity-70' : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSaveDailyTask?.({...task, done: !task.done})}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          task.done
                            ? 'ct-accent-bg border-transparent'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {task.done && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${
                            task.done
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {task.priority === 'high' && (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              {t('জরুরি', 'High', language)}
                              {(task.dueTime || task.dailyRoutine) ? ' · ' : ''}
                            </span>
                          )}
                          {task.dueTime && <span className="font-mono">{task.dueTime}</span>}
                          {task.dueTime && task.dailyRoutine && ' · '}
                          {task.dailyRoutine && <span>{t('দৈনিক রুটিন', 'Routine', language)}</span>}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteDailyTask?.(task.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg shrink-0"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pomodoro Focus Timer Column */}
          <div className="lg:col-span-5 ct-surface-card border p-4 sm:p-5 flex flex-col justify-between space-y-5 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 ct-accent-text" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('পমোডোরো ফোকাস টাইমার', 'Focus Timer', language)}
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{focusLabel}</span>
            </div>

            {/* SVG Circular Countdown Ring */}
            <div className="flex flex-col items-center justify-center py-2">
              {(() => {
                const size = 192;
                const stroke = 10;
                const radius = (size - stroke) / 2;
                const circumference = 2 * Math.PI * radius;
                const progress = focusDurationSec > 0 ? focusRemainingSec / focusDurationSec : 0;
                const dashOffset = circumference * (1 - progress);
                const mins = Math.floor(focusRemainingSec / 60);
                const secs = focusRemainingSec % 60;
                return (
                  <div className="relative w-48 h-48 flex items-center justify-center">
                    <svg width={size} height={size} className="-rotate-90">
                      <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={stroke}
                        fill="transparent"
                        className="text-slate-200 dark:text-slate-800"
                      />
                      <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={accentColor}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className="transition-all duration-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
                        {focusRunning
                          ? t('ফোকাস চলছে...', 'Focusing...', language)
                          : t('শুরু করতে ট্যাপ করুন', 'Ready to start', language)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFocusPreset(25, t('গভীর কাজ (২৫ মি.)', 'Deep Focus (25m)', language))}
                  className="py-2 ct-btn-radius ct-surface-alt border text-xs font-bold hover:ct-accent-border"
                >
                  25m Focus
                </button>
                <button
                  type="button"
                  onClick={() => setFocusPreset(5, t('ছোট বিরতি (৫ মি.)', 'Short Break (5m)', language))}
                  className="py-2 ct-btn-radius ct-surface-alt border text-xs font-bold hover:ct-accent-border"
                >
                  5m Break
                </button>
                <button
                  type="button"
                  onClick={() => setFocusPreset(15, t('বড় বিরতি (১৫ মি.)', 'Long Break (15m)', language))}
                  className="py-2 ct-btn-radius ct-surface-alt border text-xs font-bold hover:ct-accent-border"
                >
                  15m Rest
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (focusRemainingSec === 0) setFocusRemainingSec(focusDurationSec);
                    setFocusRunning((r) => !r);
                  }}
                  className={`flex-1 py-2.5 ct-btn-radius text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 min-h-[42px] transition-colors ${
                    focusRunning
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {focusRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{focusRunning ? t('বিরতি', 'Pause', language) : t('শুরু করুন', 'Start Focus', language)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusRunning(false);
                    setFocusRemainingSec(focusDurationSec);
                  }}
                  className="px-4 py-2.5 ct-btn-radius bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 min-h-[42px]"
                  aria-label="Reset timer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. SECURE POCKET VAULT */}
      {activeTool === 'vault' && (
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('সুরক্ষিত পকেট ভল্ট', 'Secure Pocket Vault', language)}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'ব্যাংক অ্যাকাউন্ট, NID/পাসপোর্ট নম্বর, কার্ড, ওয়াইফাই পাসওয়ার্ড ও ওয়ারেন্টি তারিখ এক ট্যাপে রাখুন',
                    'Keep bank numbers, NID/passport, card IDs, Wi-Fi passwords & warranty expiries handy',
                    language
                  )}
                </p>
              </div>
            </div>
            {vaultUnlocked && (
              <div className="flex flex-wrap items-center gap-2">
                {userPin && userPin.length === 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      setVaultUnlocked(false);
                      setVaultPinInput('');
                      setRevealedVaultIds({});
                    }}
                    className="px-3 py-2 ct-btn-radius bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{t('লক করুন', 'Lock', language)}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openVaultEditor()}
                  className="px-3.5 py-2 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('নতুন তথ্য', 'Add Item', language)}</span>
                </button>
              </div>
            )}
          </div>

          {!vaultUnlocked && userPin && userPin.length === 4 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (vaultPinInput === userPin) {
                  setVaultUnlocked(true);
                  setVaultPinError(false);
                  setVaultPinInput('');
                } else {
                  setVaultPinError(true);
                }
              }}
              className="max-w-xs mx-auto py-8 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl ct-accent-soft flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('ভল্ট আনলক করতে আপনার ৪-সংখ্যার পিন দিন', 'Enter 4-digit app PIN to unlock Vault', language)}
                </h3>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={vaultPinInput}
                onChange={(e) => {
                  setVaultPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setVaultPinError(false);
                }}
                placeholder="••••"
                className="w-full text-center tracking-[0.5em] text-xl font-mono font-bold ct-surface-alt border ct-btn-radius px-4 py-3 outline-none"
              />
              {vaultPinError && (
                <p className="text-xs text-rose-600 font-semibold">
                  {t('ভুল পিন! আবার চেষ্টা করুন।', 'Incorrect PIN. Please try again.', language)}
                </p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Unlock className="w-4 h-4" />
                <span>{t('ভল্ট খুলুন', 'Unlock Vault', language)}</span>
              </button>
            </form>
          ) : (
            <>
              {/* Category Filters */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1 w-full max-w-full">
                {(
                  [
                    {id: 'all', bn: 'সব', en: 'All'},
                    {id: 'bank', bn: 'ব্যাংক', en: 'Bank'},
                    {id: 'id', bn: 'NID / পাসপোর্ট', en: 'ID / Passport'},
                    {id: 'card', bn: 'কার্ড', en: 'Cards'},
                    {id: 'wifi', bn: 'ওয়াইফাই', en: 'Wi-Fi'},
                    {id: 'warranty', bn: 'ওয়ারেন্টি', en: 'Warranty'},
                    {id: 'other', bn: 'অন্যান্য', en: 'Other'},
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setVaultCatFilter(cat.id)}
                    className={`px-3 py-1.5 ct-btn-radius text-xs font-bold whitespace-nowrap transition-colors ${
                      vaultCatFilter === cat.id
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'ct-surface-alt text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {language === 'bn' ? cat.bn : cat.en}
                  </button>
                ))}
              </div>

              {filteredVaultItems.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <KeyRound className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('ভল্টে কোনো তথ্য সেভ করা নেই।', 'No items saved in your Pocket Vault yet.', language)}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredVaultItems.map((item) => {
                    const isRevealed = Boolean(revealedVaultIds[item.id]);
                    const todayStr = getLocalDateStr();
                    let expiryWarning: 'expired' | 'soon' | null = null;
                    if (item.expiryDate) {
                      if (item.expiryDate < todayStr) {
                        expiryWarning = 'expired';
                      } else {
                        const diffDays =
                          (new Date(item.expiryDate).getTime() - new Date(todayStr).getTime()) /
                          (1000 * 60 * 60 * 24);
                        if (diffDays <= 30) expiryWarning = 'soon';
                      }
                    }

                    return (
                      <div key={item.id} className="p-4 ct-surface-alt border ct-btn-radius space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {item.label}
                            </p>
                            <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {item.category}
                              {item.expiryDate ? ` · ${t('মেয়াদ', 'Exp', language)}: ${item.expiryDate}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openVaultEditor(item)}
                              className="p-1.5 text-slate-400 hover:ct-accent-text rounded-lg"
                              aria-label="Edit vault item"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVaultItem?.(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                              aria-label="Delete vault item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {expiryWarning && (
                          <p
                            className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                              expiryWarning === 'expired'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            {expiryWarning === 'expired'
                              ? t('মেয়াদ উত্তীর্ণ হয়েছে!', 'Expired!', language)
                              : t('শীঘ্রই মেয়াদ শেষ হচ্ছে', 'Expiring within 30 days', language)}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2">
                          <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                            {isRevealed ? item.value : '••••••••••••'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedVaultIds((prev) => ({...prev, [item.id]: !prev[item.id]}))
                              }
                              className="p-1.5 text-slate-500 hover:ct-accent-text rounded-lg"
                              aria-label={isRevealed ? 'Hide secret' : 'Reveal secret'}
                            >
                              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopySecret(item.value)}
                              className="p-1.5 text-slate-500 hover:ct-accent-text rounded-lg"
                              aria-label="Copy secret"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {item.note && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{item.note}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 10. DIGITAL VISITING & PAYMENT QR CARD */}
      {activeTool === 'qrcard' && (
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('ডিজিটাল পেমেন্ট ও ভিজিটিং QR কার্ড', 'Digital Payment & Contact QR Card', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('পেমেন্ট নম্বর, Wi-Fi বা ডিজিটাল ভিজিটিং কার্ড তাৎক্ষণিক QR কোডে রূপান্তর ও ডাউনলোড করুন', 'Generate scannable QR cards for Payment info, Wi-Fi login, or Contact vCard', language)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDownloadQRCard()}
              className="px-4 py-2 ct-btn-radius bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{t('QR কার্ড সেভ / শেয়ার', 'Export QR Card PNG', language)}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start min-w-0">
            <div className="lg:col-span-7 space-y-3.5 min-w-0">
              <div className="grid grid-cols-3 gap-1.5 p-1 ct-surface-alt border ct-btn-radius">
                {(
                  [
                    {id: 'payment', bn: 'পেমেন্ট তথ্য', en: 'Payment'},
                    {id: 'wifi', bn: 'Wi-Fi শেয়ার', en: 'Wi-Fi'},
                    {id: 'vcard', bn: 'ভিজিটিং কার্ড', en: 'vCard'},
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setQrMode(m.id)}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                      qrMode === m.id
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {language === 'bn' ? m.bn : m.en}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {qrMode === 'wifi'
                      ? t('কার্ড শিরোনাম', 'Card Heading', language)
                      : t('নাম / প্রতিষ্ঠান', 'Name / Business Title', language)}
                  </label>
                  <input
                    type="text"
                    value={qrTitle}
                    onChange={(e) => setQrTitle(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-semibold outline-none"
                  />
                </div>

                {qrMode === 'payment' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {t('বিকাশ / নগদ / ব্যাংক অ্যাকাউন্ট নম্বর', 'MFS / Bank / Payment Info', language)}
                      </label>
                      <input
                        type="text"
                        value={qrPayAccount}
                        onChange={(e) => setQrPayAccount(e.target.value)}
                        placeholder="bKash Personal: 017XXXXXXXX"
                        className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {t(`নির্ধারিত টাকা (ঐচ্ছিক - ${displayCurrency})`, `Requested Amount (Optional - ${displayCurrency})`, language)}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qrPayAmount}
                        onChange={(e) => setQrPayAmount(e.target.value)}
                        placeholder="500"
                        className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono font-bold outline-none"
                      />
                    </div>
                  </>
                )}

                {qrMode === 'wifi' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {t('Wi-Fi নেটওয়ার্ক নাম (SSID)', 'Wi-Fi Network Name (SSID)', language)}
                      </label>
                      <input
                        type="text"
                        value={qrWifiSsid}
                        onChange={(e) => setQrWifiSsid(e.target.value)}
                        className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {t('সিকিউরিটি', 'Security', language)}
                        </label>
                        <select
                          value={qrWifiEnc}
                          onChange={(e) => setQrWifiEnc(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                          className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-sm font-semibold outline-none"
                        >
                          <option value="WPA">WPA / WPA2</option>
                          <option value="WEP">WEP</option>
                          <option value="nopass">{t('পাসওয়ার্ড ছাড়া', 'Open (None)', language)}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {t('পাসওয়ার্ড', 'Password', language)}
                        </label>
                        <input
                          type="text"
                          value={qrWifiPass}
                          disabled={qrWifiEnc === 'nopass'}
                          onChange={(e) => setQrWifiPass(e.target.value)}
                          className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono outline-none disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </>
                )}

                {qrMode === 'vcard' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {t('মোবাইল নম্বর', 'Phone Number', language)}
                        </label>
                        <input
                          type="tel"
                          value={qrVcardPhone}
                          onChange={(e) => setQrVcardPhone(e.target.value)}
                          placeholder="+8801XXXXXXXXX"
                          className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {t('ইমেইল', 'Email Address', language)}
                        </label>
                        <input
                          type="email"
                          value={qrVcardEmail}
                          onChange={(e) => setQrVcardEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {t('প্রতিষ্ঠান / পদবী', 'Company / Role', language)}
                      </label>
                      <input
                        type="text"
                        value={qrVcardOrg}
                        onChange={(e) => setQrVcardOrg(e.target.value)}
                        placeholder={t('যেমন: Founder, ABC Studio', 'e.g. Founder, ABC Studio', language)}
                        className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm outline-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Live QR Card Preview */}
            <div className="lg:col-span-5 flex flex-col items-center p-5 rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-sm space-y-3">
              <div className="text-center space-y-0.5">
                <p className="text-sm font-bold">{qrTitle || 'CashTrace QR'}</p>
                <p className="text-xs text-slate-500">
                  {qrMode === 'wifi'
                    ? `Wi-Fi: ${qrWifiSsid}`
                    : qrMode === 'vcard'
                    ? qrVcardPhone || qrVcardOrg || 'Contact vCard'
                    : qrPayAccount}
                </p>
              </div>
              <div className="p-2 rounded-xl border border-slate-200 bg-white max-w-full">
                <canvas ref={qrCanvasRef} width={240} height={240} className="block max-w-full h-auto" />
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                {t('যেকোনো ক্যামেরা দিয়ে স্ক্যান করুন', 'Scan with any smartphone camera', language)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 11. BUSINESS INVOICE & QUOTATION PDF MAKER */}
      {activeTool === 'invoice' && (
        <div className="ct-surface-card border p-4 sm:p-6 space-y-5 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('প্রফেশনাল ইনভয়েস ও কোটেশন PDF মেকার', 'Business Invoice & Quotation PDF Maker', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('ব্যবসা, দোকান বা ফ্রিল্যান্স ক্লায়েন্টের জন্য A4 ইনভয়েস ও কোটেশন PDF তৈরি করুন', 'Generate crisp A4 client invoices & quotations with VAT, discount & WhatsApp share', language)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportingInvPdf}
                onClick={() => void handleDownloadInvoicePDF()}
                className="px-3.5 py-2 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] disabled:opacity-60 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{exportingInvPdf ? t('তৈরি হচ্ছে...', 'Generating...', language) : t('ইনভয়েস PDF', 'Download PDF', language)}</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(invoiceShareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => void handleCopySecret(invoiceShareText)}
                className="px-3 py-2 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('কপি', 'Copy', language)}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0">
            {/* Builder Form */}
            <div className="lg:col-span-7 space-y-3.5 min-w-0">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {id: 'DUE', bn: 'বাকি (DUE)', en: 'DUE'},
                    {id: 'PAID', bn: 'পরিশোধিত (PAID)', en: 'PAID'},
                    {id: 'QUOTE', bn: 'কোটেশন (QUOTE)', en: 'QUOTATION'},
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setInvStatus(st.id)}
                    className={`py-2 ct-btn-radius border text-xs font-bold transition-colors ${
                      invStatus === st.id
                        ? st.id === 'PAID'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : st.id === 'DUE'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-sky-600 text-white border-sky-600'
                        : 'ct-surface-alt text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {language === 'bn' ? st.bn : st.en}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={invNo}
                  onChange={(e) => setInvNo(e.target.value)}
                  placeholder="INV-001"
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none"
                />
                <input
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
                <input
                  type="date"
                  value={invDueDate}
                  onChange={(e) => setInvDueDate(e.target.value)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                  title={t('পরিশোধের শেষ তারিখ', 'Due date (optional)', language)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={invBizName}
                  onChange={(e) => setInvBizName(e.target.value)}
                  placeholder={t('আপনার ব্যবসার নাম *', 'Your Business Name *', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-semibold outline-none"
                />
                <input
                  type="text"
                  value={invBizContact}
                  onChange={(e) => setInvBizContact(e.target.value)}
                  placeholder={t('আপনার ফোন / ঠিকানা', 'Business Phone / Address', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
                <input
                  type="text"
                  value={invClientName}
                  onChange={(e) => setInvClientName(e.target.value)}
                  placeholder={t('গ্রাহকের নাম', 'Client Name', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-semibold outline-none"
                />
                <input
                  type="text"
                  value={invClientContact}
                  onChange={(e) => setInvClientContact(e.target.value)}
                  placeholder={t('গ্রাহকের ফোন / ঠিকানা', 'Client Phone / Address', language)}
                  className="w-full min-w-0 ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {t('পণ্য / সার্ভিস তালিকা', 'Line Items', language)}
                </p>
                {invItems.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1.5 items-center min-w-0">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) =>
                        setInvItems((prev) =>
                          prev.map((x, i) => (i === idx ? {...x, name: e.target.value} : x))
                        )
                      }
                      placeholder={t('বিবরণ', 'Description', language)}
                      className="col-span-5 w-full min-w-0 ct-surface-alt border ct-btn-radius px-2 py-2 text-xs outline-none"
                    />
                    <input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) =>
                        setInvItems((prev) =>
                          prev.map((x, i) => (i === idx ? {...x, qty: Math.max(1, Number(e.target.value) || 1)} : x))
                        )
                      }
                      className="col-span-2 w-full min-w-0 ct-surface-alt border ct-btn-radius px-1.5 py-2 text-xs font-mono font-bold outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.unitPrice}
                      onChange={(e) =>
                        setInvItems((prev) =>
                          prev.map((x, i) => (i === idx ? {...x, unitPrice: Math.max(0, Number(e.target.value) || 0)} : x))
                        )
                      }
                      className="col-span-4 w-full min-w-0 ct-surface-alt border ct-btn-radius px-2 py-2 text-xs font-mono font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        invItems.length > 1 && setInvItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-1 text-slate-400 hover:text-rose-500 flex justify-center"
                      aria-label="Remove invoice item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setInvItems((prev) => [
                      ...prev,
                      {name: t('নতুন আইটেম', 'New Item', language), qty: 1, unitPrice: 500},
                    ])
                  }
                  className="text-xs font-bold ct-accent-text hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('আরো লাইন যোগ করুন', 'Add Item Row', language)}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {t('ডিসকাউন্ট (%)', 'Discount (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invDiscountPctText}
                    onChange={(e) => setInvDiscountPctText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {t('ভ্যাট / ট্যাক্স (%)', 'VAT / Tax (%)', language)}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invVatPctText}
                    onChange={(e) => setInvVatPctText(e.target.value)}
                    className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              <input
                type="text"
                value={invPaymentNote}
                onChange={(e) => setInvPaymentNote(e.target.value)}
                placeholder={t('পেমেন্ট নির্দেশনা (যেমন: বিকাশ 017..., ডেলিভারির পরে পরিশোধ)', 'Payment note (e.g. bKash / Bank info)', language)}
                className="w-full ct-surface-alt border ct-btn-radius px-3 py-2 text-xs outline-none"
              />
            </div>

            {/* Clean A4 Invoice Live Preview */}
            <div className="lg:col-span-5 p-5 ct-surface-alt border ct-btn-radius space-y-4">
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {invBizName || 'CashTrace Business'}
                  </h3>
                  {invBizContact && <p className="text-[11px] text-slate-500">{invBizContact}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold ct-accent-text">
                    {invStatus === 'QUOTE' ? 'QUOTATION' : 'INVOICE'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">#{invNo}</p>
                  <p
                    className={`text-[11px] font-bold mt-0.5 ${
                      invStatus === 'PAID'
                        ? 'text-emerald-600'
                        : invStatus === 'DUE'
                        ? 'text-rose-600'
                        : 'text-sky-600'
                    }`}
                  >
                    {invStatus}
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-0.5">
                <p className="text-[11px] font-bold uppercase text-slate-400">
                  {t('গ্রাহক', 'Bill To', language)}
                </p>
                <p className="font-bold text-slate-900 dark:text-white">
                  {invClientName || t('সম্মানিত গ্রাহক', 'Valued Client', language)}
                </p>
                {invClientContact && <p className="text-slate-500">{invClientContact}</p>}
                <p className="text-[11px] text-slate-500 pt-1">
                  {t('তারিখ', 'Date', language)}: {invDate}
                  {invDueDate ? ` · ${t('শেষ তারিখ', 'Due', language)}: ${invDueDate}` : ''}
                </p>
              </div>

              <div className="border-t border-b border-slate-200 dark:border-slate-700 py-2.5 space-y-1.5 text-xs">
                {invItems.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {it.name} ({it.qty} × {displayCurrency}{it.unitPrice})
                    </span>
                    <span className="font-bold tabular-nums shrink-0">
                      {formatMoney(it.qty * it.unitPrice, displayCurrency, language)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>{t('সাবটোটাল', 'Subtotal', language)}</span>
                  <span className="tabular-nums">{formatMoney(invSubtotal, displayCurrency, language)}</span>
                </div>
                {invDiscountAmt > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>{t('ডিসকাউন্ট', 'Discount', language)} ({invDiscountPct}%)</span>
                    <span className="tabular-nums">-{formatMoney(invDiscountAmt, displayCurrency, language)}</span>
                  </div>
                )}
                {invVatAmt > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t('ভ্যাট / ট্যাক্স', 'VAT / Tax', language)} ({invVatPct}%)</span>
                    <span className="tabular-nums">+{formatMoney(invVatAmt, displayCurrency, language)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700">
                  <span>{t('সর্বমোট বিল', 'Grand Total', language)}</span>
                  <span className="tabular-nums ct-accent-text">
                    {formatMoney(invGrandTotal, displayCurrency, language)}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
                className="w-full py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold min-h-[42px] transition-colors"
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
                className="w-full py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold min-h-[42px] transition-colors"
              >
                {t('নোট সেভ করুন', 'Save Note', language)}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Vault Add / Edit Modal */}
      {vaultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-md ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingVaultItem ? t('ভল্ট তথ্য সম্পাদনা', 'Edit Vault Item', language) : t('ভল্টে নতুন তথ্য যোগ', 'Add Vault Item', language)}
              </h3>
              <button type="button" onClick={() => setVaultModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveVaultSubmit} className="space-y-3">
              <input
                type="text"
                value={vLabel}
                onChange={(e) => setVLabel(e.target.value)}
                placeholder={t('শিরোনাম * (যেমন: ডাচ-বাংলা অ্যাকাউন্ট / NID)', 'Label * (e.g. City Bank / NID)', language)}
                required
                autoFocus
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-semibold outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={vCategory}
                  onChange={(e) => setVCategory(e.target.value as VaultCategory)}
                  className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-xs font-semibold outline-none"
                >
                  <option value="bank">{t('ব্যাংক তথ্য', 'Bank', language)}</option>
                  <option value="id">{t('NID / পাসপোর্ট', 'ID / Passport', language)}</option>
                  <option value="card">{t('কার্ড নম্বর', 'Card', language)}</option>
                  <option value="wifi">{t('ওয়াইফাই পাসওয়ার্ড', 'Wi-Fi', language)}</option>
                  <option value="warranty">{t('ওয়ারেন্টি', 'Warranty', language)}</option>
                  <option value="other">{t('অন্যান্য', 'Other', language)}</option>
                </select>
                <input
                  type="date"
                  value={vExpiry}
                  onChange={(e) => setVExpiry(e.target.value)}
                  className="w-full ct-surface-alt border ct-btn-radius px-3 py-2.5 text-xs outline-none"
                  title={t('মেয়াদ শেষ তারিখ (ঐচ্ছিক)', 'Expiry date (optional)', language)}
                />
              </div>
              <input
                type="text"
                value={vValue}
                onChange={(e) => setVValue(e.target.value)}
                placeholder={t('নম্বর / পাসওয়ার্ড / কোড *', 'Secret value / number *', language)}
                required
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-sm font-mono font-bold outline-none"
              />
              <input
                type="text"
                value={vNote}
                onChange={(e) => setVNote(e.target.value)}
                placeholder={t('সংক্ষিপ্ত নোট (যেমন: ব্রাঞ্চ বা পণ্যের নাম)', 'Optional note (branch, item name)', language)}
                className="w-full ct-surface-alt border ct-btn-radius px-3.5 py-2.5 text-xs outline-none"
              />
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold min-h-[42px] transition-colors"
              >
                {t('ভল্টে সেভ করুন', 'Save to Vault', language)}
              </button>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
