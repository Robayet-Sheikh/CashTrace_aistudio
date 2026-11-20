import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  AlertCircle,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  Plus,
  Receipt,
  Send,
  ShoppingBasket,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {
  AiAdvisorResult,
  AiParsedTransaction,
  AiScanShoppingItem,
  requestAiLedgerChat,
  requestAiMonthlyAdvisor,
  requestAiScanReceipt,
  requestAiSmartEntry,
} from '../services/aiService';
import {
  CashTraceState,
  LanguageCode,
  Transaction,
} from '../types';
import {computeDueAlerts} from '../utils/dueAlerts';
import {formatMoney, formatMonthTitle, getLocalDateStr} from '../utils/formatters';
import {t} from '../utils/i18n';

export type AiHubTab = 'entry' | 'scanner' | 'advisor' | 'chat';

interface AIAssistantModalProps {
  isOpen: boolean;
  initialTab?: AiHubTab;
  onClose: () => void;
  state: CashTraceState;
  selectedMonthKey: string;
  language: LanguageCode;
  onSaveTransactionsBatch: (txs: Array<Omit<Transaction, 'id' | 'createdAt'>>) => void;
  onCreateShoppingListFromItems?: (title: string, items: AiScanShoppingItem[]) => void;
  onShowToast: (msg: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  initialTab = 'entry',
  onClose,
  state,
  selectedMonthKey,
  language,
  onSaveTransactionsBatch,
  onCreateShoppingListFromItems,
  onShowToast,
}) => {
  const {displayCurrency, convertToBase} = useCurrency();
  const [activeTab, setActiveTab] = useState<AiHubTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // ── 1. Smart Text & Voice Entry State ──
  const [entryText, setEntryText] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryTranscript, setEntryTranscript] = useState('');
  const [parsedEntries, setParsedEntries] = useState<AiParsedTransaction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // ── 2. Receipt & SMS Scanner State ──
  const [scanText, setScanText] = useState('');
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanImageFile, setScanImageFile] = useState<{base64: string; mimeType: string} | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMerchant, setScanMerchant] = useState('');
  const [scanSummary, setScanSummary] = useState('');
  const [scannedTxs, setScannedTxs] = useState<AiParsedTransaction[]>([]);
  const [scannedShopItems, setScannedShopItems] = useState<AiScanShoppingItem[]>([]);

  // ── 3. Monthly Advisor State ──
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [advisorResult, setAdvisorResult] = useState<AiAdvisorResult | null>(null);

  // ── 4. Chat Assistant State ──
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [chatMessages, chatBusy]);

  // Stop active voice recording on unmount or modal close
  useEffect(() => {
    if (!isOpen && isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    }
  }, [isOpen, isRecording]);

  // Computed live financial context for Advisor & Chat
  const financialSnapshot = useMemo(() => {
    const mStore = state.months[selectedMonthKey] || {budgetCap: 0, transactions: []};
    const txs = mStore.transactions || [];
    const totalIncome = txs.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0);
    const totalExpense = txs.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    const catMap = new Map<string, number>();
    txs
      .filter((x) => x.type === 'expense')
      .forEach((x) => catMap.set(x.category, (catMap.get(x.category) || 0) + x.amount));
    const topCategories = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, amount]) => ({name, amount}));

    const walletMap = new Map<string, number>();
    state.wallets.forEach((w) => walletMap.set(w.id, w.initialBalance || 0));
    Object.values(state.months).forEach((m) => {
      (m.transactions || []).forEach((tx) => {
        if (tx.type === 'income') walletMap.set(tx.walletId, (walletMap.get(tx.walletId) || 0) + tx.amount);
        else if (tx.type === 'expense') walletMap.set(tx.walletId, (walletMap.get(tx.walletId) || 0) - tx.amount);
        else if (tx.type === 'transfer') {
          walletMap.set(tx.walletId, (walletMap.get(tx.walletId) || 0) - tx.amount);
          if (tx.toWalletId) walletMap.set(tx.toWalletId, (walletMap.get(tx.toWalletId) || 0) + tx.amount);
        }
      });
    });
    const walletsSummary = state.wallets.map((w) => ({
      name: w.name,
      balance: Math.round(walletMap.get(w.id) || 0),
    }));
    const totalWalletBalance = walletsSummary.reduce((s, w) => s + w.balance, 0);

    let receivable = 0;
    let payable = 0;
    const pendingDebts = (state.debts || [])
      .filter((d) => !d.settled && d.amount - d.paidAmount > 0)
      .map((d) => {
        const rem = d.amount - d.paidAmount;
        if (d.type === 'lent') receivable += rem;
        else payable += rem;
        return {
          person: d.personName,
          type: d.type,
          remaining: rem,
          dueDate: d.dueDate || null,
        };
      })
      .slice(0, 12);

    const dueAlerts = computeDueAlerts({
      recurringBills: state.recurringBills,
      debts: state.debts,
      vaultItems: state.vaultItems,
    });

    return {
      monthTitle: formatMonthTitle(selectedMonthKey, language),
      currency: state.profile.baseCurrency || state.profile.currency || displayCurrency,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      budgetCap: mStore.budgetCap || 0,
      totalWalletBalance,
      wallets: walletsSummary,
      receivable,
      payable,
      pendingDebts,
      topCategories,
      dailyAvg: Math.round(totalExpense / Math.max(1, new Date().getDate())),
      upcomingDueCount: dueAlerts.length,
      upcomingDueTotal: dueAlerts.reduce((s, a) => s + (a.amount || 0), 0),
      savingsGoals: (state.savingsGoals || []).map((g) => ({
        title: g.title,
        saved: g.saved,
        target: g.target,
      })),
    };
  }, [state, selectedMonthKey, language, displayCurrency]);

  const walletNameMap = useMemo(
    () => new Map(state.wallets.map((w) => [w.id, w.name])),
    [state.wallets]
  );

  // ── Smart Entry Handlers ──
  const handleRunSmartEntryText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!entryText.trim() || entryBusy) return;
    setEntryBusy(true);
    setEntryError(null);
    try {
      const res = await requestAiSmartEntry({
        text: entryText.trim(),
        categories: state.categories,
        wallets: state.wallets,
        currency: displayCurrency,
        language,
        todayDate: getLocalDateStr(),
      });
      setEntryTranscript(res.transcript || entryText.trim());
      setParsedEntries(res.transactions || []);
      if (!res.transactions || res.transactions.length === 0) {
        setEntryError(
          t('কোনো লেনদেন শনাক্ত করা যায়নি। টাকার পরিমাণসহ আবার লিখুন।', 'No transactions detected. Please include an amount.', language)
        );
      }
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'AI error');
    } finally {
      setEntryBusy(false);
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setEntryError(
        t('এই ব্রাউজারে মাইক্রোফোন রেকর্ডিং সমর্থিত নয়।', 'Microphone recording is not supported in this browser.', language)
      );
      return;
    }

    setEntryError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
      recordChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const audioBlob = new Blob(recordChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (audioBlob.size < 400) return;
        setEntryBusy(true);
        setEntryError(null);
        try {
          const audioBase64 = await fileToBase64(audioBlob);
          const res = await requestAiSmartEntry({
            audioBase64,
            audioMimeType: audioBlob.type || 'audio/webm',
            categories: state.categories,
            wallets: state.wallets,
            currency: displayCurrency,
            language,
            todayDate: getLocalDateStr(),
          });
          setEntryTranscript(res.transcript || '');
          setParsedEntries(res.transactions || []);
          if (!res.transactions || res.transactions.length === 0) {
            setEntryError(
              t('ভয়েস থেকে লেনদেন পাওয়া যায়নি। স্পষ্ট করে টাকার পরিমাণ বলুন।', 'Could not extract a transaction from voice.', language)
            );
          }
        } catch (err) {
          setEntryError(err instanceof Error ? err.message : 'Voice AI failed');
        } finally {
          setEntryBusy(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 29) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
            return 30;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setEntryError(
        t('মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি।', 'Microphone permission denied.', language)
      );
    }
  };

  const handleSaveParsedEntries = (
    list: AiParsedTransaction[],
    clearFn: () => void
  ) => {
    const valid = list.filter((tx) => Number.isFinite(tx.amount) && tx.amount > 0 && tx.title.trim());
    if (valid.length === 0) return;
    const mapped: Array<Omit<Transaction, 'id' | 'createdAt'>> = valid.map((tx) => ({
      type: tx.type === 'income' || tx.type === 'transfer' ? tx.type : 'expense',
      title: tx.title.trim().slice(0, 120),
      amount: convertToBase(tx.amount),
      category: tx.category || state.categories[0]?.name || 'Other',
      walletId: state.wallets.some((w) => w.id === tx.walletId)
        ? tx.walletId
        : state.wallets[0]?.id || 'cash',
      date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? tx.date : getLocalDateStr(),
      subcategory: tx.subcategory || 'AI Smart Entry',
    }));
    onSaveTransactionsBatch(mapped);
    clearFn();
    onShowToast(
      t(`${mapped.length} টি লেনদেন সফলভাবে সেভ হয়েছে!`, `Saved ${mapped.length} transaction(s)!`, language)
    );
  };

  // ── Scanner Handlers ──
  const handleSelectReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    try {
      const base64 = await fileToBase64(file);
      const preview = URL.createObjectURL(file);
      setScanPreviewUrl(preview);
      setScanImageFile({base64, mimeType: file.type || 'image/jpeg'});
    } catch {
      setScanError(t('ছবি পড়া যায়নি', 'Failed to read image', language));
    }
    e.target.value = '';
  };

  const handleRunScan = async () => {
    if ((!scanImageFile && !scanText.trim()) || scanBusy) return;
    setScanBusy(true);
    setScanError(null);
    try {
      const res = await requestAiScanReceipt({
        imageBase64: scanImageFile?.base64,
        imageMimeType: scanImageFile?.mimeType,
        rawText: scanText.trim() || undefined,
        categories: state.categories,
        wallets: state.wallets,
        currency: displayCurrency,
        language,
        todayDate: getLocalDateStr(),
      });
      setScanMerchant(res.merchantOrSource || '');
      setScanSummary(res.summary || '');
      setScannedTxs(res.transactions || []);
      setScannedShopItems(res.shoppingItems || []);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanBusy(false);
    }
  };

  // ── Advisor Handler ──
  const handleGenerateAdvisor = async () => {
    if (advisorBusy) return;
    setAdvisorBusy(true);
    setAdvisorError(null);
    try {
      const res = await requestAiMonthlyAdvisor({
        monthTitle: financialSnapshot.monthTitle,
        currency: displayCurrency,
        language,
        summary: {
          totalIncome: financialSnapshot.totalIncome,
          totalExpense: financialSnapshot.totalExpense,
          netBalance: financialSnapshot.netBalance,
          budgetCap: financialSnapshot.budgetCap,
          totalWalletBalance: financialSnapshot.totalWalletBalance,
          receivable: financialSnapshot.receivable,
          payable: financialSnapshot.payable,
          topCategories: financialSnapshot.topCategories,
          dailyAvg: financialSnapshot.dailyAvg,
          upcomingDueCount: financialSnapshot.upcomingDueCount,
          upcomingDueTotal: financialSnapshot.upcomingDueTotal,
        },
      });
      setAdvisorResult(res);
    } catch (err) {
      setAdvisorError(err instanceof Error ? err.message : 'Advisor failed');
    } finally {
      setAdvisorBusy(false);
    }
  };

  // ── Chat Handler ──
  const handleSendChat = async (preset?: string) => {
    const q = (preset ?? chatInput).trim();
    if (!q || chatBusy) return;
    const userMsg: ChatMessage = {id: `u_${Date.now()}`, role: 'user', text: q};
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    if (!preset) setChatInput('');
    setChatBusy(true);
    setChatError(null);
    try {
      const {reply} = await requestAiLedgerChat({
        message: q,
        history: nextHistory.map((m) => ({role: m.role, text: m.text})),
        financialContext: financialSnapshot,
        language,
      });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: reply || t('কোনো উত্তর পাওয়া যায়নি।', 'No reply returned.', language),
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setChatBusy(false);
    }
  };

  const tabs: Array<{
    id: AiHubTab;
    bn: string;
    en: string;
    activeCls: string;
    idleCls: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'entry',
      bn: 'ভয়েস ও এন্ট্রি',
      en: 'Voice & Entry',
      activeCls: 'bg-emerald-600 text-white shadow-sm',
      idleCls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
      icon: <Mic className="w-3.5 h-3.5" />,
    },
    {
      id: 'scanner',
      bn: 'রসিদ ও SMS',
      en: 'Receipt & SMS',
      activeCls: 'bg-amber-500 text-white shadow-sm',
      idleCls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
      icon: <Receipt className="w-3.5 h-3.5" />,
    },
    {
      id: 'advisor',
      bn: 'মাসিক উপদেষ্টা',
      en: 'AI Advisor',
      activeCls: 'bg-violet-600 text-white shadow-sm',
      idleCls: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
      icon: <TrendingUp className="w-3.5 h-3.5" />,
    },
    {
      id: 'chat',
      bn: 'AI চ্যাট',
      en: 'Ask AI',
      activeCls: 'bg-sky-600 text-white shadow-sm',
      idleCls: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
    },
  ];

  const starterPrompts =
    language === 'bn'
      ? [
          'এই মাসে সবচেয়ে বেশি খরচ কোথায় হয়েছে?',
          'কোন বাকিগুলো আগে শোধ করা উচিত?',
          'বন্ধুকে বাকি ফেরত চেয়ে ভদ্র তাগাদা মেসেজ লিখে দাও',
        ]
      : [
          'Where did I spend the most this month?',
          'Which pending debts should I prioritize?',
          'Draft a polite debt payment reminder message',
        ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.16}}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{opacity: 0, y: 24, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: 18, scale: 0.98}}
            transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
            className="w-full sm:max-w-2xl ct-surface-card border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                    {t('CashTrace AI স্টুডিও', 'CashTrace AI Studio', language)}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t('ভয়েস এন্ট্রি · রসিদ/SMS স্ক্যান · মাসিক পরামর্শ · স্মার্ট চ্যাট', 'Voice entry · Receipt/SMS scan · Advisor · Chat', language)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] min-w-[38px] rounded-xl ct-surface-alt flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white"
                aria-label="Close AI Studio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4-Tab Bar */}
            <div className="px-3 sm:px-5 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {tabs.map((tb) => {
                const active = activeTab === tb.id;
                return (
                  <button
                    key={tb.id}
                    type="button"
                    onClick={() => setActiveTab(tb.id)}
                    className={`min-h-[40px] px-2.5 py-2 ct-btn-radius text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                      active ? tb.activeCls : tb.idleCls
                    }`}
                  >
                    {tb.icon}
                    <span className="truncate">{language === 'bn' ? tb.bn : tb.en}</span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <AnimatePresence mode="wait">
                {/* ── TAB 1: VOICE & SMART ENTRY ── */}
                {activeTab === 'entry' && (
                  <motion.div
                    key="tab_entry"
                    initial={{opacity: 0, y: 6}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.16}}
                    className="space-y-4"
                  >
                    <form onSubmit={handleRunSmartEntryText} className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {t(
                          'বাংলা বা ইংরেজিতে লিখুন অথবা মাইক্রোফোনে মুখে বলুন (একসাথে একাধিক হিসাবও বলা যাবে)',
                          'Type naturally or record voice (supports multiple transactions at once)',
                          language
                        )}
                      </label>
                      <textarea
                        rows={3}
                        value={entryText}
                        onChange={(e) => setEntryText(e.target.value)}
                        placeholder={t(
                          'যেমন: "আজ সকালে বিকাশে ২৫০ টাকা দিয়ে বাজার করলাম, আর দুপুরে রিকশা ভাড়া ৪০ টাকা ক্যাশে দিয়েছি"',
                          'e.g. "Paid 450 for lunch via card today and 60 cash for coffee"',
                          language
                        )}
                        className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleToggleRecording}
                          disabled={entryBusy}
                          className={`min-h-[44px] px-4 py-2.5 ct-btn-radius text-xs font-bold inline-flex items-center gap-2 transition-all ${
                            isRecording
                              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                          }`}
                        >
                          {isRecording ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {t(`থামুন (${recordSeconds}s)`, `Stop (${recordSeconds}s)`, language)}
                              </span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-4 h-4" />
                              <span>{t('ভয়েস বলুন', 'Record Voice', language)}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="submit"
                          disabled={entryBusy || !entryText.trim()}
                          className="flex-1 min-h-[44px] px-4 py-2.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {entryBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          <span>
                            {entryBusy
                              ? t('বিশ্লেষণ হচ্ছে...', 'Extracting...', language)
                              : t('AI দিয়ে এন্ট্রি তৈরি করুন', 'Parse with AI', language)}
                          </span>
                        </button>
                      </div>
                    </form>

                    {entryError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{entryError}</span>
                      </div>
                    )}

                    {parsedEntries.length > 0 && (
                      <div className="space-y-3 pt-1">
                        {entryTranscript && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('শনাক্তকৃত:', 'Detected:', language)} "{entryTranscript}"
                          </p>
                        )}
                        <div className="space-y-2">
                          {parsedEntries.map((item, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[10px] font-bold uppercase ${
                                      item.type === 'income'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {item.type === 'income' ? t('আয়', 'INC', language) : t('খরচ', 'EXP', language)}
                                  </span>
                                  <span className="text-slate-300 dark:text-slate-600">·</span>
                                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {item.title}
                                  </p>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {item.category} · {walletNameMap.get(item.walletId) || state.wallets[0]?.name || 'Cash'} · {item.date}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                                  {formatMoney(item.amount, displayCurrency, language)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setParsedEntries((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1.5 text-slate-400 hover:text-rose-600"
                                  aria-label="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveParsedEntries(parsedEntries, () => {
                              setParsedEntries([]);
                              setEntryText('');
                              setEntryTranscript('');
                            })
                          }
                          className="w-full min-h-[44px] py-2.5 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>
                            {t(
                              `${parsedEntries.length} টি লেনদেন সেভ করুন`,
                              `Save ${parsedEntries.length} Transaction(s)`,
                              language
                            )}
                          </span>
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── TAB 2: RECEIPT PHOTO & SMS/STATEMENT SCANNER ── */}
                {activeTab === 'scanner' && (
                  <motion.div
                    key="tab_scanner"
                    initial={{opacity: 0, y: 6}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.16}}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="min-h-[96px] p-3 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700/80 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-amber-500 transition-colors text-center">
                        <Camera className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          {scanImageFile
                            ? t('অন্য রসিদের ছবি দিন', 'Change Receipt Photo', language)
                            : t('রসিদ / বাজার ফর্দের ছবি দিন', 'Upload Receipt / Memo Photo', language)}
                        </span>
                        <span className="text-[10px] text-amber-700/80 dark:text-amber-300/70">
                          JPG, PNG, WebP
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleSelectReceiptFile}
                        />
                      </label>

                      <textarea
                        rows={4}
                        value={scanText}
                        onChange={(e) => setScanText(e.target.value)}
                        placeholder={t(
                          'অথবা বিকাশ / নগদ / ব্যাংকের একাধিক SMS এখানে পেস্ট করুন...',
                          'Or paste bKash / Nagad / Bank SMS or statement lines here...',
                          language
                        )}
                        className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {scanPreviewUrl && (
                      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl ct-surface-alt border">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={scanPreviewUrl}
                            alt="Receipt preview"
                            className="w-12 h-12 rounded-lg object-cover border shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {t('রসিদ ছবি প্রস্তুত', 'Receipt image ready', language)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setScanImageFile(null);
                            setScanPreviewUrl(null);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                          aria-label="Clear image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRunScan}
                      disabled={scanBusy || (!scanImageFile && !scanText.trim())}
                      className="w-full min-h-[44px] py-2.5 ct-btn-radius bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      {scanBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      <span>
                        {scanBusy
                          ? t('রসিদ ও টেক্সট পড়া হচ্ছে...', 'Scanning Receipt / SMS...', language)
                          : t('AI দিয়ে স্ক্যান ও আলাদা করুন', 'Extract with AI', language)}
                      </span>
                    </button>

                    {scanError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{scanError}</span>
                      </div>
                    )}

                    {(scanSummary || scannedTxs.length > 0 || scannedShopItems.length > 0) && (
                      <div className="space-y-3 pt-1">
                        {scanSummary && (
                          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-100">
                            {scanMerchant && <strong>{scanMerchant}: </strong>}
                            {scanSummary}
                          </div>
                        )}

                        {scannedTxs.length > 0 && (
                          <div className="space-y-2">
                            {scannedTxs.map((tx, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl ct-surface-alt border flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {tx.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {tx.category} · {walletNameMap.get(tx.walletId) || 'Cash'} · {tx.date}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`text-xs sm:text-sm font-bold tabular-nums ${
                                      tx.type === 'income'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {tx.type === 'income' ? '+' : '-'}
                                    {formatMoney(tx.amount, displayCurrency, language)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setScannedTxs((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-1 text-slate-400 hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveParsedEntries(scannedTxs, () => {
                                  setScannedTxs([]);
                                  setScanText('');
                                  setScanImageFile(null);
                                  setScanPreviewUrl(null);
                                })
                              }
                              className="w-full min-h-[42px] py-2 ct-btn-radius bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-4 h-4" />
                              <span>
                                {t(
                                  `${scannedTxs.length} টি লেনদেন খাতায় যোগ করুন`,
                                  `Import ${scannedTxs.length} Transaction(s)`,
                                  language
                                )}
                              </span>
                            </button>
                          </div>
                        )}

                        {scannedShopItems.length > 0 && onCreateShoppingListFromItems && (
                          <div className="p-3 rounded-xl ct-surface-alt border space-y-2">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {t(
                                `শনাক্তকৃত বাজার আইটেম (${scannedShopItems.length}টি)`,
                                `Detected Grocery Items (${scannedShopItems.length})`,
                                language
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {scannedShopItems.map((si, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                >
                                  {si.name}
                                  {si.quantity ? ` (${si.quantity})` : ''}
                                  {si.estimatedPrice
                                    ? ` · ${formatMoney(si.estimatedPrice, displayCurrency, language)}`
                                    : ''}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onCreateShoppingListFromItems(
                                  scanMerchant || t('AI স্ক্যান বাজার লিস্ট', 'AI Scanned List', language),
                                  scannedShopItems
                                );
                                setScannedShopItems([]);
                              }}
                              className="w-full min-h-[40px] py-2 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                            >
                              <ShoppingBasket className="w-4 h-4" />
                              <span>{t('নতুন বাজার লিস্টে সেভ করুন', 'Save as Shopping List', language)}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── TAB 3: MONTHLY AI ADVISOR ── */}
                {activeTab === 'advisor' && (
                  <motion.div
                    key="tab_advisor"
                    initial={{opacity: 0, y: 6}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.16}}
                    className="space-y-4"
                  >
                    <div className="p-4 rounded-2xl ct-surface-alt border flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {financialSnapshot.monthTitle}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {t('আয়', 'Income', language)}: {formatMoney(financialSnapshot.totalIncome, displayCurrency, language)} ·{' '}
                          {t('খরচ', 'Expense', language)}: {formatMoney(financialSnapshot.totalExpense, displayCurrency, language)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateAdvisor}
                        disabled={advisorBusy}
                        className="min-h-[42px] px-4 py-2 ct-btn-radius bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                      >
                        {advisorBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          {advisorBusy
                            ? t('রিপোর্ট তৈরি হচ্ছে...', 'Analyzing...', language)
                            : advisorResult
                            ? t('আবার বিশ্লেষণ করুন', 'Refresh Analysis', language)
                            : t('মাসিক AI রিপোর্ট দেখুন', 'Generate AI Insights', language)}
                        </span>
                      </button>
                    </div>

                    {advisorError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{advisorError}</span>
                      </div>
                    )}

                    {advisorResult ? (
                      <div className="space-y-3">
                        <div className="p-4 rounded-2xl border ct-surface-card space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <CheckCircle2
                              className={`w-4 h-4 ${
                                advisorResult.healthStatus === 'strong'
                                  ? 'text-emerald-600'
                                  : advisorResult.healthStatus === 'caution'
                                  ? 'text-rose-600'
                                  : 'text-amber-500'
                              }`}
                            />
                            <span className="uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {advisorResult.healthStatus === 'strong'
                                ? t('অবস্থা: শক্তিশালী', 'Status: Strong', language)
                                : advisorResult.healthStatus === 'caution'
                                ? t('অবস্থা: সতর্কতা প্রয়োজন', 'Status: Needs Attention', language)
                                : t('অবস্থা: ভারসাম্যপূর্ণ', 'Status: Balanced', language)}
                            </span>
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                            {advisorResult.headline}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {advisorResult.forecastNote}
                          </p>
                        </div>

                        {advisorResult.highlights.length > 0 && (
                          <div className="p-4 rounded-2xl ct-surface-alt border space-y-2">
                            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {t('মূল পর্যবেক্ষণ', 'Key Highlights', language)}
                            </h4>
                            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                              {advisorResult.highlights.map((h, i) => (
                                <li key={i}>{h}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {advisorResult.actionableTips.length > 0 && (
                          <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/70 space-y-2">
                            <h4 className="text-xs font-bold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                              <Lightbulb className="w-4 h-4" />
                              <span>{t('পরবর্তী করণীয় পরামর্শ', 'Actionable Next Steps', language)}</span>
                            </h4>
                            <ul className="space-y-1.5 text-xs text-violet-950 dark:text-violet-100 list-disc pl-4">
                              {advisorResult.actionableTips.map((tip, i) => (
                                <li key={i}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      !advisorBusy && (
                        <div className="py-8 text-center space-y-2">
                          <TrendingUp className="w-8 h-8 text-violet-500/70 mx-auto" />
                          <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {t(
                              'আপনার এই মাসের আয়-ব্যয়, বাজেট ও বাকি খাতার ওপর ভিত্তি করে AI পরামর্শ নিন',
                              'Get personalized AI analysis based on your real monthly ledger & budget',
                              language
                            )}
                          </p>
                        </div>
                      )
                    )}
                  </motion.div>
                )}

                {/* ── TAB 4: CONTEXT-AWARE LEDGER Q&A CHAT ── */}
                {activeTab === 'chat' && (
                  <motion.div
                    key="tab_chat"
                    initial={{opacity: 0, y: 6}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -4}}
                    transition={{duration: 0.16}}
                    className="space-y-3"
                  >
                    {chatMessages.length === 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('দ্রুত প্রশ্ন বেছে নিন অথবা নিচে লিখুন:', 'Pick a quick question or ask below:', language)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {starterPrompts.map((pr, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => void handleSendChat(pr)}
                              className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-900 dark:text-sky-200 text-left hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                            >
                              {pr}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                              msg.role === 'user'
                                ? 'bg-sky-600 text-white'
                                : 'ct-surface-alt border text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <span className="text-[10px] font-bold opacity-75 inline-flex items-center gap-1">
                                {msg.role === 'model' && <Bot className="w-3 h-3" />}
                                {msg.role === 'user'
                                  ? t('আপনি', 'You', language)
                                  : 'CashTrace AI'}
                              </span>
                              {msg.role === 'model' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(msg.text);
                                    onShowToast(t('উত্তর কপি হয়েছে!', 'Copied!', language));
                                  }}
                                  className="opacity-65 hover:opacity-100"
                                  aria-label="Copy reply"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {chatBusy && (
                        <div className="flex justify-start">
                          <div className="px-3.5 py-2.5 rounded-2xl ct-surface-alt border text-xs text-slate-500 inline-flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                            <span>{t('হিসাব যাচাই করা হচ্ছে...', 'Thinking...', language)}</span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {chatError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{chatError}</span>
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSendChat();
                      }}
                      className="flex items-center gap-2 pt-1"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={t('আপনার হিসাব নিয়ে যেকোনো প্রশ্ন করুন...', 'Ask anything about your finances...', language)}
                        className="flex-1 min-w-0 ct-surface-alt border border-slate-200 dark:border-slate-700 ct-btn-radius px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="submit"
                        disabled={chatBusy || !chatInput.trim()}
                        className="min-h-[42px] px-4 py-2.5 ct-btn-radius bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('পাঠান', 'Send', language)}</span>
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
