import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {App as CapApp} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Home,
  Moon,
  PiggyBank,
  Plus,
  Settings,
  Sun,
  Wallet,
} from 'lucide-react';
import {DashboardTab} from './components/DashboardTab';
import {PinLockScreen} from './components/PinLockScreen';
import {PrintStatementModal} from './components/PrintStatementModal';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {ReportsTab} from './components/ReportsTab';
import {SavingsTab} from './components/SavingsTab';
import {SettingsTab} from './components/SettingsTab';
import {TransactionModal} from './components/TransactionModal';
import {WalletsAndDebtsTab} from './components/WalletsAndDebtsTab';
import {AppTab, CashTraceState, Transaction, TransactionType, UserProfile} from './types';
import {
  exportBackupFile,
  exportStandaloneStatementHTML,
  exportTransactionsCSV,
  exportTransactionsExcel,
} from './utils/exportHelper';
import {
  formatMonthTitle,
  getLocalDateStr,
  getLocalMonthKey,
  parseMonthKey,
} from './utils/formatters';
import {t} from './utils/i18n';
import {loadState, saveState, validateBackupPayload} from './utils/storage';

export default function App() {
  const [state, setState] = useState<CashTraceState>(() => loadState());
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => getLocalMonthKey());
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const initial = loadState();
    return !(initial.profile.pinLock && initial.profile.pin.length === 4);
  });

  // Modals & notifications
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDefaultType, setTxDefaultType] = useState<TransactionType>('expense');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const lang = state.profile.language;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  // Persist state & sync dark mode
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.profile.darkMode);
    document.documentElement.lang = state.profile.language;
  }, [state.profile.darkMode, state.profile.language]);

  // Native Android hardware back button handling
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('backButton', ({canGoBack}) => {
      if (txModalOpen) {
        setTxModalOpen(false);
      } else if (printModalOpen) {
        setPrintModalOpen(false);
      } else if (deleteTarget) {
        setDeleteTarget(null);
      } else if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
      } else if (!canGoBack) {
        CapApp.exitApp();
      }
    });
    return () => {
      listener.then((h) => h.remove());
    };
  }, [txModalOpen, printModalOpen, deleteTarget, activeTab]);

  // Month options (-24 months to +12 months)
  const monthOptions = useMemo(() => {
    const now = new Date();
    const currentKey = getLocalMonthKey(now);
    const list: Array<{key: string; label: string}> = [];
    for (let i = -24; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = getLocalMonthKey(d);
      const label =
        formatMonthTitle(key, lang) +
        (key === currentKey ? (lang === 'bn' ? ' (বর্তমান)' : ' (Current)') : '');
      list.push({key, label});
    }
    return list;
  }, [lang]);

  const currentMonthStore = state.months[selectedMonthKey] || {
    budgetCap: 0,
    transactions: [],
  };

  const shiftMonth = (delta: number) => {
    const d = parseMonthKey(selectedMonthKey);
    const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    setSelectedMonthKey(getLocalMonthKey(next));
  };

  const handleSaveTransaction = (
    txData: Omit<Transaction, 'id' | 'createdAt'>,
    editingId?: string
  ) => {
    const targetMonthKey = txData.date.slice(0, 7) || selectedMonthKey;

    setState((prev) => {
      const nextMonths = {...prev.months};

      // If editing and date moved to a different month, remove from old month first
      if (editingId) {
        for (const [mKey, mVal] of Object.entries(nextMonths)) {
          if (mVal.transactions.some((tx) => tx.id === editingId)) {
            nextMonths[mKey] = {
              ...mVal,
              transactions: mVal.transactions.filter((tx) => tx.id !== editingId),
            };
          }
        }
      }

      const targetStore = nextMonths[targetMonthKey] || {budgetCap: 0, transactions: []};
      const newTx: Transaction = {
        ...txData,
        id: editingId || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      };

      nextMonths[targetMonthKey] = {
        ...targetStore,
        transactions: [newTx, ...targetStore.transactions],
      };

      return {...prev, months: nextMonths};
    });

    if (targetMonthKey !== selectedMonthKey) {
      setSelectedMonthKey(targetMonthKey);
    }

    showToast(
      editingId
        ? t('লেনদেন আপডেট হয়েছে', 'Transaction updated', lang)
        : t('লেনদেন সফলভাবে সেভ হয়েছে', 'Transaction saved', lang)
    );
  };

  const handleDuplicateTransaction = (tx: Transaction) => {
    const today = getLocalDateStr();
    handleSaveTransaction({
      type: tx.type,
      title: tx.title,
      amount: tx.amount,
      category: tx.category,
      subcategory: tx.subcategory,
      date: today,
      walletId: tx.walletId,
      toWalletId: tx.toWalletId,
    });
  };

  const confirmDeleteTransaction = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setState((prev) => {
      const nextMonths = {...prev.months};
      for (const [mKey, mVal] of Object.entries(nextMonths)) {
        if (mVal.transactions.some((tx) => tx.id === id)) {
          nextMonths[mKey] = {
            ...mVal,
            transactions: mVal.transactions.filter((tx) => tx.id !== id),
          };
        }
      }
      return {...prev, months: nextMonths};
    });
    setDeleteTarget(null);
    showToast(t('লেনদেন ডিলিট করা হয়েছে', 'Transaction deleted', lang));
  };

  const handleUpdateBudgetCap = (cap: number) => {
    setState((prev) => ({
      ...prev,
      months: {
        ...prev.months,
        [selectedMonthKey]: {
          ...(prev.months[selectedMonthKey] || {transactions: []}),
          budgetCap: cap,
        },
      },
    }));
    showToast(t('মাসিক বাজেট সীমা আপডেট হয়েছে', 'Monthly budget updated', lang));
  };

  const handleApplySmartMemory = () => {
    if (state.smartMemory.length === 0) {
      setActiveTab('settings');
      return;
    }

    const firstDay = `${selectedMonthKey}-01`;
    const newEntries: Transaction[] = state.smartMemory.map((sm, idx) => ({
      id: `sm_tx_${Date.now()}_${idx}`,
      type: 'expense',
      title: sm.title,
      amount: sm.amount,
      category: sm.category,
      subcategory: t('স্মার্ট মেমোরি', 'Smart Memory', lang),
      date: firstDay,
      walletId: sm.walletId || 'cash',
      createdAt: Date.now() - idx,
    }));

    setState((prev) => {
      const target = prev.months[selectedMonthKey] || {budgetCap: 0, transactions: []};
      return {
        ...prev,
        months: {
          ...prev.months,
          [selectedMonthKey]: {
            ...target,
            transactions: [...newEntries, ...target.transactions],
          },
        },
      };
    });

    showToast(
      t(
        `${newEntries.length} টি ফিক্সড খরচ যোগ করা হয়েছে`,
        `Added ${newEntries.length} fixed expenses`,
        lang
      )
    );
  };

  const handleUpdateProfile = (patch: Partial<UserProfile>) => {
    setState((prev) => ({
      ...prev,
      profile: {...prev.profile, ...patch},
    }));
  };

  const handleExportExcel = async () => {
    if (currentMonthStore.transactions.length === 0) {
      showToast(t('এক্সপোর্ট করার জন্য কোনো লেনদেন নেই', 'No transactions to export', lang));
      return;
    }
    try {
      const mode = await exportTransactionsExcel(
        selectedMonthKey,
        currentMonthStore.transactions,
        state.wallets,
        state.profile.name,
        state.profile.currency
      );
      showToast(
        mode === 'shared'
          ? t('এক্সেল ফাইল শেয়ার মেনুতে খোলা হয়েছে', 'Excel ready to share', lang)
          : t('এক্সেল ফাইল ডাউনলোড হয়েছে', 'Excel file downloaded', lang)
      );
    } catch {
      showToast(t('এক্সপোর্ট করতে সমস্যা হয়েছে', 'Export failed', lang));
    }
  };

  const handleExportCSV = async () => {
    if (currentMonthStore.transactions.length === 0) {
      showToast(t('এক্সপোর্ট করার জন্য কোনো লেনদেন নেই', 'No transactions to export', lang));
      return;
    }
    try {
      const mode = await exportTransactionsCSV(
        selectedMonthKey,
        currentMonthStore.transactions,
        state.wallets
      );
      showToast(
        mode === 'shared'
          ? t('CSV ফাইল শেয়ারের জন্য প্রস্তুত', 'CSV ready to share', lang)
          : t('CSV ফাইল ডাউনলোড হয়েছে', 'CSV file downloaded', lang)
      );
    } catch {
      showToast(t('এক্সপোর্ট করতে সমস্যা হয়েছে', 'Export failed', lang));
    }
  };

  const handleDownloadStatement = async () => {
    try {
      const mode = await exportStandaloneStatementHTML(
        selectedMonthKey,
        currentMonthStore.transactions,
        state.wallets,
        state.profile.name,
        state.profile.currency
      );
      showToast(
        mode === 'shared'
          ? t('রিপোর্ট ফাইল শেয়ারের জন্য প্রস্তুত', 'Statement ready to share', lang)
          : t('রিপোর্ট ফাইল সেভ হয়েছে', 'Statement file saved', lang)
      );
    } catch {
      showToast(t('রিপোর্ট সেভ করতে সমস্যা হয়েছে', 'Failed to save report', lang));
    }
  };

  const handleExportBackup = async () => {
    try {
      const mode = await exportBackupFile(state);
      showToast(
        mode === 'shared'
          ? t('ব্যাকআপ ফাইল শেয়ারের জন্য প্রস্তুত', 'Backup ready to share', lang)
          : t('ব্যাকআপ JSON ডাউনলোড হয়েছে', 'Backup JSON downloaded', lang)
      );
    } catch {
      showToast(t('ব্যাকআপ তৈরি করতে সমস্যা হয়েছে', 'Backup export failed', lang));
    }
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || ''));
        const validated = validateBackupPayload(parsed);
        if (!validated) {
          showToast(t('ভুল ব্যাকআপ ফাইল ফরম্যাট', 'Invalid backup file format', lang));
          return;
        }
        setState(validated);
        showToast(t('ব্যাকআপ সফলভাবে রিস্টোর হয়েছে!', 'Backup restored successfully!', lang));
      } catch {
        showToast(t('ফাইল পড়তে সমস্যা হয়েছে', 'Failed to read backup file', lang));
      }
    };
    reader.readAsText(file);
  };

  if (!isUnlocked && state.profile.pinLock && state.profile.pin.length === 4) {
    return (
      <PinLockScreen
        expectedPin={state.profile.pin}
        language={lang}
        onUnlock={() => setIsUnlocked(true)}
      />
    );
  }

  const navItems: Array<{id: AppTab; bn: string; en: string}> = [
    {id: 'dashboard', bn: 'ড্যাশবোর্ড', en: 'Dashboard'},
    {id: 'reports', bn: 'রিপোর্ট', en: 'Reports'},
    {id: 'wallets', bn: 'ওয়ালেট ও বাকি', en: 'Wallets'},
    {id: 'savings', bn: 'সেভিংস', en: 'Savings'},
    {id: 'settings', bn: 'সেটিংস', en: 'Settings'},
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: Brand wordmark — Nav links — Primary action */}
      <header className="sticky top-0 z-30 pt-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
          >
            CashTrace
          </button>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {lang === 'bn' ? item.bn : item.en}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Compact Mobile Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton language={lang} compact />
            <button
              type="button"
              onClick={() => handleUpdateProfile({darkMode: !state.profile.darkMode})}
              className="md:hidden min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
              aria-label="Toggle theme"
            >
              {state.profile.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`md:hidden min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center ${
                activeTab === 'settings'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTx(null);
                setTxDefaultType('expense');
                setTxModalOpen(true);
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t('নতুন এন্ট্রি', 'Add Entry', lang)}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 pb-24 md:pb-10 space-y-5">
        {/* Month Selector Workspace Bar (shown on Dashboard & Reports) */}
        {(activeTab === 'dashboard' || activeTab === 'reports') && (
          <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                aria-label="Select month"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            selectedMonthKey={selectedMonthKey}
            monthStore={currentMonthStore}
            wallets={state.wallets}
            categories={state.categories}
            userName={state.profile.name}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            smartMemoryCount={state.smartMemory.length}
            onToggleHideBalance={() =>
              handleUpdateProfile({hideBalance: !state.profile.hideBalance})
            }
            onUpdateBudgetCap={handleUpdateBudgetCap}
            onApplySmartMemory={handleApplySmartMemory}
            onOpenNewTransaction={(type) => {
              setEditingTx(null);
              setTxDefaultType(type);
              setTxModalOpen(true);
            }}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onDeleteTransaction={(tx) => setDeleteTarget(tx)}
            onNavigateTab={setActiveTab}
            onOpenPrintModal={() => setPrintModalOpen(true)}
            onExportExcel={handleExportExcel}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            selectedMonthKey={selectedMonthKey}
            months={state.months}
            wallets={state.wallets}
            categories={state.categories}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onDuplicateTransaction={handleDuplicateTransaction}
            onDeleteTransaction={(tx) => setDeleteTarget(tx)}
            onOpenPrintModal={() => setPrintModalOpen(true)}
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'wallets' && (
          <WalletsAndDebtsTab
            wallets={state.wallets}
            months={state.months}
            debts={state.debts}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onUpdateWalletInitial={(walletId, initialBalance) => {
              setState((prev) => ({
                ...prev,
                wallets: prev.wallets.map((w) =>
                  w.id === walletId ? {...w, initialBalance} : w
                ),
              }));
              showToast(t('ওয়ালেট ব্যালেন্স আপডেট হয়েছে', 'Wallet balance updated', lang));
            }}
            onOpenTransferModal={() => {
              setEditingTx(null);
              setTxDefaultType('transfer');
              setTxModalOpen(true);
            }}
            onAddDebt={(debt) => {
              setState((prev) => ({
                ...prev,
                debts: [
                  {
                    ...debt,
                    id: `debt_${Date.now()}`,
                    paidAmount: 0,
                    settled: false,
                  },
                  ...prev.debts,
                ],
              }));
              showToast(t('দেনা-পাওনার হিসাব যোগ হয়েছে', 'Record added', lang));
            }}
            onPayDebt={(debtId, payAmount) => {
              setState((prev) => ({
                ...prev,
                debts: prev.debts.map((d) => {
                  if (d.id !== debtId) return d;
                  const nextPaid = Math.min(d.amount, d.paidAmount + payAmount);
                  return {
                    ...d,
                    paidAmount: nextPaid,
                    settled: nextPaid >= d.amount,
                  };
                }),
              }));
              showToast(t('পরিশোধ আপডেট হয়েছে', 'Payment recorded', lang));
            }}
            onDeleteDebt={(debtId) => {
              setState((prev) => ({
                ...prev,
                debts: prev.debts.filter((d) => d.id !== debtId),
              }));
              showToast(t('হিসাব ডিলিট করা হয়েছে', 'Record deleted', lang));
            }}
          />
        )}

        {activeTab === 'savings' && (
          <SavingsTab
            goals={state.savingsGoals}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onCreateGoal={(title, target) => {
              setState((prev) => ({
                ...prev,
                savingsGoals: [
                  ...prev.savingsGoals,
                  {id: `goal_${Date.now()}`, title, target, saved: 0, createdAt: Date.now()},
                ],
              }));
              showToast(t('নতুন সেভিংস গোল তৈরি হয়েছে', 'Savings goal created', lang));
            }}
            onDepositGoal={(goalId, amount) => {
              setState((prev) => ({
                ...prev,
                savingsGoals: prev.savingsGoals.map((g) =>
                  g.id === goalId ? {...g, saved: g.saved + amount} : g
                ),
              }));
              showToast(t('সেভিংস জমা হয়েছে', 'Deposit added', lang));
            }}
            onDeleteGoal={(goalId) => {
              setState((prev) => ({
                ...prev,
                savingsGoals: prev.savingsGoals.filter((g) => g.id !== goalId),
              }));
              showToast(t('সেভিংস গোল ডিলিট হয়েছে', 'Savings goal deleted', lang));
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            profile={state.profile}
            wallets={state.wallets}
            categories={state.categories}
            smartMemory={state.smartMemory}
            quickTemplates={state.quickTemplates}
            onUpdateProfile={handleUpdateProfile}
            onAddSmartMemory={(item) => {
              setState((prev) => ({
                ...prev,
                smartMemory: [...prev.smartMemory, {...item, id: `sm_${Date.now()}`}],
              }));
              showToast(t('স্মার্ট মেমোরি আইটেম যোগ হয়েছে', 'Fixed item added', lang));
            }}
            onDeleteSmartMemory={(id) => {
              setState((prev) => ({
                ...prev,
                smartMemory: prev.smartMemory.filter((s) => s.id !== id),
              }));
            }}
            onAddCategory={(item) => {
              setState((prev) => ({
                ...prev,
                categories: [...prev.categories, {...item, id: `cat_${Date.now()}`}],
              }));
              showToast(t('নতুন ক্যাটাগরি যোগ হয়েছে', 'Category added', lang));
            }}
            onDeleteCategory={(id) => {
              setState((prev) => ({
                ...prev,
                categories: prev.categories.filter((c) => c.id !== id),
              }));
            }}
            onAddQuickTemplate={(item) => {
              setState((prev) => ({
                ...prev,
                quickTemplates: [...prev.quickTemplates, {...item, id: `qt_${Date.now()}`}],
              }));
              showToast(t('কুইক টেমপ্লেট যোগ হয়েছে', 'Template added', lang));
            }}
            onDeleteQuickTemplate={(id) => {
              setState((prev) => ({
                ...prev,
                quickTemplates: prev.quickTemplates.filter((q) => q.id !== id),
              }));
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="grid grid-cols-5 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'dashboard'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="mt-0.5">{t('হোম', 'Home', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'reports'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="mt-0.5">{t('রিপোর্ট', 'Reports', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTx(null);
              setTxDefaultType('expense');
              setTxModalOpen(true);
            }}
            aria-label="Add Transaction"
            className="flex flex-col items-center justify-center"
          >
            <span className="w-11 h-11 rounded-2xl bg-emerald-600 text-white shadow-md flex items-center justify-center active:scale-95 transition-transform">
              <Plus className="w-6 h-6" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallets')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'wallets'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="mt-0.5">{t('ওয়ালেট', 'Wallets', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('savings')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'savings'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <PiggyBank className="w-5 h-5" />
            <span className="mt-0.5">{t('সেভিংস', 'Savings', lang)}</span>
          </button>
        </div>
      </nav>

      {/* Modals & Indicators */}
      <TransactionModal
        isOpen={txModalOpen}
        editingTransaction={editingTx}
        defaultType={txDefaultType}
        categories={state.categories}
        wallets={state.wallets}
        quickTemplates={state.quickTemplates}
        currency={state.profile.currency}
        language={lang}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTransaction}
      />

      <PrintStatementModal
        isOpen={printModalOpen}
        monthKey={selectedMonthKey}
        transactions={currentMonthStore.transactions}
        wallets={state.wallets}
        userName={state.profile.name}
        currency={state.profile.currency}
        language={lang}
        onClose={() => setPrintModalOpen(false)}
        onDownloadStatement={handleDownloadStatement}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('লেনদেন ডিলিট করবেন?', 'Delete Transaction?', lang)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              "{deleteTarget.title}" — {t('এই এন্ট্রিটি স্থায়ীভাবে মুছে ফেলা হবে।', 'This entry will be permanently deleted.', lang)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', lang)}
              </button>
              <button
                type="button"
                onClick={confirmDeleteTransaction}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('ডিলিট করুন', 'Delete', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          className="fixed top-16 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <OfflineIndicator language={lang} />
    </div>
  );
}
