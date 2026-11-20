import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarClock,
  CheckSquare,
  FileSpreadsheet,
  KeyRound,
  Layers,
  ListChecks,
  Megaphone,
  MessageSquare,
  Mic,
  PiggyBank,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  StickyNote,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {AppTab, CashTraceState, LanguageCode, Transaction} from '../types';
import {formatDisplayDate, getLocalMonthKey} from '../utils/formatters';
import {t} from '../utils/i18n';
import {AiHubTab} from './AIAssistantModal';
import {PocketToolId} from './PocketToolsTab';

interface SpotlightSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: CashTraceState;
  language: LanguageCode;
  hideBalance: boolean;
  onNavigateTab: (tab: AppTab) => void;
  onOpenPocketTool: (tool: PocketToolId) => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenNewTransaction: (type: 'expense' | 'income') => void;
  onOpenUserGuide?: (view: 'guide' | 'marketing') => void;
  onOpenAiStudio?: (tab: AiHubTab) => void;
}

type SearchFilterCat = 'all' | 'transactions' | 'dues' | 'lists' | 'tools';

interface SearchActionItem {
  id: string;
  labelBn: string;
  labelEn: string;
  subBn: string;
  subEn: string;
  keywords: string;
  icon: React.ReactNode;
  onRun: () => void;
}

interface FlatResultEntry {
  id: string;
  onRun: () => void;
}

