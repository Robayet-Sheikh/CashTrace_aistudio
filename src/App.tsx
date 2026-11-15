import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {App as CapApp} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';
import {onAuthStateChanged, signInWithPopup, signOut, User} from 'firebase/auth';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Home,
  Moon,
  PiggyBank,
  Plus,
  RefreshCw,
  Settings,
  ShoppingBasket,
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
import {ShoppingListTab} from './components/ShoppingListTab';
import {TransactionModal} from './components/TransactionModal';
import {WalletsAndDebtsTab} from './components/WalletsAndDebtsTab';
import {auth, googleProvider} from './firebase';
import {
  checkUserProfileExists,
  cloudAddCategory,
  cloudAddDebt,
  cloudAddQuickTemplate,
  cloudAddSmartMemory,
  cloudClearCheckedShoppingItems,
  cloudCreateShoppingItem,
  cloudCreateShoppingList,
  cloudCreateTransactionsBatch,
  cloudDeleteCategory,
  cloudDeleteDebt,
  cloudDeleteQuickTemplate,
  cloudDeleteSavingsGoal,
  cloudDeleteShoppingItem,
  cloudDeleteShoppingList,
  cloudDeleteSmartMemory,
  cloudDeleteTransaction,
  cloudPayDebt,
  cloudSaveMonthBudget,
  cloudSaveSavingsGoal,
  cloudSaveTransaction,
  cloudUpdateProfile,
  cloudUpdateShoppingItem,
  cloudUpdateWalletInitial,
  hasMeaningfulLocalData,
  subscribeToUserCloudData,
  uploadFullStateToCloud,
} from './services/firestoreSync';
import {AppTab, CashTraceState, DebtRecord, ShoppingList, Transaction, TransactionType, UserProfile} from './types';
import {
  exportBackupFile,
  exportStatementPDF,
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

const LAST_SYNCED_UID_KEY = 'cashtrace_last_synced_uid';

export default function App() {
  const [state, setState] = useState<CashTraceState>(() => loadState());
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => getLocalMonthKey());
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const initial = loadState();
    return !(initial.profile.pinLock && initial.profile.pin.length === 4);
  });

  // Firebase Auth & Cloud Sync state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [pendingMergeUser, setPendingMergeUser] = useState<User | null>(null);
  const stateRef = useRef<CashTraceState>(state);
  stateRef.current = state;
  const profileSyncTimerRef = useRef<number | null>(null);
  const cloudUnsubRef = useRef<(() => void) | null>(null);

  // Modals & notifications
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDefaultType, setTxDefaultType] = useState<TransactionType>('expense');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const lang = state.profile.language;
  const isNative = Capacitor.isNativePlatform();

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // Persist state & sync dark mode
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.profile.darkMode);
    document.documentElement.lang = state.profile.language;
  }, [state.profile.darkMode, state.profile.language]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        if (cloudUnsubRef.current) {
          cloudUnsubRef.current();
          cloudUnsubRef.current = null;
        }
        setPendingMergeUser(null);
        setCloudSyncing(false);
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore cloud listeners ONLY when auth is ready & user is authenticated
  useEffect(() => {
    if (!authReady || !authUser) return;

    let cancelled = false;
    const attachListeners = (u: User) => {
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
      }
      cloudUnsubRef.current = subscribeToUserCloudData(
        u,
        (updater) => setState((prev) => updater(prev)),
        setCloudSyncing
      );
    };

    (async () => {
      setCloudSyncing(true);
      try {
        const exists = await checkUserProfileExists(authUser.uid);
        if (cancelled) return;

        if (!exists) {
          await uploadFullStateToCloud(authUser, stateRef.current, false);
          if (cancelled) return;
          localStorage.setItem(LAST_SYNCED_UID_KEY, authUser.uid);
          setCloudError(null);
          attachListeners(authUser);
          showToast(t('আপনার সব ডেটা Google ক্লাউডে সেভ হয়েছে!', 'All data backed up to Google Cloud!', stateRef.current.profile.language));
        } else {
          const lastSyncedUid = localStorage.getItem(LAST_SYNCED_UID_KEY);
          if (lastSyncedUid !== authUser.uid && hasMeaningfulLocalData(stateRef.current)) {
            setCloudSyncing(false);
            setCloudError(null);
            setPendingMergeUser(authUser);
          } else {
            localStorage.setItem(LAST_SYNCED_UID_KEY, authUser.uid);
            setCloudError(null);
            attachListeners(authUser);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCloudSyncing(false);
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Cloud bootstrap error:', err);
          setCloudError(
            t(
              `ক্লাউড সিঙ্ক এরর: ${msg.slice(0, 140)}`,
              `Cloud sync error: ${msg.slice(0, 140)}`,
              stateRef.current.profile.language
            )
          );
          showToast(t('ক্লাউড সিঙ্কে সমস্যা হয়েছে — Settings দেখুন', 'Cloud sync error — check Settings', stateRef.current.profile.language));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
        cloudUnsubRef.current = null;
      }
    };
  }, [authReady, authUser, showToast]);

  const handleSignInGoogle = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setCloudError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast(t('Google লগইন সফল হয়েছে!', 'Signed in with Google!', lang));
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed popup manually
      } else if (
        code === 'auth/operation-not-supported-in-this-environment' ||
        isNative
      ) {
        const msg = t(
          'Android APK WebView-তে Google পপআপ সীমাবদ্ধ; ওয়েব PWA লিংক (robayet-sheikh.github.io) থেকে লগইন করুন',
          'Google popup is restricted inside APK WebView; please use the Web PWA link',
          lang
        );
        setCloudError(msg);
        showToast(msg);
      } else if (code === 'auth/unauthorized-domain') {
        const msg = t(
          `Firebase Console → Authentication → Settings → Authorized domains-এ '${window.location.hostname}' যোগ করুন`,
          `Add '${window.location.hostname}' to Firebase Authorized Domains`,
          lang
        );
        setCloudError(msg);
        showToast(msg);
      } else if (code === 'auth/popup-blocked') {
        const msg = t('ব্রাউজারে পপআপ অনুমতি দিন', 'Please allow popups in your browser', lang);
        setCloudError(msg);
        showToast(msg);
      } else {
        const msg = t(`Google লগইন ব্যর্থ হয়েছে (${code || 'unknown'})`, `Google sign-in failed (${code || 'unknown'})`, lang);
        setCloudError(msg);
        showToast(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOutGoogle = async () => {
    setAuthBusy(true);
    setCloudError(null);
    try {
      localStorage.removeItem(LAST_SYNCED_UID_KEY);
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
        cloudUnsubRef.current = null;
      }
      await signOut(auth);
      showToast(t('লগআউট সম্পন্ন হয়েছে (অফলাইন মোড চালু)', 'Signed out (offline mode active)', lang));
    } catch {
      showToast(t('লগআউট করতে সমস্যা হয়েছে', 'Failed to sign out', lang));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForceCloudSync = async () => {
    if (!authUser) return;
    setCloudSyncing(true);
    setCloudError(null);
    try {
      await cloudUpdateProfile(authUser, state.profile);
      await uploadFullStateToCloud(authUser, state, true);
      showToast(t('ক্লাউডে সম্পূর্ণ সিঙ্ক সম্পন্ন হয়েছে ✓', 'Full cloud sync complete ✓', lang));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCloudError(t(`সিঙ্ক ব্যর্থ: ${msg.slice(0, 140)}`, `Sync failed: ${msg.slice(0, 140)}`, lang));
      showToast(t('সিঙ্ক করতে সমস্যা হয়েছে', 'Sync failed', lang));
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleResolveCloudConflict = async (mode: 'restore' | 'merge') => {
    const user = pendingMergeUser;
    if (!user) return;
    setPendingMergeUser(null);
    setCloudSyncing(true);
    try {
      if (mode === 'merge') {
        await uploadFullStateToCloud(user, stateRef.current, true);
      }
      localStorage.setItem(LAST_SYNCED_UID_KEY, user.uid);
      if (cloudUnsubRef.current) cloudUnsubRef.current();
      cloudUnsubRef.current = subscribeToUserCloudData(
        user,
        (updater) => setState((prev) => updater(prev)),
        setCloudSyncing
      );
      showToast(
        mode === 'merge'
          ? t('লোকাল ও ক্লাউড ডেটা মার্জ সম্পন্ন!', 'Local & cloud data merged!', lang)
          : t('ক্লাউড থেকে আপনার সব ডেটা রিস্টোর হয়েছে!', 'Cloud data restored!', lang)
      );
    } catch {
      setCloudSyncing(false);
      showToast(t('সিঙ্ক করতে সমস্যা হয়েছে', 'Cloud sync error', lang));
    }
  };

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
    const newTx: Transaction = {
      ...txData,
      id: editingId || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };

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
      nextMonths[targetMonthKey] = {
        ...targetStore,
        transactions: [newTx, ...targetStore.transactions],
      };

      return {...prev, months: nextMonths};
    });

    if (authUser) {
      void cloudSaveTransaction(authUser.uid, newTx, Boolean(editingId));
    }

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
    if (authUser) {
      void cloudDeleteTransaction(authUser.uid, id);
    }
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
    if (authUser) {
      void cloudSaveMonthBudget(authUser.uid, selectedMonthKey, cap);
    }
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

    if (authUser) {
      void cloudCreateTransactionsBatch(authUser.uid, newEntries);
    }

    showToast(
      t(
        `${newEntries.length} টি ফিক্সড খরচ যোগ করা হয়েছে`,
        `Added ${newEntries.length} fixed expenses`,
        lang
      )
    );
  };

  const handleUpdateProfile = (patch: Partial<UserProfile>) => {
    setState((prev) => {
      const nextProfile = {...prev.profile, ...patch};
      if (authUser) {
        if (profileSyncTimerRef.current) {
          window.clearTimeout(profileSyncTimerRef.current);
        }
        profileSyncTimerRef.current = window.setTimeout(() => {
          void cloudUpdateProfile(authUser, nextProfile);
        }, 550);
      }
      return {
        ...prev,
        profile: nextProfile,
      };
    });
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
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const mode = await exportStatementPDF(
        selectedMonthKey,
        currentMonthStore.transactions,
        state.wallets,
        state.profile.name,
        state.profile.currency,
        lang
      );
      showToast(
        mode === 'shared'
          ? t('PDF তৈরি হয়েছে! Documents-এ সেভ ও শেয়ার অপশন খোলা হয়েছে', 'PDF saved & share sheet opened', lang)
          : t('PDF ফাইল ডাউনলোড হয়েছে', 'PDF downloaded', lang)
      );
    } catch {
      showToast(t('PDF তৈরি করতে সমস্যা হয়েছে', 'Failed to generate PDF', lang));
    } finally {
      setIsGeneratingPdf(false);
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
        if (authUser) {
          setCloudSyncing(true);
          void Promise.all([
            cloudUpdateProfile(authUser, validated.profile),
            uploadFullStateToCloud(authUser, validated, true),
          ]).finally(() => setCloudSyncing(false));
        }
        showToast(t('ব্যাকআপ সফলভাবে রিস্টোর হয়েছে!', 'Backup restored successfully!', lang));
      } catch {
        showToast(t('ফাইল পড়তে সমস্যা হয়েছে', 'Failed to read backup file', lang));
      }
    };
    reader.readAsText(file);
  };

  const pendingShoppingCount = useMemo(
    () => state.shoppingLists.reduce((sum, lst) => sum + lst.items.filter((it) => !it.checked).length, 0),
    [state.shoppingLists]
  );

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
    {id: 'shopping', bn: 'বাজার লিস্ট', en: 'Lists'},
    {id: 'savings', bn: 'সেভিংস', en: 'Savings'},
    {id: 'settings', bn: 'সেটিংস', en: 'Settings'},
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: Brand wordmark — Nav links — Primary action */}
      <header className="sticky top-0 z-30 pt-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 print-hide">
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
              onClick={() => (authUser ? setActiveTab('settings') : void handleSignInGoogle())}
              className="min-h-[38px] px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
              title={
                authUser
                  ? `${authUser.email || 'Google Sync'}`
                  : t('Google ক্লাউড লগইন', 'Google Cloud Sign In', lang)
              }
              aria-label="Cloud Sync Account"
            >
              {authUser?.photoURL ? (
                <img
                  src={authUser.photoURL}
                  alt={authUser.displayName || 'Account'}
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Cloud
                  className={`w-4 h-4 ${
                    authUser
                      ? cloudSyncing
                        ? 'text-amber-500 animate-pulse'
                        : 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
              )}
              <span className="hidden lg:inline">
                {authUser
                  ? cloudSyncing
                    ? t('সিঙ্ক...', 'Sync...', lang)
                    : t('সিঙ্কড', 'Synced', lang)
                  : t('লগইন', 'Sign In', lang)}
              </span>
            </button>
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 pb-24 md:pb-10 space-y-5 print-hide">
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

        {/* Mobile Segmented Switcher for Shopping Lists vs Savings Goals */}
        {(activeTab === 'shopping' || activeTab === 'savings') && (
          <div className="md:hidden grid grid-cols-2 gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('shopping')}
              className={`py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'shopping'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ShoppingBasket className="w-4 h-4" />
              <span>{t('বাজার লিস্ট', 'Shopping Lists', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('savings')}
              className={`py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'savings'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <PiggyBank className="w-4 h-4" />
              <span>{t('সেভিংস গোল', 'Savings Goals', lang)}</span>
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
            pendingShoppingCount={pendingShoppingCount}
            cloudUserEmail={authUser?.email || null}
            authBusy={authBusy}
            onSignInGoogle={() => void handleSignInGoogle()}
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
              const targetWallet = state.wallets.find((w) => w.id === walletId);
              setState((prev) => ({
                ...prev,
                wallets: prev.wallets.map((w) =>
                  w.id === walletId ? {...w, initialBalance} : w
                ),
              }));
              if (authUser && targetWallet) {
                void cloudUpdateWalletInitial(authUser.uid, {...targetWallet, initialBalance});
              }
              showToast(t('ওয়ালেট ব্যালেন্স আপডেট হয়েছে', 'Wallet balance updated', lang));
            }}
            onOpenTransferModal={() => {
              setEditingTx(null);
              setTxDefaultType('transfer');
              setTxModalOpen(true);
            }}
            onAddDebt={(debt, syncWalletId) => {
              const newDebt: DebtRecord = {
                ...debt,
                id: `debt_${Date.now()}`,
                paidAmount: 0,
                walletId: syncWalletId,
                settled: false,
              };
              let createdTx: Transaction | undefined;
              if (syncWalletId) {
                createdTx = {
                  id: `debt_tx_${Date.now()}`,
                  type: debt.type === 'lent' ? 'expense' : 'income',
                  title:
                    debt.type === 'lent'
                      ? t(`${debt.personName}-কে ধার`, `Lent to ${debt.personName}`, lang)
                      : t(`${debt.personName} থেকে ধার`, `Borrowed from ${debt.personName}`, lang),
                  amount: debt.amount,
                  category:
                    debt.type === 'lent'
                      ? t('🤝 ধার দেওয়া', '🤝 Lent Out', lang)
                      : t('🤝 ধার নেওয়া', '🤝 Borrowed', lang),
                  subcategory: debt.note,
                  date: debt.date,
                  walletId: syncWalletId,
                  createdAt: Date.now(),
                };
              }
              setState((prev) => {
                const nextMonths = {...prev.months};
                if (createdTx) {
                  const mKey = createdTx.date.slice(0, 7) || selectedMonthKey;
                  const target = nextMonths[mKey] || {budgetCap: 0, transactions: []};
                  nextMonths[mKey] = {
                    ...target,
                    transactions: [createdTx, ...target.transactions],
                  };
                }
                return {
                  ...prev,
                  months: nextMonths,
                  debts: [newDebt, ...prev.debts],
                };
              });
              if (authUser) {
                void cloudAddDebt(authUser.uid, newDebt, createdTx);
              }
              showToast(t('দেনা-পাওনার হিসাব যোগ হয়েছে', 'Record added', lang));
            }}
            onPayDebt={(debtId, payAmount, syncWalletId) => {
              const targetDebt = state.debts.find((d) => d.id === debtId);
              const nextPaid = targetDebt ? Math.min(targetDebt.amount, targetDebt.paidAmount + payAmount) : payAmount;
              const nextSettled = targetDebt ? nextPaid >= targetDebt.amount : false;
              let createdTx: Transaction | undefined;
              if (syncWalletId && targetDebt) {
                const today = getLocalDateStr();
                createdTx = {
                  id: `debt_pay_${Date.now()}`,
                  type: targetDebt.type === 'lent' ? 'income' : 'expense',
                  title:
                    targetDebt.type === 'lent'
                      ? t(`${targetDebt.personName} থেকে ফেরত`, `Repayment from ${targetDebt.personName}`, lang)
                      : t(`${targetDebt.personName}-কে পরিশোধ`, `Repaid to ${targetDebt.personName}`, lang),
                  amount: payAmount,
                  category: t('🤝 দেনা-পাওনা পরিশোধ', '🤝 Debt Settlement', lang),
                  date: today,
                  walletId: syncWalletId,
                  createdAt: Date.now(),
                };
              }
              setState((prev) => {
                const nextMonths = {...prev.months};
                if (createdTx) {
                  const mKey = createdTx.date.slice(0, 7);
                  const mStore = nextMonths[mKey] || {budgetCap: 0, transactions: []};
                  nextMonths[mKey] = {
                    ...mStore,
                    transactions: [createdTx, ...mStore.transactions],
                  };
                }
                return {
                  ...prev,
                  months: nextMonths,
                  debts: prev.debts.map((d) =>
                    d.id === debtId ? {...d, paidAmount: nextPaid, settled: nextSettled} : d
                  ),
                };
              });
              if (authUser && targetDebt) {
                void cloudPayDebt(authUser.uid, debtId, nextPaid, nextSettled, createdTx);
              }
              showToast(t('পরিশোধ আপডেট হয়েছে', 'Payment recorded', lang));
            }}
            onDeleteDebt={(debtId) => {
              setState((prev) => ({
                ...prev,
                debts: prev.debts.filter((d) => d.id !== debtId),
              }));
              if (authUser) {
                void cloudDeleteDebt(authUser.uid, debtId);
              }
              showToast(t('হিসাব ডিলিট করা হয়েছে', 'Record deleted', lang));
            }}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'shopping' && (
          <ShoppingListTab
            lists={state.shoppingLists}
            wallets={state.wallets}
            categories={state.categories}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onCreateList={(title) => {
              const newId = `list_${Date.now()}`;
              const newList: ShoppingList = {
                id: newId,
                title,
                items: [],
                createdAt: Date.now(),
              };
              setState((prev) => ({
                ...prev,
                shoppingLists: [newList, ...prev.shoppingLists],
              }));
              if (authUser) {
                void cloudCreateShoppingList(authUser.uid, newList);
              }
              showToast(t('নতুন বাজার লিস্ট তৈরি হয়েছে', 'Shopping list created', lang));
              return newId;
            }}
            onDeleteList={(listId) => {
              const targetList = state.shoppingLists.find((l) => l.id === listId);
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.filter((l) => l.id !== listId),
              }));
              if (authUser && targetList) {
                void cloudDeleteShoppingList(authUser.uid, targetList);
              }
              showToast(t('লিস্ট ডিলিট করা হয়েছে', 'List deleted', lang));
            }}
            onAddItem={(listId, item) => {
              const newItem = {
                ...item,
                id: `sitem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                checked: false,
                createdAt: Date.now(),
              };
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId ? {...l, items: [newItem, ...l.items]} : l
                ),
              }));
              if (authUser) {
                void cloudCreateShoppingItem(authUser.uid, listId, newItem);
              }
            }}
            onToggleItem={(listId, itemId) => {
              const targetItem = state.shoppingLists
                .find((l) => l.id === listId)
                ?.items.find((it) => it.id === itemId);
              const nextChecked = targetItem ? !targetItem.checked : true;
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId
                    ? {
                        ...l,
                        items: l.items.map((it) =>
                          it.id === itemId ? {...it, checked: nextChecked} : it
                        ),
                      }
                    : l
                ),
              }));
              if (authUser && targetItem) {
                void cloudUpdateShoppingItem(authUser.uid, listId, {
                  ...targetItem,
                  checked: nextChecked,
                });
              }
            }}
            onUpdateItem={(listId, itemId, patch) => {
              const targetItem = state.shoppingLists
                .find((l) => l.id === listId)
                ?.items.find((it) => it.id === itemId);
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId
                    ? {
                        ...l,
                        items: l.items.map((it) => (it.id === itemId ? {...it, ...patch} : it)),
                      }
                    : l
                ),
              }));
              if (authUser && targetItem) {
                void cloudUpdateShoppingItem(authUser.uid, listId, {...targetItem, ...patch});
              }
              showToast(t('আইটেম আপডেট হয়েছে', 'Item updated', lang));
            }}
            onDeleteItem={(listId, itemId) => {
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId
                    ? {...l, items: l.items.filter((it) => it.id !== itemId)}
                    : l
                ),
              }));
              if (authUser) {
                void cloudDeleteShoppingItem(authUser.uid, listId, itemId);
              }
            }}
            onClearChecked={(listId) => {
              const checkedIds =
                state.shoppingLists
                  .find((l) => l.id === listId)
                  ?.items.filter((it) => it.checked)
                  .map((it) => it.id) || [];
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId
                    ? {...l, items: l.items.filter((it) => !it.checked)}
                    : l
                ),
              }));
              if (authUser && checkedIds.length > 0) {
                void cloudClearCheckedShoppingItems(authUser.uid, listId, checkedIds);
              }
              showToast(t('কেনা আইটেমগুলো মুছে ফেলা হয়েছে', 'Checked items cleared', lang));
            }}
            onLogExpenseFromList={(listId, txData, clearCheckedItems) => {
              const targetMonthKey = txData.date.slice(0, 7) || selectedMonthKey;
              const newTx: Transaction = {
                ...txData,
                id: `shop_tx_${Date.now()}`,
                createdAt: Date.now(),
              };
              const checkedIds = clearCheckedItems
                ? state.shoppingLists
                    .find((l) => l.id === listId)
                    ?.items.filter((it) => it.checked)
                    .map((it) => it.id) || []
                : [];
              setState((prev) => {
                const nextMonths = {...prev.months};
                const targetStore = nextMonths[targetMonthKey] || {budgetCap: 0, transactions: []};
                nextMonths[targetMonthKey] = {
                  ...targetStore,
                  transactions: [newTx, ...targetStore.transactions],
                };
                const nextLists = clearCheckedItems
                  ? prev.shoppingLists.map((l) =>
                      l.id === listId ? {...l, items: l.items.filter((it) => !it.checked)} : l
                    )
                  : prev.shoppingLists;
                return {...prev, months: nextMonths, shoppingLists: nextLists};
              });
              if (authUser) {
                if (clearCheckedItems) {
                  void cloudClearCheckedShoppingItems(authUser.uid, listId, checkedIds, newTx);
                } else {
                  void cloudSaveTransaction(authUser.uid, newTx, false);
                }
              }
              showToast(t('বাজারের খরচ লেনদেনে যোগ হয়েছে!', 'Shopping expense logged!', lang));
            }}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'savings' && (
          <SavingsTab
            goals={state.savingsGoals}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onCreateGoal={(title, target) => {
              const newGoal = {
                id: `goal_${Date.now()}`,
                title,
                target,
                saved: 0,
                createdAt: Date.now(),
              };
              setState((prev) => ({
                ...prev,
                savingsGoals: [...prev.savingsGoals, newGoal],
              }));
              if (authUser) {
                void cloudSaveSavingsGoal(authUser.uid, newGoal, true);
              }
              showToast(t('নতুন সেভিংস গোল তৈরি হয়েছে', 'Savings goal created', lang));
            }}
            onDepositGoal={(goalId, amount) => {
              const targetGoal = state.savingsGoals.find((g) => g.id === goalId);
              const updatedGoal = targetGoal
                ? {...targetGoal, saved: targetGoal.saved + amount}
                : null;
              setState((prev) => ({
                ...prev,
                savingsGoals: prev.savingsGoals.map((g) =>
                  g.id === goalId ? {...g, saved: g.saved + amount} : g
                ),
              }));
              if (authUser && updatedGoal) {
                void cloudSaveSavingsGoal(authUser.uid, updatedGoal, false);
              }
              showToast(t('সেভিংস জমা হয়েছে', 'Deposit added', lang));
            }}
            onDeleteGoal={(goalId) => {
              setState((prev) => ({
                ...prev,
                savingsGoals: prev.savingsGoals.filter((g) => g.id !== goalId),
              }));
              if (authUser) {
                void cloudDeleteSavingsGoal(authUser.uid, goalId);
              }
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
            cloudUser={
              authUser
                ? {
                    uid: authUser.uid,
                    email: authUser.email,
                    displayName: authUser.displayName,
                    photoURL: authUser.photoURL,
                  }
                : null
            }
            cloudSyncing={cloudSyncing}
            cloudError={cloudError}
            authBusy={authBusy}
            isNativePlatform={isNative}
            onSignInGoogle={() => void handleSignInGoogle()}
            onSignOutGoogle={() => void handleSignOutGoogle()}
            onForceCloudSync={() => void handleForceCloudSync()}
            onUpdateProfile={handleUpdateProfile}
            onAddSmartMemory={(item) => {
              const newSm = {...item, id: `sm_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                smartMemory: [...prev.smartMemory, newSm],
              }));
              if (authUser) {
                void cloudAddSmartMemory(authUser.uid, newSm);
              }
              showToast(t('স্মার্ট মেমোরি আইটেম যোগ হয়েছে', 'Fixed item added', lang));
            }}
            onDeleteSmartMemory={(id) => {
              setState((prev) => ({
                ...prev,
                smartMemory: prev.smartMemory.filter((s) => s.id !== id),
              }));
              if (authUser) {
                void cloudDeleteSmartMemory(authUser.uid, id);
              }
            }}
            onAddCategory={(item) => {
              const newCat = {...item, id: `cat_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                categories: [...prev.categories, newCat],
              }));
              if (authUser) {
                void cloudAddCategory(authUser.uid, newCat);
              }
              showToast(t('নতুন ক্যাটাগরি যোগ হয়েছে', 'Category added', lang));
            }}
            onDeleteCategory={(id) => {
              setState((prev) => ({
                ...prev,
                categories: prev.categories.filter((c) => c.id !== id),
              }));
              if (authUser) {
                void cloudDeleteCategory(authUser.uid, id);
              }
            }}
            onAddQuickTemplate={(item) => {
              const newQt = {...item, id: `qt_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                quickTemplates: [...prev.quickTemplates, newQt],
              }));
              if (authUser) {
                void cloudAddQuickTemplate(authUser.uid, newQt);
              }
              showToast(t('কুইক টেমপ্লেট যোগ হয়েছে', 'Template added', lang));
            }}
            onDeleteQuickTemplate={(id) => {
              setState((prev) => ({
                ...prev,
                quickTemplates: prev.quickTemplates.filter((q) => q.id !== id),
              }));
              if (authUser) {
                void cloudDeleteQuickTemplate(authUser.uid, id);
              }
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe print-hide">
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
            onClick={() => setActiveTab(activeTab === 'savings' ? 'savings' : 'shopping')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'shopping' || activeTab === 'savings'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {activeTab === 'savings' ? <PiggyBank className="w-5 h-5" /> : <ShoppingBasket className="w-5 h-5" />}
            <span className="mt-0.5">{t('লিস্ট ও গোল', 'Lists', lang)}</span>
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
        isGeneratingPdf={isGeneratingPdf}
        onClose={() => setPrintModalOpen(false)}
        onDownloadStatement={handleDownloadStatement}
      />

      {/* Cloud Restore vs Merge Modal */}
      {pendingMergeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('ক্লাউডে পুরনো ডেটা পাওয়া গেছে', 'Existing Cloud Data Found', lang)}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingMergeUser.email}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t(
                'আপনার এই ডিভাইসেও কিছু হিসাব সেভ করা আছে এবং ক্লাউড অ্যাকাউন্টেও আগে থেকে ডেটা আছে। আপনি কীভাবে সিঙ্ক করতে চান?',
                'You have offline data on this device as well as existing cloud data. How would you like to sync?',
                lang
              )}
            </p>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => void handleResolveCloudConflict('merge')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('লোকাল ডেটা ক্লাউডের সাথে মার্জ করুন (উভয়ই থাকবে)', 'Merge Local + Cloud Data (Keep Both)', lang)}
              </button>
              <button
                type="button"
                onClick={() => void handleResolveCloudConflict('restore')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
              >
                {t('শুধু ক্লাউডের পুরনো ডেটা রিস্টোর করুন', 'Restore Cloud Data Only', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

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
          className="fixed top-16 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold print-hide"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <OfflineIndicator language={lang} />
    </div>
  );
}