export const SpotlightSearchModal: React.FC<SpotlightSearchModalProps> = ({
  isOpen,
  onClose,
  state,
  language,
  hideBalance,
  onNavigateTab,
  onOpenPocketTool,
  onEditTransaction,
  onOpenNewTransaction,
  onOpenUserGuide,
  onOpenAiStudio,
}) => {
  const {formatConverted} = useCurrency();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SearchFilterCat>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentMonthKey = getLocalMonthKey();

  const quickActions: SearchActionItem[] = useMemo(
    () => [
      {
        id: 'act_exp',
        labelBn: 'নতুন খরচ যোগ করুন',
        labelEn: 'Add New Expense',
        subBn: 'কুইক অ্যাকশন',
        subEn: 'Quick Action',
        keywords: 'add expense spend cost khoroch খরচ যোগ',
        icon: <Plus className="w-4 h-4 text-rose-500" />,
        onRun: () => {
          onClose();
          onOpenNewTransaction('expense');
        },
      },
      {
        id: 'act_inc',
        labelBn: 'নতুন আয় যোগ করুন',
        labelEn: 'Add New Income',
        subBn: 'কুইক অ্যাকশন',
        subEn: 'Quick Action',
        keywords: 'add income salary earn আয় যোগ বেতন',
        icon: <ArrowDownLeft className="w-4 h-4 text-emerald-500" />,
        onRun: () => {
          onClose();
          onOpenNewTransaction('income');
        },
      },
      ...(onOpenAiStudio
        ? [
            {
              id: 'ai_voice_entry',
              labelBn: 'AI ভয়েস ও স্মার্ট এন্ট্রি',
              labelEn: 'AI Voice & Smart Entry',
              subBn: 'AI স্টুডিও',
              subEn: 'AI Studio',
              keywords: 'ai voice mic speak natural smart entry ভয়েস কথা স্মার্ট এন্ট্রি',
              icon: <Mic className="w-4 h-4 text-emerald-600" />,
              onRun: () => {
                onClose();
                onOpenAiStudio('entry');
              },
            },
            {
              id: 'ai_receipt_scanner',
              labelBn: 'AI রসিদ ও SMS স্ক্যানার',
              labelEn: 'AI Receipt & SMS Scanner',
              subBn: 'AI স্টুডিও',
              subEn: 'AI Studio',
              keywords: 'ai scan receipt photo sms bkash nagad bank রসিদ মেমো স্ক্যান',
              icon: <Receipt className="w-4 h-4 text-amber-500" />,
              onRun: () => {
                onClose();
                onOpenAiStudio('scanner');
              },
            },
            {
              id: 'ai_monthly_advisor',
              labelBn: 'AI মাসিক আর্থিক উপদেষ্টা',
              labelEn: 'AI Monthly Financial Advisor',
              subBn: 'AI স্টুডিও',
              subEn: 'AI Studio',
              keywords: 'ai advisor insights analysis budget tips পরামর্শ বিশ্লেষণ',
              icon: <TrendingUp className="w-4 h-4 text-violet-600" />,
              onRun: () => {
                onClose();
                onOpenAiStudio('advisor');
              },
            },
            {
              id: 'ai_ledger_chat',
              labelBn: 'AI হিসাব-নিকাশ চ্যাট অ্যাসিস্ট্যান্ট',
              labelEn: 'AI Ledger & Debt Chat',
              subBn: 'AI স্টুডিও',
              subEn: 'AI Studio',
              keywords: 'ai chat assistant reminder tagada question তাগাদা প্রশ্ন চ্যাট',
              icon: <MessageSquare className="w-4 h-4 text-sky-600" />,
              onRun: () => {
                onClose();
                onOpenAiStudio('chat');
              },
            },
          ]
        : []),
      {
        id: 'tool_planner',
        labelBn: 'দৈনিক কাজ ও ফোকাস টাইমার',
        labelEn: 'Daily Planner & Focus Timer',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'todo task planner pomodoro focus timer কাজ রুটিন ফোকাস',
        icon: <ListChecks className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('planner');
        },
      },
      {
        id: 'tool_vault',
        labelBn: 'সুরক্ষিত পকেট ভল্ট',
        labelEn: 'Secure Pocket Vault',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'vault bank nid passport card wifi warranty ভল্ট পাসওয়ার্ড ব্যাংক',
        icon: <KeyRound className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('vault');
        },
      },
      {
        id: 'tool_qrcard',
        labelBn: 'পেমেন্ট ও ডিজিটাল QR কার্ড',
        labelEn: 'Payment & Digital QR Card',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'qr code bkash nagad wifi vcard contact payment কার্ড',
        icon: <QrCode className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('qrcard');
        },
      },
      {
        id: 'tool_invoice',
        labelBn: 'ব্যবসায়িক ইনভয়েস ও কোটেশন PDF',
        labelEn: 'Business Invoice & Quotation PDF',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'invoice quotation bill pdf business client ইনভয়েস কোটেশন',
        icon: <FileSpreadsheet className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('invoice');
        },
      },
      {
        id: 'tool_converter',
        labelBn: 'লাইভ কারেন্সি কনভার্টার',
        labelEn: 'Live Currency Converter',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'currency fx usd bdt sar eur rate convert কারেন্সি ডলার টাকা',
        icon: <ArrowLeftRight className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('converter');
        },
      },
      {
        id: 'tool_fees',
        labelBn: 'বিকাশ / নগদ ক্যাশআউট চার্জ',
        labelEn: 'MFS Cash-Out Charge Calc',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'bkash nagad rocket upay fee cashout চার্জ ক্যাশআউট',
        icon: <Smartphone className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('fees');
        },
      },
      {
        id: 'tool_bills',
        labelBn: 'মাসিক বিল রিমাইন্ডার',
        labelEn: 'Monthly Bills & Subscriptions',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'bill rent wifi electricity utility subscription বিল ভাড়া',
        icon: <CalendarClock className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('bills');
        },
      },
      {
        id: 'tool_split',
        labelBn: 'ট্যুর ও মেস বিল স্প্লিট',
        labelEn: 'Tour & Mess Bill Split',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'split mess tour friends group হিসাব ভাগ',
        icon: <Users className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('split');
        },
      },
      {
        id: 'tool_calc',
        labelBn: 'আর্থিক ক্যালকুলেটর (EMI/DPS/যাকাত)',
        labelEn: 'Financial Calculators (EMI/DPS/Zakat)',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'emi dps zakat discount vat calculator ক্যালকুলেটর যাকাত',
        icon: <Calculator className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('calc');
        },
      },
      {
        id: 'tool_receipt',
        labelBn: 'কুইক রসিদ মেকার',
        labelEn: 'Quick Receipt Maker',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'receipt shop print রসিদ',
        icon: <Receipt className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('receipt');
        },
      },
      {
        id: 'tool_notes',
        labelBn: 'আর্থিক নোটস ভল্ট',
        labelEn: 'Financial Notes Vault',
        subBn: 'পকেট টুলস',
        subEn: 'Pocket Tool',
        keywords: 'notes memo নোটস',
        icon: <StickyNote className="w-4 h-4 ct-accent-text" />,
        onRun: () => {
          onClose();
          onOpenPocketTool('notes');
        },
      },
      {
        id: 'tab_wallets',
        labelBn: 'ওয়ালেট ও দেনা-পাওনা',
        labelEn: 'Wallets & Pending Debts',
        subBn: 'ট্যাব নেভিগেশন',
        subEn: 'App Section',
        keywords: 'wallet balance debt lent borrowed বাকি খাতা ওয়ালেট',
        icon: <Wallet className="w-4 h-4 text-sky-500" />,
        onRun: () => {
          onClose();
          onNavigateTab('wallets');
        },
      },
      {
        id: 'tab_reports',
        labelBn: 'রিপোর্ট ও অ্যানালিটিক্স',
        labelEn: 'Reports & Analytics',
        subBn: 'ট্যাব নেভিগেশন',
        subEn: 'App Section',
        keywords: 'reports chart analytics ledger pdf রিপোর্ট',
        icon: <BarChart3 className="w-4 h-4 text-violet-500" />,
        onRun: () => {
          onClose();
          onNavigateTab('reports');
        },
      },
      {
        id: 'tab_shopping',
        labelBn: 'বাজার ও শপিং লিস্ট',
        labelEn: 'Shopping Lists',
        subBn: 'ট্যাব নেভিগেশন',
        subEn: 'App Section',
        keywords: 'shopping grocery market list বাজার ফর্দ',
        icon: <ShoppingBasket className="w-4 h-4 text-amber-500" />,
        onRun: () => {
          onClose();
          onNavigateTab('shopping');
        },
      },
      {
        id: 'tab_savings',
        labelBn: 'সেভিংস গোল',
        labelEn: 'Savings Goals',
        subBn: 'ট্যাব নেভিগেশন',
        subEn: 'App Section',
        keywords: 'savings goal target সঞ্চয়',
        icon: <PiggyBank className="w-4 h-4 text-emerald-500" />,
        onRun: () => {
          onClose();
          onNavigateTab('savings');
        },
      },
      {
        id: 'tab_settings',
        labelBn: 'সেটিংস, কারেন্সি ও ক্লাউড সিঙ্ক',
        labelEn: 'Settings, Currency & Sync',
        subBn: 'ট্যাব নেভিগেশন',
        subEn: 'App Section',
        keywords: 'settings theme backup currency pin cloud sync সেটিংস',
        icon: <Settings className="w-4 h-4 text-slate-500" />,
        onRun: () => {
          onClose();
          onNavigateTab('settings');
        },
      },
      ...(onOpenUserGuide
        ? [
            {
              id: 'act_user_guide',
              labelBn: 'ব্যবহার নির্দেশিকা ও গাইড PDF',
              labelEn: 'User Guide & PDF Manual',
              subBn: 'সাহায্য ও গাইড',
              subEn: 'Help & Guide',
              keywords: 'guide manual pdf help tutorial how to ব্যবহার নির্দেশিকা গাইড',
              icon: <BookOpen className="w-4 h-4 ct-accent-text" />,
              onRun: () => {
                onClose();
                onOpenUserGuide('guide');
              },
            },
            {
              id: 'act_marketing_kit',
              labelBn: 'মার্কেটিং পোস্টার ও প্রোমো কিট',
              labelEn: 'Marketing Posters & Brand Kit',
              subBn: 'ব্র্যান্ড অ্যাসেটস',
              subEn: 'Brand Assets',
              keywords: 'poster marketing promo banner social brand পোস্টার মার্কেটিং',
              icon: <Megaphone className="w-4 h-4 ct-accent-text" />,
              onRun: () => {
                onClose();
                onOpenUserGuide('marketing');
              },
            },
          ]
        : []),
    ],
    [onClose, onNavigateTab, onOpenAiStudio, onOpenNewTransaction, onOpenPocketTool, onOpenUserGuide]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    const showTools = categoryFilter === 'all' || categoryFilter === 'tools';
    const showTxs = categoryFilter === 'all' || categoryFilter === 'transactions';
    const showDues = categoryFilter === 'all' || categoryFilter === 'dues';
    const showLists = categoryFilter === 'all' || categoryFilter === 'lists';

    const allTxs: Transaction[] = [];
    Object.values(state.months).forEach((m) => {
      (m.transactions || []).forEach((tx) => allTxs.push(tx));
    });
    allTxs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    if (!normalizedQuery) {
      return {
        actions: showTools ? quickActions.slice(0, categoryFilter === 'tools' ? 16 : 8) : [],
        transactions: categoryFilter === 'transactions' ? allTxs.slice(0, 8) : ([] as Transaction[]),
        wallets: categoryFilter === 'dues' ? state.wallets : ([] as CashTraceState['wallets']),
        debts: categoryFilter === 'dues' ? (state.debts || []).slice(0, 6) : ([] as CashTraceState['debts']),
        bills: categoryFilter === 'dues' ? (state.recurringBills || []).slice(0, 6) : ([] as NonNullable<CashTraceState['recurringBills']>),
        goals: categoryFilter === 'dues' ? (state.savingsGoals || []).slice(0, 4) : ([] as CashTraceState['savingsGoals']),
        tasks: categoryFilter === 'lists' ? (state.dailyTasks || []).slice(0, 5) : ([] as CashTraceState['dailyTasks']),
        vaultItems: [] as CashTraceState['vaultItems'],
        notes: categoryFilter === 'lists' ? (state.financialNotes || []).slice(0, 4) : ([] as CashTraceState['financialNotes']),
        shoppingItems: [] as Array<{listTitle: string; itemName: string; checked: boolean}>,
      };
    }

    const actions = showTools
      ? quickActions
          .filter((a) =>
            `${a.labelBn} ${a.labelEn} ${a.keywords}`.toLowerCase().includes(normalizedQuery)
          )
          .slice(0, 8)
      : [];

    const transactions = showTxs
      ? allTxs
          .filter((tx) =>
            `${tx.title} ${tx.category} ${tx.subcategory || ''} ${tx.date}`
              .toLowerCase()
              .includes(normalizedQuery)
          )
          .slice(0, 8)
      : [];

    const wallets = showDues
      ? (state.wallets || []).filter((w) =>
          `${w.name} ${w.type}`.toLowerCase().includes(normalizedQuery)
        )
      : [];

    const debts = showDues
      ? (state.debts || [])
          .filter((d) =>
            `${d.personName} ${d.note || ''} ${d.date} ${d.dueDate || ''}`
              .toLowerCase()
              .includes(normalizedQuery)
          )
          .slice(0, 5)
      : [];

    const bills = showDues
      ? (state.recurringBills || [])
          .filter((b) =>
            `${b.title} ${b.category}`.toLowerCase().includes(normalizedQuery)
          )
          .slice(0, 5)
      : [];

    const goals = showDues
      ? (state.savingsGoals || [])
          .filter((g) => g.title.toLowerCase().includes(normalizedQuery))
          .slice(0, 4)
      : [];

    const tasks = showLists
      ? (state.dailyTasks || [])
          .filter((task) => task.title.toLowerCase().includes(normalizedQuery))
          .slice(0, 5)
      : [];

    // Search labels, categories & non-secret notes only; never expose secret `value` directly in Spotlight preview
    const vaultItems =
      categoryFilter === 'all' || categoryFilter === 'tools'
        ? (state.vaultItems || [])
            .filter((v) =>
              `${v.label} ${v.category} ${v.note || ''}`.toLowerCase().includes(normalizedQuery)
            )
            .slice(0, 4)
        : [];

    const notes = showLists
      ? (state.financialNotes || [])
          .filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(normalizedQuery))
          .slice(0, 4)
      : [];

    const shoppingItems: Array<{listTitle: string; itemName: string; checked: boolean}> = [];
    if (showLists) {
      (state.shoppingLists || []).forEach((lst) => {
        lst.items.forEach((it) => {
          if (
            `${lst.title} ${it.name}`.toLowerCase().includes(normalizedQuery) &&
            shoppingItems.length < 6
          ) {
            shoppingItems.push({listTitle: lst.title, itemName: it.name, checked: it.checked});
          }
        });
      });
    }

    return {
      actions,
      transactions,
      wallets,
      debts,
      bills,
      goals,
      tasks,
      vaultItems,
      notes,
      shoppingItems,
    };
  }, [normalizedQuery, categoryFilter, quickActions, state]);

  const flatEntries: FlatResultEntry[] = useMemo(() => {
    const entries: FlatResultEntry[] = [];
    results.actions.forEach((act) => entries.push({id: `act_${act.id}`, onRun: act.onRun}));
    results.transactions.forEach((tx) =>
      entries.push({
        id: `tx_${tx.id}`,
        onRun: () => {
          onClose();
          onEditTransaction(tx);
        },
      })
    );
    results.wallets.forEach((w) =>
      entries.push({
        id: `wal_${w.id}`,
        onRun: () => {
          onClose();
          onNavigateTab('wallets');
        },
      })
    );
    results.bills.forEach((b) =>
      entries.push({
        id: `bill_${b.id}`,
        onRun: () => {
          onClose();
          onOpenPocketTool('bills');
        },
      })
    );
    results.debts.forEach((d) =>
      entries.push({
        id: `debt_${d.id}`,
        onRun: () => {
          onClose();
          onNavigateTab('wallets');
        },
      })
    );
    results.goals.forEach((g) =>
      entries.push({
        id: `goal_${g.id}`,
        onRun: () => {
          onClose();
          onNavigateTab('savings');
        },
      })
    );
    results.tasks.forEach((task) =>
      entries.push({
        id: `task_${task.id}`,
        onRun: () => {
          onClose();
          onOpenPocketTool('planner');
        },
      })
    );
    results.vaultItems.forEach((v) =>
      entries.push({
        id: `vault_${v.id}`,
        onRun: () => {
          onClose();
          onOpenPocketTool('vault');
        },
      })
    );
    results.notes.forEach((n) =>
      entries.push({
        id: `note_${n.id}`,
        onRun: () => {
          onClose();
          onOpenPocketTool('notes');
        },
      })
    );
    results.shoppingItems.forEach((si, idx) =>
      entries.push({
        id: `shop_${si.listTitle}_${idx}`,
        onRun: () => {
          onClose();
          onNavigateTab('shopping');
        },
      })
    );
    return entries;
  }, [results, onClose, onEditTransaction, onNavigateTab, onOpenPocketTool]);

  const entryIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatEntries.forEach((entry, i) => map.set(entry.id, i));
    return map;
  }, [flatEntries]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, categoryFilter, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setCategoryFilter('all');
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown' && flatEntries.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % flatEntries.length);
      } else if (e.key === 'ArrowUp' && flatEntries.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + flatEntries.length) % flatEntries.length);
      } else if (e.key === 'Enter' && flatEntries.length > 0) {
        const current = flatEntries[activeIndex];
        if (current) {
          e.preventDefault();
          current.onRun();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, flatEntries, activeIndex]);

  const hasAnyMatches = flatEntries.length > 0;

  const filterTabs: Array<{id: SearchFilterCat; bn: string; en: string}> = [
    {id: 'all', bn: 'সব কিছু', en: 'All'},
    {id: 'transactions', bn: 'লেনদেন', en: 'Transactions'},
    {id: 'dues', bn: 'বিল, বাকি ও সঞ্চয়', en: 'Bills & Debts'},
    {id: 'lists', bn: 'কাজ, নোট ও বাজার', en: 'Tasks & Lists'},
    {id: 'tools', bn: 'টুলস ও AI', en: 'Tools & AI'},
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.16}}
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 backdrop-blur-sm p-3 sm:pt-14"
          onClick={onClose}
        >
          <motion.div
            initial={{opacity: 0, y: -14, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: -10, scale: 0.98}}
            transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
            className="w-full max-w-2xl ct-surface-card border shadow-2xl overflow-hidden flex flex-col max-h-[84vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Global Search Input Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
              <Search className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(
                  'লেনদেন, ব্যক্তি, বিল, সঞ্চয়, ভল্ট বা AI টুলস খুঁজুন...',
                  'Search transactions, debts, bills, goals, vault, or AI...',
                  language
                )}
                className="flex-1 min-w-0 bg-transparent text-sm sm:text-base font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-1 rounded-lg ct-surface-alt text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0"
              >
                ESC
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-3 sm:px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {filterTabs.map((ft) => {
                const active = categoryFilter === ft.id;
                return (
                  <button
                    key={ft.id}
                    type="button"
                    onClick={() => setCategoryFilter(ft.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors shrink-0 ${
                      active
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'ct-surface-alt text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {language === 'bn' ? ft.bn : ft.en}
                  </button>
                );
              })}
            </div>

            {/* Results Feed */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {!hasAnyMatches ? (
                <div className="py-10 text-center space-y-2">
                  <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('কোনো মিল পাওয়া যায়নি', 'No matching results', language)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t('অন্য শব্দ লিখে বা ভিন্ন ক্যাটাগরি নির্বাচন করে চেষ্টা করুন', 'Try a different keyword or filter tab', language)}
                  </p>
                  {onOpenAiStudio && query.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAiStudio('chat');
                      }}
                      className="mt-2 px-3.5 py-2 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('AI অ্যাসিস্ট্যান্টকে জিজ্ঞেস করুন', 'Ask AI Assistant', language)}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Quick Actions, AI Studio & Tools */}
                  {results.actions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {normalizedQuery
                          ? t('টুলস, AI ও অ্যাকশন', 'Tools, AI & Actions', language)
                          : t('দ্রুত অ্যাকশন ও AI স্টুডিও', 'Quick Jump, AI & Pocket Hub', language)}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {results.actions.map((act) => {
                          const idx = entryIndexMap.get(`act_${act.id}`);
                          const highlighted = idx === activeIndex;
                          return (
                            <button
                              key={act.id}
                              type="button"
                              onClick={act.onRun}
                              className={`flex items-center gap-3 px-3 py-2.5 ct-btn-radius border text-left transition-colors ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-400 dark:border-sky-600'
                                  : 'ct-surface-alt border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center shrink-0">
                                {act.icon}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {language === 'bn' ? act.labelBn : act.labelEn}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {language === 'bn' ? act.subBn : act.subEn}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Transactions */}
                  {results.transactions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('লেনদেন', 'Transactions', language)}
                      </p>
                      <div className="space-y-1">
                        {results.transactions.map((tx) => {
                          const isInc = tx.type === 'income';
                          const isTr = tx.type === 'transfer';
                          const highlighted = entryIndexMap.get(`tx_${tx.id}`) === activeIndex;
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onEditTransaction(tx);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 ct-btn-radius text-left transition-colors ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isInc
                                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                                      : isTr
                                      ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-600'
                                      : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                                  }`}
                                >
                                  {isInc ? (
                                    <ArrowDownLeft className="w-3.5 h-3.5" />
                                  ) : isTr ? (
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {tx.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {formatDisplayDate(tx.date, language)} · {tx.category}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`text-xs font-bold tabular-nums shrink-0 ${
                                  isInc
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isTr
                                    ? 'text-sky-600 dark:text-sky-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {isInc ? '+' : isTr ? '⇄ ' : '-'}
                                {formatConverted(tx.amount, hideBalance)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Wallets */}
                  {results.wallets.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('ওয়ালেট ও অ্যাকাউন্ট', 'Wallets', language)}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {results.wallets.map((w) => {
                          const highlighted = entryIndexMap.get(`wal_${w.id}`) === activeIndex;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateTab('wallets');
                              }}
                              className={`flex items-center justify-between gap-2 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'ct-surface-alt hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Wallet className="w-4 h-4 text-violet-600 shrink-0" />
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {w.name}
                                </span>
                              </div>
                              <span className="text-[11px] uppercase text-slate-400 shrink-0">{w.type}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recurring Bills */}
                  {results.bills.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('মাসিক বিল ও সাবস্ক্রিপশন', 'Recurring Bills', language)}
                      </p>
                      <div className="space-y-1">
                        {results.bills.map((b) => {
                          const isPaid = b.paidMonths.includes(currentMonthKey);
                          const highlighted = entryIndexMap.get(`bill_${b.id}`) === activeIndex;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenPocketTool('bills');
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {b.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {t(`প্রতি মাসের ${b.dueDay} তারিখ`, `Due day ${b.dueDay}`, language)} ·{' '}
                                    <span className={isPaid ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                                      {isPaid ? t('পরিশোধিত', 'Paid', language) : t('বকেয়া', 'Unpaid', language)}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                                {formatConverted(b.amount, hideBalance)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pending Debts */}
                  {results.debts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('দেনা-পাওনা', 'Ledger & Debts', language)}
                      </p>
                      <div className="space-y-1">
                        {results.debts.map((d) => {
                          const rem = Math.max(0, d.amount - d.paidAmount);
                          const highlighted = entryIndexMap.get(`debt_${d.id}`) === activeIndex;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateTab('wallets');
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Users className="w-4 h-4 ct-accent-text shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {d.personName}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {d.type === 'lent'
                                      ? t('পাবো', 'Receivable', language)
                                      : t('দেবো', 'Payable', language)}
                                    {d.dueDate ? ` · ${formatDisplayDate(d.dueDate, language)}` : ''}
                                    {d.note ? ` · ${d.note}` : ''}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                                {formatConverted(rem, hideBalance)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Savings Goals */}
                  {results.goals.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('সেভিংস গোল', 'Savings Goals', language)}
                      </p>
                      <div className="space-y-1">
                        {results.goals.map((g) => {
                          const highlighted = entryIndexMap.get(`goal_${g.id}`) === activeIndex;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateTab('savings');
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PiggyBank className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {g.title}
                                </span>
                              </div>
                              <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                                {formatConverted(g.saved, hideBalance)} / {formatConverted(g.target, hideBalance)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily Tasks */}
                  {results.tasks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('দৈনিক কাজ', 'Daily Planner Tasks', language)}
                      </p>
                      <div className="space-y-1">
                        {results.tasks.map((task) => {
                          const highlighted = entryIndexMap.get(`task_${task.id}`) === activeIndex;
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenPocketTool('planner');
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CheckSquare className="w-4 h-4 ct-accent-text shrink-0" />
                                <span
                                  className={`text-xs font-semibold truncate ${
                                    task.done
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </div>
                              {task.dueTime && (
                                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                  {task.dueTime}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Vault Items (Masked value for privacy) */}
                  {results.vaultItems.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('পকেট ভল্ট', 'Pocket Vault', language)}
                      </p>
                      <div className="space-y-1">
                        {results.vaultItems.map((item) => {
                          const highlighted = entryIndexMap.get(`vault_${item.id}`) === activeIndex;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenPocketTool('vault');
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <KeyRound className="w-4 h-4 ct-accent-text shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {item.label}
                                  </p>
                                  <p className="text-[11px] text-slate-400 uppercase">{item.category}</p>
                                </div>
                              </div>
                              <span className="text-xs font-mono text-slate-400 shrink-0">••••••</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Financial Notes & Shopping */}
                  {(results.notes.length > 0 || results.shoppingItems.length > 0) && (
                    <div className="space-y-1.5">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t('নোটস ও বাজার লিস্ট', 'Notes & Shopping', language)}
                      </p>
                      <div className="space-y-1">
                        {results.notes.map((n) => {
                          const highlighted = entryIndexMap.get(`note_${n.id}`) === activeIndex;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenPocketTool('notes');
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
                              <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {n.title}
                              </span>
                            </button>
                          );
                        })}
                        {results.shoppingItems.map((si, idx) => {
                          const highlighted =
                            entryIndexMap.get(`shop_${si.listTitle}_${idx}`) === activeIndex;
                          return (
                            <button
                              key={`${si.listTitle}_${idx}`}
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateTab('shopping');
                              }}
                              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 ct-btn-radius text-left ${
                                highlighted
                                  ? 'bg-sky-50 dark:bg-sky-950/50'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ShoppingBasket className="w-4 h-4 text-amber-500 shrink-0" />
                                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {si.itemName}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 shrink-0">{si.listTitle}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Hints */}
            <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {t('এক ট্যাপেই অ্যাপের যেকোনো ফিচার, AI ও রেকর্ডে যান', 'Jump instantly to any record, AI tool, or bill', language)}
              </span>
              <span className="hidden sm:inline font-mono">↑↓ · Enter · ⌘K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

