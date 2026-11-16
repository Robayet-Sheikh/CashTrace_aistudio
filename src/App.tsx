import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {App as CapApp} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';
import {onAuthStateChanged, signInWithPopup, signOut, User} from 'firebase/auth';
import {
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Home,
  Layers,
  Moon,
  Palette,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBasket,
  Sun,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import {DashboardTab} from './components/DashboardTab';
import {PinLockScreen} from './components/PinLockScreen';
import {PocketToolId, PocketToolsTab} from './components/PocketToolsTab';
import {PrintStatementModal} from './components/PrintStatementModal';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {ReportsTab} from './components/ReportsTab';
import {SavingsTab} from './components/SavingsTab';
import {SettingsTab} from './components/SettingsTab';
import {ShoppingListTab} from './components/ShoppingListTab';
import {SpotlightSearchModal} from './components/SpotlightSearchModal';
import {ThemeStudioModal} from './components/ThemeStudioModal';
import {TransactionModal} from './components/TransactionModal';
import {WalletsAndDebtsTab} from './components/WalletsAndDebtsTab';
import {CurrencyProvider, useCurrency} from './contexts/CurrencyContext';
import {auth, googleProvider} from './firebase';
import {SUPPORTED_CURRENCIES} from './services/currencyService';
import {
  checkUserProfileExists,
  cloudAddCategory,
  cloudAddDebt,
  cloudAddQuickTemplate,
  cloudAddSmartMemory,
  cloudBulkToggleShoppingItems,
  cloudClearCheckedShoppingItems,
  cloudCreateProfileWorkspace,
  cloudCreateShoppingItem,
  cloudCreateShoppingList,
  cloudCreateTransactionsBatch,
  cloudDeleteCategory,
  cloudDeleteCategoryBudget,
  cloudDeleteDailyTask,
  cloudDeleteDebt,
  cloudDeleteFinancialNote,
  cloudDeleteProfileWorkspace,
  cloudDeleteQuickTemplate,
  cloudDeleteRecurringBill,
  cloudDeleteSavingsGoal,
  cloudDeleteShoppingItem,
  cloudDeleteShoppingList,
  cloudDeleteSmartMemory,
  cloudDeleteTransaction,
  cloudDeleteVaultItem,
  cloudDeleteWallet,
  cloudDuplicateShoppingList,
  cloudPayDebt,
  cloudPayRecurringBill,
  cloudSaveCategoryBudget,
  cloudSaveDailyTask,
  cloudSaveFinancialNote,
  cloudSaveMonthBudget,
  cloudSaveRecurringBill,
  cloudSaveSavingsGoal,
  cloudSaveTransaction,
  cloudSaveVaultItem,
  cloudSaveWallet,
  cloudSettleAllPersonDebts,
  cloudUpdateDebt,
  cloudUpdateProfile,
  cloudUpdateProfileWorkspace,
  cloudUpdateShoppingItem,
  cloudUpdateShoppingListTitle,
  ensureProfileWorkspaceDoc,
  hasMeaningfulLocalData,
  subscribeToProfilesMeta,
  subscribeToUserCloudData,
  uploadFullStateToCloud,
} from './services/firestoreSync';
import {
  AppTab,
  CashTraceState,
  CategoryBudget,
  DailyTask,
  DebtRecord,
  FinancialNote,
  ProfileMeta,
  RecurringBill,
  ShoppingList,
  ThemeConfig,
  Transaction,
  TransactionType,
  UserProfile,
  VaultItem,
  WalletAccount,
} from './types';
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
import {
  createInitialState,
  DEFAULT_PROFILE_ID,
  deleteProfileStorage,
  loadActiveProfileId,
  loadProfilesRegistry,
  loadState,
  loadStateForProfile,
  PROFILE_COLORS,
  rebaseStateCurrency,
  saveActiveProfileId,
  saveProfilesRegistry,
  saveStateForProfile,
  validateBackupPayload,
} from './utils/storage';
import {applyThemeToDocument, resolveEffectiveThemeConfig} from './utils/themeEngine';

const LAST_SYNCED_UID_KEY = 'cashtrace_last_synced_uid';

export default function App() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>(() => loadProfilesRegistry());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const registry = loadProfilesRegistry();
    const saved = loadActiveProfileId();
    return registry.some((p) => p.id === saved) ? saved : DEFAULT_PROFILE_ID;
  });
  const [state, setState] = useState<CashTraceState>(() => {
    const registry = loadProfilesRegistry();
    const saved = loadActiveProfileId();
    const resolvedId = registry.some((p) => p.id === saved) ? saved : DEFAULT_PROFILE_ID;
    const defaultState = loadState();
    const meta = registry.find((p) => p.id === resolvedId);
    return loadStateForProfile(resolvedId, meta, {
      darkMode: defaultState.profile.darkMode,
      language: defaultState.profile.language,
      pin: defaultState.profile.pin,
      pinLock: defaultState.profile.pinLock,
      themeConfig: defaultState.profile.themeConfig,
    });
  });

  return (
    <CurrencyProvider
      baseCurrency={state.profile.baseCurrency || state.profile.currency}
      displayCurrency={state.profile.currency}
      language={state.profile.language}
    >
      <CashTraceWorkspace
        profiles={profiles}
        setProfiles={setProfiles}
        activeProfileId={activeProfileId}
        setActiveProfileId={setActiveProfileId}
        state={state}
        setState={setState}
      />
    </CurrencyProvider>
  );
}

interface CashTraceWorkspaceProps {
  profiles: ProfileMeta[];
  setProfiles: React.Dispatch<React.SetStateAction<ProfileMeta[]>>;
  activeProfileId: string;
  setActiveProfileId: React.Dispatch<React.SetStateAction<string>>;
  state: CashTraceState;
  setState: React.Dispatch<React.SetStateAction<CashTraceState>>;
}

function CashTraceWorkspace({
  profiles,
  setProfiles,
  activeProfileId,
  setActiveProfileId,
  state,
  setState,
}: CashTraceWorkspaceProps) {
  const {displayCurrency, rate: fxRate} = useCurrency();
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => getLocalMonthKey());
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [activePocketTool, setActivePocketTool] = useState<PocketToolId>('converter');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const defaultState = loadState();
    return !(defaultState.profile.pinLock && defaultState.profile.pin.length === 4);
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
  const activeProfileIdRef = useRef<string>(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const profilesRef = useRef<ProfileMeta[]>(profiles);
  profilesRef.current = profiles;
  const profileSyncTimerRef = useRef<number | null>(null);
  const cloudUnsubRef = useRef<(() => void) | null>(null);

  // Modals & notifications
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDefaultType, setTxDefaultType] = useState<TransactionType>('expense');
  const [initialTxDate, setInitialTxDate] = useState<string | undefined>(undefined);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [quickCreateProfileOpen, setQuickCreateProfileOpen] = useState(false);
  const [quickProfName, setQuickProfName] = useState('');
  const [quickProfCurrency, setQuickProfCurrency] = useState(state.profile.currency || '৳');
  const [quickProfColor, setQuickProfColor] = useState(PROFILE_COLORS[1]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const lang = state.profile.language;
  const isNative = Capacitor.isNativePlatform();
  const activeProfileMeta = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  const effectiveTheme = useMemo(
    () => resolveEffectiveThemeConfig(state.profile.themeConfig, state.profile.darkMode),
    [state.profile.themeConfig, state.profile.darkMode]
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // Persist profiles registry, active profile id, and active workspace state
  useEffect(() => {
    saveProfilesRegistry(profiles);
  }, [profiles]);

  useEffect(() => {
    saveActiveProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    saveStateForProfile(activeProfileId, state);
  }, [activeProfileId, state]);

  useEffect(() => {
    applyThemeToDocument(
      effectiveTheme,
      effectiveTheme.surface === 'dark' || effectiveTheme.surface === 'amoled'
    );
    document.documentElement.lang = state.profile.language;
  }, [effectiveTheme, state.profile.language]);

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

  // Subscribe to Cloud Profiles Registry whenever signed in and not awaiting merge
  useEffect(() => {
    if (!authReady || !authUser || pendingMergeUser) return;
    const unsubProfiles = subscribeToProfilesMeta(authUser, (cloudCustomProfiles, defaultPatch) => {
      setProfiles((prev) => {
        const baseDefault = prev.find((p) => p.id === DEFAULT_PROFILE_ID) || {
          id: DEFAULT_PROFILE_ID,
          name: defaultPatch?.name || 'ব্যক্তিগত (মূল)',
          currency: defaultPatch?.currency || '৳',
          color: PROFILE_COLORS[0],
          createdAt: 0,
        };
        const nextDefault: ProfileMeta = {
          ...baseDefault,
          name: defaultPatch?.name || baseDefault.name,
          currency: defaultPatch?.currency || baseDefault.currency,
        };
        const nextList = [nextDefault, ...cloudCustomProfiles];
        if (
          activeProfileIdRef.current !== DEFAULT_PROFILE_ID &&
          !nextList.some((p) => p.id === activeProfileIdRef.current)
        ) {
          // If active custom profile was deleted remotely, fall back to default cleanly
          setActiveProfileId(DEFAULT_PROFILE_ID);
          setState(loadStateForProfile(DEFAULT_PROFILE_ID, nextDefault));
        }
        return nextList;
      });
    });
    return () => unsubProfiles();
  }, [authReady, authUser, pendingMergeUser]);

  // Attach Firestore cloud listeners for active workspace when auth is ready & user is authenticated
  useEffect(() => {
    if (!authReady || !authUser) return;

    let cancelled = false;
    const targetProfileId = activeProfileId;
    const targetMeta = profilesRef.current.find((p) => p.id === targetProfileId);

    const attachListeners = (u: User, profId: string) => {
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
      }
      cloudUnsubRef.current = subscribeToUserCloudData(
        u,
        (updater) => setState((prev) => updater(prev)),
        setCloudSyncing,
        profId
      );
    };

    (async () => {
      setCloudSyncing(true);
      try {
        if (targetProfileId === DEFAULT_PROFILE_ID) {
          const exists = await checkUserProfileExists(authUser.uid);
          if (cancelled) return;

          if (!exists) {
            await uploadFullStateToCloud(authUser, stateRef.current, false, DEFAULT_PROFILE_ID);
            if (cancelled) return;
            localStorage.setItem(LAST_SYNCED_UID_KEY, authUser.uid);
            setCloudError(null);
            attachListeners(authUser, DEFAULT_PROFILE_ID);
            showToast(
              t(
                'আপনার সব ডেটা Google ক্লাউডে সেভ হয়েছে!',
                'All data backed up to Google Cloud!',
                stateRef.current.profile.language
              )
            );
          } else {
            const lastSyncedUid = localStorage.getItem(LAST_SYNCED_UID_KEY);
            if (lastSyncedUid !== authUser.uid && hasMeaningfulLocalData(stateRef.current)) {
              setCloudSyncing(false);
              setCloudError(null);
              setPendingMergeUser(authUser);
            } else {
              localStorage.setItem(LAST_SYNCED_UID_KEY, authUser.uid);
              setCloudError(null);
              attachListeners(authUser, DEFAULT_PROFILE_ID);
            }
          }
        } else {
          await ensureProfileWorkspaceDoc(authUser, targetProfileId, stateRef.current, targetMeta);
          if (cancelled) return;
          if (hasMeaningfulLocalData(stateRef.current)) {
            await uploadFullStateToCloud(authUser, stateRef.current, true, targetProfileId, targetMeta);
          }
          if (cancelled) return;
          setCloudError(null);
          attachListeners(authUser, targetProfileId);
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
  }, [authReady, authUser, activeProfileId, showToast]);

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
      if (activeProfileId === DEFAULT_PROFILE_ID) {
        await cloudUpdateProfile(authUser, state.profile);
      } else {
        await cloudUpdateProfileWorkspace(
          authUser,
          activeProfileId,
          {
            name: state.profile.name,
            currency: state.profile.currency,
            color: activeProfileMeta?.color,
            hideBalance: state.profile.hideBalance,
          },
          activeProfileMeta
        );
      }
      await uploadFullStateToCloud(authUser, state, true, activeProfileId, activeProfileMeta);
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
        await uploadFullStateToCloud(user, stateRef.current, true, activeProfileId, activeProfileMeta);
      }
      localStorage.setItem(LAST_SYNCED_UID_KEY, user.uid);
      if (cloudUnsubRef.current) cloudUnsubRef.current();
      cloudUnsubRef.current = subscribeToUserCloudData(
        user,
        (updater) => setState((prev) => updater(prev)),
        setCloudSyncing,
        activeProfileId
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

  // Multi-Profile Handlers
  const handleSwitchProfile = useCallback(
    (nextId: string) => {
      if (nextId === activeProfileIdRef.current) return;
      const targetMeta = profilesRef.current.find((p) => p.id === nextId);
      if (!targetMeta) return;

      // Flush current workspace state cleanly before switching
      saveStateForProfile(activeProfileIdRef.current, stateRef.current);

      const inherited: Partial<UserProfile> = {
        darkMode: stateRef.current.profile.darkMode,
        language: stateRef.current.profile.language,
        pin: stateRef.current.profile.pin,
        pinLock: stateRef.current.profile.pinLock,
        themeConfig: stateRef.current.profile.themeConfig,
      };
      const nextState = loadStateForProfile(nextId, targetMeta, inherited);
      saveStateForProfile(nextId, nextState);

      setEditingTx(null);
      setTxModalOpen(false);
      setDeleteTarget(null);
      setActiveProfileId(nextId);
      setState(nextState);
      setProfileModalOpen(false);
      showToast(t(`প্রোফাইল পরিবর্তন: ${targetMeta.name}`, `Switched to: ${targetMeta.name}`, nextState.profile.language));
    },
    [showToast]
  );

  const handleCreateProfile = useCallback(
    ({name, currency, color, copySetup}: {name: string; currency: string; color: string; copySetup: boolean}) => {
      const cleanName = name.trim();
      if (!cleanName) return;

      saveStateForProfile(activeProfileIdRef.current, stateRef.current);

      const newId = `prof_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const newMeta: ProfileMeta = {
        id: newId,
        name: cleanName,
        currency,
        baseCurrency: currency,
        color,
        createdAt: Date.now(),
      };

      const fresh = createInitialState();
      fresh.profile = {
        ...fresh.profile,
        name: cleanName,
        currency,
        baseCurrency: currency,
        darkMode: stateRef.current.profile.darkMode,
        language: stateRef.current.profile.language,
        pin: stateRef.current.profile.pin,
        pinLock: stateRef.current.profile.pinLock,
        themeConfig: stateRef.current.profile.themeConfig,
      };
      if (copySetup) {
        fresh.wallets = stateRef.current.wallets.map((w) => ({...w, initialBalance: 0}));
        fresh.categories = [...stateRef.current.categories];
      }

      saveStateForProfile(newId, fresh);
      setProfiles((prev) => [...prev, newMeta]);
      setActiveProfileId(newId);
      setState(fresh);
      setProfileModalOpen(false);
      setQuickCreateProfileOpen(false);

      if (authUser) {
        void cloudCreateProfileWorkspace(authUser, newMeta, fresh);
      }

      showToast(t(`নতুন প্রোফাইল '${cleanName}' তৈরি ও চালু হয়েছে`, `Created & switched to '${cleanName}'`, lang));
    },
    [authUser, lang, showToast]
  );

  const handleUpdateProfileMeta = useCallback(
    (profileId: string, patch: Partial<ProfileMeta>) => {
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? {...p, ...patch} : p)));
      const currentMeta = profilesRef.current.find((p) => p.id === profileId);

      if (profileId === activeProfileIdRef.current) {
        setState((prev) => {
          const nextProfile: UserProfile = {
            ...prev.profile,
            name: patch.name !== undefined ? patch.name : prev.profile.name,
            currency: patch.currency !== undefined ? patch.currency : prev.profile.currency,
          };
          if (authUser) {
            if (profileId === DEFAULT_PROFILE_ID) {
              void cloudUpdateProfile(authUser, nextProfile);
            } else {
              void cloudUpdateProfileWorkspace(authUser, profileId, patch, currentMeta);
            }
          }
          return {...prev, profile: nextProfile};
        });
      } else {
        const stored = loadStateForProfile(profileId, currentMeta);
        stored.profile = {
          ...stored.profile,
          name: patch.name !== undefined ? patch.name : stored.profile.name,
          currency: patch.currency !== undefined ? patch.currency : stored.profile.currency,
        };
        saveStateForProfile(profileId, stored);
        if (authUser) {
          if (profileId === DEFAULT_PROFILE_ID) {
            void cloudUpdateProfile(authUser, stored.profile);
          } else {
            void cloudUpdateProfileWorkspace(authUser, profileId, patch, currentMeta);
          }
        }
      }
      showToast(t('প্রোফাইল তথ্য আপডেট হয়েছে', 'Profile updated', lang));
    },
    [authUser, lang, showToast]
  );

  const handleDeleteProfile = useCallback(
    (profileId: string) => {
      if (profileId === DEFAULT_PROFILE_ID) return;
      deleteProfileStorage(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      if (activeProfileIdRef.current === profileId) {
        const defaultMeta = profilesRef.current.find((p) => p.id === DEFAULT_PROFILE_ID);
        const fallback = loadStateForProfile(DEFAULT_PROFILE_ID, defaultMeta, {
          darkMode: stateRef.current.profile.darkMode,
          language: stateRef.current.profile.language,
          pin: stateRef.current.profile.pin,
          pinLock: stateRef.current.profile.pinLock,
          themeConfig: stateRef.current.profile.themeConfig,
        });
        setActiveProfileId(DEFAULT_PROFILE_ID);
        setState(fallback);
      }
      if (authUser) {
        void cloudDeleteProfileWorkspace(authUser.uid, profileId);
      }
      showToast(t('প্রোফাইল ডিলিট হয়েছে', 'Profile deleted', lang));
    },
    [authUser, lang, showToast]
  );

  // Global Cmd+K / Ctrl+K Spotlight Search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Native Android hardware back button handling
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('backButton', ({canGoBack}) => {
      if (spotlightOpen) {
        setSpotlightOpen(false);
      } else if (txModalOpen) {
        setTxModalOpen(false);
      } else if (themeStudioOpen) {
        setThemeStudioOpen(false);
      } else if (printModalOpen) {
        setPrintModalOpen(false);
      } else if (deleteTarget) {
        setDeleteTarget(null);
      } else if (profileModalOpen) {
        setProfileModalOpen(false);
      } else if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
      } else if (!canGoBack) {
        CapApp.exitApp();
      }
    });
    return () => {
      listener.then((h) => h.remove());
    };
  }, [spotlightOpen, txModalOpen, themeStudioOpen, printModalOpen, deleteTarget, profileModalOpen, activeTab]);

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
      void cloudSaveTransaction(authUser.uid, newTx, Boolean(editingId), activeProfileId);
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
      void cloudDeleteTransaction(authUser.uid, id, activeProfileId);
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
      void cloudSaveMonthBudget(authUser.uid, selectedMonthKey, cap, activeProfileId);
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
      void cloudCreateTransactionsBatch(authUser.uid, newEntries, activeProfileId);
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
    const profId = activeProfileIdRef.current;
    if (patch.name !== undefined || patch.currency !== undefined) {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profId
            ? {
                ...p,
                name: patch.name !== undefined ? patch.name : p.name,
                currency: patch.currency !== undefined ? patch.currency : p.currency,
              }
            : p
        )
      );
    }

    setState((prev) => {
      let resolvedThemeConfig = prev.profile.themeConfig;
      if (patch.themeConfig !== undefined) {
        resolvedThemeConfig = resolveEffectiveThemeConfig(patch.themeConfig, patch.darkMode);
      } else if (patch.darkMode !== undefined) {
        const curSurface = prev.profile.themeConfig?.surface || (prev.profile.darkMode ? 'dark' : 'light');
        const nextSurface = patch.darkMode
          ? curSurface === 'amoled'
            ? 'amoled'
            : 'dark'
          : curSurface === 'warm'
          ? 'warm'
          : 'light';
        resolvedThemeConfig = resolveEffectiveThemeConfig(
          {...prev.profile.themeConfig, surface: nextSurface},
          patch.darkMode
        );
      }

      const nextProfile: UserProfile = {
        ...prev.profile,
        ...patch,
        themeConfig: resolvedThemeConfig,
      };

      // Propagate app-wide preferences cleanly to Default profile when editing inside a custom profile
      const hasGlobalPref =
        patch.darkMode !== undefined ||
        patch.language !== undefined ||
        patch.pin !== undefined ||
        patch.pinLock !== undefined ||
        patch.themeConfig !== undefined;

      if (profId !== DEFAULT_PROFILE_ID && hasGlobalPref) {
        const defaultStored = loadStateForProfile(DEFAULT_PROFILE_ID);
        defaultStored.profile = {
          ...defaultStored.profile,
          darkMode: nextProfile.darkMode,
          language: nextProfile.language,
          pin: nextProfile.pin,
          pinLock: nextProfile.pinLock,
          themeConfig: nextProfile.themeConfig,
        };
        saveStateForProfile(DEFAULT_PROFILE_ID, defaultStored);
      }

      if (authUser) {
        if (profileSyncTimerRef.current) {
          window.clearTimeout(profileSyncTimerRef.current);
        }
        profileSyncTimerRef.current = window.setTimeout(() => {
          if (profId === DEFAULT_PROFILE_ID) {
            void cloudUpdateProfile(authUser, nextProfile);
          } else {
            if (
              patch.name !== undefined ||
              patch.currency !== undefined ||
              patch.hideBalance !== undefined
            ) {
              void cloudUpdateProfileWorkspace(
                authUser,
                profId,
                {
                  name: nextProfile.name,
                  currency: nextProfile.currency,
                  hideBalance: nextProfile.hideBalance,
                },
                profilesRef.current.find((p) => p.id === profId)
              );
            }
            if (hasGlobalPref) {
              const defaultStored = loadStateForProfile(DEFAULT_PROFILE_ID);
              void cloudUpdateProfile(authUser, defaultStored.profile);
            }
          }
        }, 550);
      }

      return {
        ...prev,
        profile: nextProfile,
      };
    });
  };

  const handleChangeTheme = (nextTheme: ThemeConfig) => {
    const isDark = nextTheme.surface === 'dark' || nextTheme.surface === 'amoled';
    handleUpdateProfile({
      themeConfig: nextTheme,
      darkMode: isDark,
    });
  };

  const handleRebaseCurrency = async (nextCurrency: string, rate: number) => {
    const rebased = rebaseStateCurrency(stateRef.current, nextCurrency, rate);
    setState(rebased);
    const profId = activeProfileIdRef.current;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === profId ? {...p, currency: nextCurrency, baseCurrency: nextCurrency} : p
      )
    );
    if (authUser) {
      setCloudSyncing(true);
      try {
        if (profId === DEFAULT_PROFILE_ID) {
          await cloudUpdateProfile(authUser, rebased.profile);
        } else {
          await cloudUpdateProfileWorkspace(
            authUser,
            profId,
            {currency: nextCurrency, baseCurrency: nextCurrency},
            activeProfileMeta
          );
        }
        await uploadFullStateToCloud(authUser, rebased, false, profId, activeProfileMeta);
      } finally {
        setCloudSyncing(false);
      }
    }
    showToast(
      t(
        `সব হিসাব ${nextCurrency} মুদ্রায় রূপান্তরিত হয়েছে`,
        `All records rebased to ${nextCurrency}`,
        lang
      )
    );
  };

  const handleSaveCategoryBudget = (cb: CategoryBudget) => {
    setState((prev) => {
      const exists = (prev.categoryBudgets || []).some((x) => x.id === cb.id);
      return {
        ...prev,
        categoryBudgets: exists
          ? prev.categoryBudgets.map((x) => (x.id === cb.id ? cb : x))
          : [...(prev.categoryBudgets || []), cb],
      };
    });
    if (authUser) {
      void cloudSaveCategoryBudget(authUser.uid, cb, activeProfileId);
    }
    showToast(t('ক্যাটাগরি বাজেট সেভ হয়েছে', 'Category budget saved', lang));
  };

  const handleDeleteCategoryBudget = (budgetId: string) => {
    setState((prev) => ({
      ...prev,
      categoryBudgets: (prev.categoryBudgets || []).filter((x) => x.id !== budgetId),
    }));
    if (authUser) {
      void cloudDeleteCategoryBudget(authUser.uid, budgetId, activeProfileId);
    }
    showToast(t('ক্যাটাগরি বাজেট ডিলিট হয়েছে', 'Category budget deleted', lang));
  };

  const handleSaveRecurringBill = (bill: RecurringBill) => {
    setState((prev) => {
      const list = prev.recurringBills || [];
      const exists = list.some((b) => b.id === bill.id);
      const nextList = exists ? list.map((b) => (b.id === bill.id ? bill : b)) : [...list, bill];
      return {
        ...prev,
        recurringBills: nextList.sort((a, b) => a.dueDay - b.dueDay),
      };
    });
    if (authUser) {
      void cloudSaveRecurringBill(authUser.uid, bill, activeProfileId);
    }
    showToast(t('নিয়মিত বিল সেভ হয়েছে', 'Recurring bill saved', lang));
  };

  const handleDeleteRecurringBill = (billId: string) => {
    setState((prev) => ({
      ...prev,
      recurringBills: (prev.recurringBills || []).filter((b) => b.id !== billId),
    }));
    if (authUser) {
      void cloudDeleteRecurringBill(authUser.uid, billId, activeProfileId);
    }
    showToast(t('বিল ডিলিট করা হয়েছে', 'Bill deleted', lang));
  };

  const handlePayRecurringBill = (bill: RecurringBill, monthKey: string) => {
    const updatedBill: RecurringBill = {
      ...bill,
      paidMonths: bill.paidMonths.includes(monthKey)
        ? bill.paidMonths
        : [...bill.paidMonths, monthKey],
    };
    const today = getLocalDateStr();
    const txDate = today.startsWith(monthKey)
      ? today
      : `${monthKey}-${String(Math.min(28, Math.max(1, bill.dueDay))).padStart(2, '0')}`;
    const expenseTx: Transaction = {
      id: `bill_tx_${Date.now()}`,
      type: 'expense',
      title: bill.title,
      amount: bill.amount,
      category: bill.category || '🏠 বাসা ভাড়া ও বিল',
      subcategory: t('নিয়মিত বিল', 'Recurring Bill', lang),
      date: txDate,
      walletId: bill.walletId || 'cash',
      createdAt: Date.now(),
    };
    setState((prev) => {
      const mStore = prev.months[monthKey] || {budgetCap: 0, transactions: []};
      return {
        ...prev,
        recurringBills: (prev.recurringBills || []).map((b) =>
          b.id === bill.id ? updatedBill : b
        ),
        months: {
          ...prev.months,
          [monthKey]: {
            ...mStore,
            transactions: [expenseTx, ...mStore.transactions],
          },
        },
      };
    });
    if (authUser) {
      void cloudPayRecurringBill(authUser.uid, updatedBill, expenseTx, activeProfileId);
    }
    showToast(
      t(
        `"${bill.title}" পরিশোধ ও খরচে যোগ হয়েছে`,
        `Paid "${bill.title}" & logged expense`,
        lang
      )
    );
  };

  const handlePushSplitsToDebts = (
    splits: Array<Omit<DebtRecord, 'id' | 'paidAmount' | 'settled'>>
  ) => {
    if (splits.length === 0) return;
    const now = Date.now();
    const created: DebtRecord[] = splits.map((s, idx) => ({
      ...s,
      id: `debt_split_${now}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      paidAmount: 0,
      settled: false,
    }));
    setState((prev) => ({
      ...prev,
      debts: [...created, ...prev.debts],
    }));
    if (authUser) {
      created.forEach((d) => {
        void cloudAddDebt(authUser.uid, d, undefined, activeProfileId);
      });
    }
    showToast(
      t(
        `${created.length} টি বিল স্প্লিট ওয়ালেট ও বাকির হিসাবে যোগ হয়েছে`,
        `Added ${created.length} split records to Wallets & Debts`,
        lang
      )
    );
  };

  const handleSaveNote = (note: FinancialNote) => {
    setState((prev) => {
      const list = prev.financialNotes || [];
      const exists = list.some((n) => n.id === note.id);
      const next = exists ? list.map((n) => (n.id === note.id ? note : n)) : [note, ...list];
      next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
      return {...prev, financialNotes: next};
    });
    if (authUser) {
      void cloudSaveFinancialNote(authUser.uid, note, activeProfileId);
    }
    showToast(t('নোট সেভ হয়েছে', 'Note saved', lang));
  };

  const handleDeleteNote = (noteId: string) => {
    setState((prev) => ({
      ...prev,
      financialNotes: (prev.financialNotes || []).filter((n) => n.id !== noteId),
    }));
    if (authUser) {
      void cloudDeleteFinancialNote(authUser.uid, noteId, activeProfileId);
    }
    showToast(t('নোট ডিলিট হয়েছে', 'Note deleted', lang));
  };

  const handleSaveDailyTask = (task: DailyTask) => {
    setState((prev) => {
      const list = prev.dailyTasks || [];
      const exists = list.some((tItem) => tItem.id === task.id);
      const next = exists
        ? list.map((tItem) => (tItem.id === task.id ? task : tItem))
        : [task, ...list];
      return {...prev, dailyTasks: next};
    });
    if (authUser) {
      void cloudSaveDailyTask(authUser.uid, task, activeProfileId);
    }
  };

  const handleDeleteDailyTask = (taskId: string) => {
    setState((prev) => ({
      ...prev,
      dailyTasks: (prev.dailyTasks || []).filter((tItem) => tItem.id !== taskId),
    }));
    if (authUser) {
      void cloudDeleteDailyTask(authUser.uid, taskId, activeProfileId);
    }
    showToast(t('কাজ ডিলিট করা হয়েছে', 'Task deleted', lang));
  };

  const handleSaveVaultItem = (item: VaultItem) => {
    setState((prev) => {
      const list = prev.vaultItems || [];
      const exists = list.some((v) => v.id === item.id);
      const next = exists ? list.map((v) => (v.id === item.id ? item : v)) : [item, ...list];
      return {...prev, vaultItems: next};
    });
    if (authUser) {
      void cloudSaveVaultItem(authUser.uid, item, activeProfileId);
    }
    showToast(t('ভল্টে নিরাপদে সেভ হয়েছে', 'Saved to Pocket Vault', lang));
  };

  const handleDeleteVaultItem = (itemId: string) => {
    setState((prev) => ({
      ...prev,
      vaultItems: (prev.vaultItems || []).filter((v) => v.id !== itemId),
    }));
    if (authUser) {
      void cloudDeleteVaultItem(authUser.uid, itemId, activeProfileId);
    }
    showToast(t('ভল্ট আইটেম ডিলিট হয়েছে', 'Vault item deleted', lang));
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
        displayCurrency,
        fxRate
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
        state.wallets,
        fxRate
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
        displayCurrency,
        lang,
        fxRate
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
          const syncProfile =
            activeProfileId === DEFAULT_PROFILE_ID
              ? cloudUpdateProfile(authUser, validated.profile)
              : cloudUpdateProfileWorkspace(
                  authUser,
                  activeProfileId,
                  {
                    name: validated.profile.name,
                    currency: validated.profile.currency,
                    hideBalance: validated.profile.hideBalance,
                  },
                  activeProfileMeta
                );
          void Promise.all([
            syncProfile,
            uploadFullStateToCloud(authUser, validated, true, activeProfileId, activeProfileMeta),
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

  const totalWalletBalance = useMemo(() => {
    const map = new Map<string, number>();
    state.wallets.forEach((w) => map.set(w.id, w.initialBalance || 0));
    Object.values(state.months).forEach((m) => {
      (m.transactions || []).forEach((tx) => {
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
    let total = 0;
    map.forEach((v) => {
      total += v;
    });
    return total;
  }, [state.wallets, state.months]);

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
    {id: 'tools', bn: 'পকেট টুলস', en: 'Tools'},
    {id: 'settings', bn: 'সেটিংস', en: 'Settings'},
  ];

  return (
    <div className="min-h-screen flex flex-col ct-surface-page transition-colors">
      {/* Top Bar Contract: Brand wordmark — Nav links — Primary action */}
      <header className="sticky top-0 z-30 pt-safe ct-surface-header backdrop-blur-md border-b print-hide">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3 md:gap-6">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white hover:opacity-80 transition-opacity whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{backgroundColor: effectiveTheme.accentColor}}
            />
            <span>CashTrace</span>
          </button>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'ct-accent-border ct-accent-text font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {lang === 'bn' ? item.bn : item.en}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Compact Mobile Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton language={lang} compact />
            <button
              type="button"
              onClick={() => setSpotlightOpen(true)}
              className="min-h-[38px] min-w-[38px] px-2 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors hover:ct-accent-text"
              title={t('স্পটলাইট সার্চ (⌘K)', 'Spotlight Search (⌘K / Ctrl+K)', lang)}
              aria-label="Spotlight Search"
            >
              <Search className="w-4 h-4" />
              <span className="hidden xl:inline font-mono text-[11px] text-slate-400">⌘K</span>
            </button>
            <button
              type="button"
              onClick={() => setThemeStudioOpen(true)}
              className="min-h-[38px] min-w-[38px] px-2 ct-btn-radius ct-accent-soft inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-transform active:scale-95"
              title={t('থিম ও ডিজাইন স্টুডিও', 'Theme & Design Studio', lang)}
              aria-label="Theme Studio"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden xl:inline">{t('থিম', 'Theme', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => (authUser ? setActiveTab('settings') : void handleSignInGoogle())}
              className="min-h-[38px] px-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
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
                        : 'ct-accent-text'
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
              className="md:hidden min-h-[38px] min-w-[38px] ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 flex items-center justify-center"
              aria-label="Toggle theme"
            >
              {state.profile.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`md:hidden min-h-[38px] min-w-[38px] ct-btn-radius flex items-center justify-center ${
                activeTab === 'settings'
                  ? 'ct-accent-bg'
                  : 'ct-surface-alt text-slate-700 dark:text-slate-200'
              }`}
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setInitialTxDate(undefined);
                setEditingTx(null);
                setTxDefaultType('expense');
                setTxModalOpen(true);
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 ct-btn-radius ct-accent-bg text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t('নতুন এন্ট্রি', 'Add Entry', lang)}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 pb-24 md:pb-10 space-y-5 print-hide">
        {/* Compact Active Profile Workspace Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 ct-surface-card border px-3.5 py-2">
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="flex items-center gap-2.5 text-left min-h-[36px] min-w-0 group"
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{backgroundColor: activeProfileMeta?.color || PROFILE_COLORS[0]}}
            />
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:opacity-80 transition-opacity">
              {activeProfileMeta?.name || state.profile.name}
            </span>
            <span className="text-xs text-slate-400">· {displayCurrency}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {profiles.length > 1 && (
              <span className="hidden sm:inline text-xs text-slate-400">
                {t(`${profiles.length} টি প্রোফাইল`, `${profiles.length} profiles`, lang)}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setQuickProfName('');
                setQuickProfCurrency(state.profile.currency || '৳');
                setQuickProfColor(PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[1]);
                setQuickCreateProfileOpen(true);
              }}
              className="px-2.5 py-1.5 ct-btn-radius ct-surface-alt hover:opacity-90 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('প্রোফাইল', 'Profile', lang)}</span>
            </button>
          </div>
        </div>

        {/* Month Selector Workspace Bar (shown on Dashboard & Reports) */}
        {(activeTab === 'dashboard' || activeTab === 'reports') && (
          <div className="flex items-center justify-between gap-2 ct-surface-card border px-3 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="min-h-[40px] min-w-[40px] ct-btn-radius hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 ct-accent-text shrink-0" />
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
              className="min-h-[40px] min-w-[40px] ct-btn-radius hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mobile Segmented Switcher for Shopping Lists, Savings Goals & Pocket Tools */}
        {(activeTab === 'shopping' || activeTab === 'savings' || activeTab === 'tools') && (
          <div className="md:hidden grid grid-cols-3 gap-1.5 p-1 ct-surface-card border">
            <button
              type="button"
              onClick={() => setActiveTab('shopping')}
              className={`py-2.5 ct-btn-radius text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'shopping'
                  ? 'ct-accent-bg shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ShoppingBasket className="w-4 h-4" />
              <span>{t('বাজার', 'Lists', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('savings')}
              className={`py-2.5 ct-btn-radius text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'savings'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <PiggyBank className="w-4 h-4" />
              <span>{t('সেভিংস', 'Savings', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tools')}
              className={`py-2.5 ct-btn-radius text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'tools'
                  ? 'ct-accent-bg shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>{t('টুলস', 'Tools', lang)}</span>
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            selectedMonthKey={selectedMonthKey}
            monthStore={currentMonthStore}
            months={state.months}
            wallets={state.wallets}
            debts={state.debts}
            categories={state.categories}
            categoryBudgets={state.categoryBudgets || []}
            activeProfile={activeProfileMeta}
            userName={state.profile.name}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            smartMemoryCount={state.smartMemory.length}
            pendingShoppingCount={pendingShoppingCount}
            dailyTasks={state.dailyTasks || []}
            heroCardStyle={effectiveTheme.cardStyle}
            accentColor={effectiveTheme.accentColor}
            cloudUserEmail={authUser?.email || null}
            authBusy={authBusy}
            onSignInGoogle={() => void handleSignInGoogle()}
            onToggleHideBalance={() =>
              handleUpdateProfile({hideBalance: !state.profile.hideBalance})
            }
            onUpdateBudgetCap={handleUpdateBudgetCap}
            onApplySmartMemory={handleApplySmartMemory}
            onQuickAddTransaction={(txData) => handleSaveTransaction(txData)}
            onToggleDailyTask={(task) => handleSaveDailyTask({...task, done: !task.done})}
            onQuickAddDailyTask={(title) =>
              handleSaveDailyTask({
                id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                title: title.slice(0, 160),
                done: false,
                priority: 'normal',
                createdAt: Date.now(),
              })
            }
            onOpenSpotlightSearch={() => setSpotlightOpen(true)}
            onOpenNewTransaction={(type) => {
              setInitialTxDate(undefined);
              setEditingTx(null);
              setTxDefaultType(type);
              setTxModalOpen(true);
            }}
            onEditTransaction={(tx) => {
              setInitialTxDate(undefined);
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onDeleteTransaction={(tx) => setDeleteTarget(tx)}
            onNavigateTab={setActiveTab}
            onOpenPocketTool={(toolId) => {
              setActivePocketTool(toolId);
              setActiveTab('tools');
            }}
            onOpenPrintModal={() => setPrintModalOpen(true)}
            onExportExcel={handleExportExcel}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            selectedMonthKey={selectedMonthKey}
            months={state.months}
            wallets={state.wallets}
            categories={state.categories}
            categoryBudgets={state.categoryBudgets || []}
            userName={state.profile.name}
            accentColor={effectiveTheme.accentColor}
            currency={state.profile.currency}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onEditTransaction={(tx) => {
              setInitialTxDate(undefined);
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onDuplicateTransaction={handleDuplicateTransaction}
            onDeleteTransaction={(tx) => setDeleteTarget(tx)}
            onSaveCategoryBudget={handleSaveCategoryBudget}
            onDeleteCategoryBudget={handleDeleteCategoryBudget}
            onOpenNewTransactionForDate={(dateStr) => {
              setInitialTxDate(dateStr);
              setEditingTx(null);
              setTxDefaultType('expense');
              setTxModalOpen(true);
            }}
            onOpenPrintModal={() => setPrintModalOpen(true)}
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            onShowToast={showToast}
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
            onSaveWallet={(walletData, editingId) => {
              const targetId = editingId || `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
              const savedWallet: WalletAccount = {...walletData, id: targetId};
              setState((prev) => ({
                ...prev,
                wallets: editingId
                  ? prev.wallets.map((w) => (w.id === editingId ? savedWallet : w))
                  : [...prev.wallets, savedWallet],
              }));
              if (authUser) {
                void cloudSaveWallet(authUser.uid, savedWallet, !editingId, activeProfileId);
              }
              showToast(
                editingId
                  ? t('ওয়ালেট আপডেট হয়েছে', 'Wallet updated', lang)
                  : t('নতুন ওয়ালেট যোগ হয়েছে', 'Wallet added', lang)
              );
            }}
            onDeleteWallet={(walletId) => {
              if (state.wallets.length <= 1) return;
              setState((prev) => ({
                ...prev,
                wallets: prev.wallets.filter((w) => w.id !== walletId),
              }));
              if (authUser) {
                void cloudDeleteWallet(authUser.uid, walletId, activeProfileId);
              }
              showToast(t('ওয়ালেট ডিলিট হয়েছে', 'Wallet deleted', lang));
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
                void cloudAddDebt(authUser.uid, newDebt, createdTx, activeProfileId);
              }
              showToast(t('দেনা-পাওনার হিসাব যোগ হয়েছে', 'Record added', lang));
            }}
            onUpdateDebt={(updatedDebt) => {
              setState((prev) => ({
                ...prev,
                debts: prev.debts.map((d) => (d.id === updatedDebt.id ? updatedDebt : d)),
              }));
              if (authUser) {
                void cloudUpdateDebt(authUser.uid, updatedDebt, activeProfileId);
              }
              showToast(t('বাকি/বকেয়া হিসাব আপডেট হয়েছে', 'Debt record updated', lang));
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
                void cloudPayDebt(authUser.uid, debtId, nextPaid, nextSettled, createdTx, activeProfileId);
              }
              showToast(t('পরিশোধ আপডেট হয়েছে', 'Payment recorded', lang));
            }}
            onSettleAllPersonDebts={(personName, debtIds) => {
              const targets = state.debts.filter((d) => debtIds.includes(d.id));
              setState((prev) => ({
                ...prev,
                debts: prev.debts.map((d) =>
                  debtIds.includes(d.id) ? {...d, paidAmount: d.amount, settled: true} : d
                ),
              }));
              if (authUser && targets.length > 0) {
                void cloudSettleAllPersonDebts(authUser.uid, targets, undefined, activeProfileId);
              }
              showToast(t(`${personName}-এর সব হিসাব সেটেল হয়েছে`, `Settled all records for ${personName}`, lang));
            }}
            onDeleteDebt={(debtId) => {
              setState((prev) => ({
                ...prev,
                debts: prev.debts.filter((d) => d.id !== debtId),
              }));
              if (authUser) {
                void cloudDeleteDebt(authUser.uid, debtId, activeProfileId);
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
                void cloudCreateShoppingList(authUser.uid, newList, activeProfileId);
              }
              showToast(t('নতুন বাজার লিস্ট তৈরি হয়েছে', 'Shopping list created', lang));
              return newId;
            }}
            onRenameList={(listId, nextTitle) => {
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId ? {...l, title: nextTitle} : l
                ),
              }));
              if (authUser) {
                void cloudUpdateShoppingListTitle(authUser.uid, listId, nextTitle, activeProfileId);
              }
              showToast(t('লিস্টের নাম আপডেট হয়েছে', 'List renamed', lang));
            }}
            onDuplicateList={(listId) => {
              const src = state.shoppingLists.find((l) => l.id === listId);
              const newId = `list_${Date.now()}`;
              const cloned: ShoppingList = {
                id: newId,
                title: src
                  ? `${src.title} ${t('(কপি)', '(Copy)', lang)}`
                  : t('নতুন বাজার লিস্ট', 'Shopping List', lang),
                items: (src?.items || []).map((it, idx) => ({
                  ...it,
                  id: `sitem_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
                  checked: false,
                  createdAt: Date.now() - idx,
                })),
                createdAt: Date.now(),
              };
              setState((prev) => ({
                ...prev,
                shoppingLists: [cloned, ...prev.shoppingLists],
              }));
              if (authUser) {
                void cloudDuplicateShoppingList(authUser.uid, cloned, activeProfileId);
              }
              showToast(t('লিস্ট ডুপ্লিকেট হয়েছে', 'List duplicated', lang));
              return newId;
            }}
            onDeleteList={(listId) => {
              const targetList = state.shoppingLists.find((l) => l.id === listId);
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.filter((l) => l.id !== listId),
              }));
              if (authUser && targetList) {
                void cloudDeleteShoppingList(authUser.uid, targetList, activeProfileId);
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
                void cloudCreateShoppingItem(authUser.uid, listId, newItem, activeProfileId);
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
                void cloudUpdateShoppingItem(
                  authUser.uid,
                  listId,
                  {...targetItem, checked: nextChecked},
                  activeProfileId
                );
              }
            }}
            onBulkToggleChecked={(listId, checked) => {
              const itemIds =
                state.shoppingLists.find((l) => l.id === listId)?.items.map((it) => it.id) || [];
              if (itemIds.length === 0) return;
              setState((prev) => ({
                ...prev,
                shoppingLists: prev.shoppingLists.map((l) =>
                  l.id === listId
                    ? {...l, items: l.items.map((it) => ({...it, checked}))}
                    : l
                ),
              }));
              if (authUser) {
                void cloudBulkToggleShoppingItems(
                  authUser.uid,
                  listId,
                  itemIds,
                  checked,
                  activeProfileId
                );
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
                void cloudUpdateShoppingItem(
                  authUser.uid,
                  listId,
                  {...targetItem, ...patch},
                  activeProfileId
                );
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
                void cloudDeleteShoppingItem(authUser.uid, listId, itemId, activeProfileId);
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
                void cloudClearCheckedShoppingItems(
                  authUser.uid,
                  listId,
                  checkedIds,
                  undefined,
                  activeProfileId
                );
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
                  void cloudClearCheckedShoppingItems(
                    authUser.uid,
                    listId,
                    checkedIds,
                    newTx,
                    activeProfileId
                  );
                } else {
                  void cloudSaveTransaction(authUser.uid, newTx, false, activeProfileId);
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
                void cloudSaveSavingsGoal(authUser.uid, newGoal, true, activeProfileId);
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
                void cloudSaveSavingsGoal(authUser.uid, updatedGoal, false, activeProfileId);
              }
              showToast(t('সেভিংস জমা হয়েছে', 'Deposit added', lang));
            }}
            onDeleteGoal={(goalId) => {
              setState((prev) => ({
                ...prev,
                savingsGoals: prev.savingsGoals.filter((g) => g.id !== goalId),
              }));
              if (authUser) {
                void cloudDeleteSavingsGoal(authUser.uid, goalId, activeProfileId);
              }
              showToast(t('সেভিংস গোল ডিলিট হয়েছে', 'Savings goal deleted', lang));
            }}
          />
        )}

        {activeTab === 'tools' && (
          <PocketToolsTab
            initialTool={activePocketTool}
            wallets={state.wallets}
            categories={state.categories}
            recurringBills={state.recurringBills || []}
            financialNotes={state.financialNotes || []}
            dailyTasks={state.dailyTasks || []}
            vaultItems={state.vaultItems || []}
            userPin={state.profile.pin}
            userName={state.profile.name}
            accentColor={effectiveTheme.accentColor}
            totalWalletBalance={totalWalletBalance}
            language={lang}
            hideBalance={state.profile.hideBalance}
            onAddExpenseTx={(txData) => handleSaveTransaction(txData)}
            onSaveRecurringBill={handleSaveRecurringBill}
            onDeleteRecurringBill={handleDeleteRecurringBill}
            onPayRecurringBill={handlePayRecurringBill}
            onPushSplitsToDebts={handlePushSplitsToDebts}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
            onSaveDailyTask={handleSaveDailyTask}
            onDeleteDailyTask={handleDeleteDailyTask}
            onSaveVaultItem={handleSaveVaultItem}
            onDeleteVaultItem={handleDeleteVaultItem}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            profile={state.profile}
            profiles={profiles}
            activeProfileId={activeProfileId}
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
            onSwitchProfile={handleSwitchProfile}
            onCreateProfile={handleCreateProfile}
            onUpdateProfileMeta={handleUpdateProfileMeta}
            onDeleteProfile={handleDeleteProfile}
            onUpdateProfile={handleUpdateProfile}
            onAddSmartMemory={(item) => {
              const newSm = {...item, id: `sm_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                smartMemory: [...prev.smartMemory, newSm],
              }));
              if (authUser) {
                void cloudAddSmartMemory(authUser.uid, newSm, activeProfileId);
              }
              showToast(t('স্মার্ট মেমোরি আইটেম যোগ হয়েছে', 'Fixed item added', lang));
            }}
            onDeleteSmartMemory={(id) => {
              setState((prev) => ({
                ...prev,
                smartMemory: prev.smartMemory.filter((s) => s.id !== id),
              }));
              if (authUser) {
                void cloudDeleteSmartMemory(authUser.uid, id, activeProfileId);
              }
            }}
            onAddCategory={(item) => {
              const newCat = {...item, id: `cat_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                categories: [...prev.categories, newCat],
              }));
              if (authUser) {
                void cloudAddCategory(authUser.uid, newCat, activeProfileId);
              }
              showToast(t('নতুন ক্যাটাগরি যোগ হয়েছে', 'Category added', lang));
            }}
            onDeleteCategory={(id) => {
              setState((prev) => ({
                ...prev,
                categories: prev.categories.filter((c) => c.id !== id),
              }));
              if (authUser) {
                void cloudDeleteCategory(authUser.uid, id, activeProfileId);
              }
            }}
            onAddQuickTemplate={(item) => {
              const newQt = {...item, id: `qt_${Date.now()}`};
              setState((prev) => ({
                ...prev,
                quickTemplates: [...prev.quickTemplates, newQt],
              }));
              if (authUser) {
                void cloudAddQuickTemplate(authUser.uid, newQt, activeProfileId);
              }
              showToast(t('কুইক টেমপ্লেট যোগ হয়েছে', 'Template added', lang));
            }}
            onDeleteQuickTemplate={(id) => {
              setState((prev) => ({
                ...prev,
                quickTemplates: prev.quickTemplates.filter((q) => q.id !== id),
              }));
              if (authUser) {
                void cloudDeleteQuickTemplate(authUser.uid, id, activeProfileId);
              }
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onOpenThemeStudio={() => setThemeStudioOpen(true)}
            onRebaseCurrency={handleRebaseCurrency}
            onOpenCurrencyConverter={() => {
              setActivePocketTool('converter');
              setActiveTab('tools');
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 ct-surface-header backdrop-blur-md border-t pb-safe print-hide">
        <div className="grid grid-cols-5 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'dashboard'
                ? 'ct-accent-text'
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
                ? 'ct-accent-text'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="mt-0.5">{t('রিপোর্ট', 'Reports', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInitialTxDate(undefined);
              setEditingTx(null);
              setTxDefaultType('expense');
              setTxModalOpen(true);
            }}
            aria-label="Add Transaction"
            className="flex flex-col items-center justify-center"
          >
            <span className="w-11 h-11 ct-btn-radius ct-accent-bg shadow-md flex items-center justify-center active:scale-95 transition-transform">
              <Plus className="w-6 h-6" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallets')}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'wallets'
                ? 'ct-accent-text'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="mt-0.5">{t('ওয়ালেট', 'Wallets', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveTab(
                activeTab === 'savings' || activeTab === 'tools' ? activeTab : 'shopping'
              )
            }
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-semibold ${
              activeTab === 'shopping' || activeTab === 'savings' || activeTab === 'tools'
                ? 'ct-accent-text'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {activeTab === 'tools' ? (
              <Wrench className="w-5 h-5" />
            ) : activeTab === 'savings' ? (
              <PiggyBank className="w-5 h-5" />
            ) : (
              <ShoppingBasket className="w-5 h-5" />
            )}
            <span className="mt-0.5">
              {activeTab === 'tools'
                ? t('টুলস', 'Tools', lang)
                : t('হাব ও টুলস', 'Hub', lang)}
            </span>
          </button>
        </div>
      </nav>

      {/* Modals & Indicators */}
      <TransactionModal
        isOpen={txModalOpen}
        editingTransaction={editingTx}
        defaultType={txDefaultType}
        initialDate={initialTxDate}
        categories={state.categories}
        wallets={state.wallets}
        quickTemplates={state.quickTemplates}
        currency={state.profile.currency}
        language={lang}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          setInitialTxDate(undefined);
        }}
        onSave={handleSaveTransaction}
      />

      <ThemeStudioModal
        isOpen={themeStudioOpen}
        themeConfig={state.profile.themeConfig}
        darkMode={state.profile.darkMode}
        language={lang}
        onChangeTheme={handleChangeTheme}
        onClose={() => setThemeStudioOpen(false)}
      />

      <SpotlightSearchModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        state={state}
        language={lang}
        hideBalance={state.profile.hideBalance}
        onNavigateTab={setActiveTab}
        onOpenPocketTool={(toolId) => {
          setActivePocketTool(toolId);
          setActiveTab('tools');
        }}
        onEditTransaction={(tx) => {
          setInitialTxDate(undefined);
          setEditingTx(tx);
          setTxModalOpen(true);
        }}
        onOpenNewTransaction={(type) => {
          setInitialTxDate(undefined);
          setEditingTx(null);
          setTxDefaultType(type);
          setTxModalOpen(true);
        }}
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

      {/* Quick Profile Switcher Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('প্রোফাইল পরিবর্তন করুন', 'Switch Profile', lang)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSwitchProfile(p.id)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{backgroundColor: p.color || PROFILE_COLORS[0]}}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {p.currency}
                          {' · '}
                          {p.id === DEFAULT_PROFILE_ID
                            ? t('মূল প্রোফাইল', 'Primary', lang)
                            : t('অতিরিক্ত প্রোফাইল', 'Workspace', lang)}
                        </p>
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setActiveTab('settings');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('ম্যানেজ করুন', 'Manage', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setQuickProfName('');
                  setQuickProfCurrency(state.profile.currency || '৳');
                  setQuickProfColor(PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[1]);
                  setQuickCreateProfileOpen(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('নতুন প্রোফাইল', 'New Profile', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Profile Modal */}
      {quickCreateProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন প্রোফাইল তৈরি', 'Create New Profile', lang)}
              </h3>
              <button
                type="button"
                onClick={() => setQuickCreateProfileOpen(false)}
                className="p-1.5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickProfName.trim()) return;
                handleCreateProfile({
                  name: quickProfName.trim(),
                  currency: quickProfCurrency,
                  color: quickProfColor,
                  copySetup: true,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('প্রোফাইলের নাম', 'Profile Name', lang)}
                </label>
                <input
                  type="text"
                  value={quickProfName}
                  onChange={(e) => setQuickProfName(e.target.value)}
                  placeholder={t('যেমন: ব্যবসা / ফ্যামিলি / অফিস', 'e.g. Business / Family', lang)}
                  autoFocus
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('মুদ্রা (Currency)', 'Currency', lang)}
                </label>
                <select
                  value={quickProfCurrency}
                  onChange={(e) => setQuickProfCurrency(e.target.value)}
                  className="w-full ct-surface-alt border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.symbol}>
                      {c.flag} {c.symbol} — {c.code} ({lang === 'bn' ? c.nameBn : c.nameEn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('রং নির্বাচন', 'Color', lang)}
                </label>
                <div className="flex items-center gap-2">
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setQuickProfColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        quickProfColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                      }`}
                      style={{backgroundColor: c}}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold"
              >
                {t('তৈরি ও চালু করুন', 'Create & Switch', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm ct-surface-card border p-5 shadow-xl space-y-4">
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
                className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', lang)}
              </button>
              <button
                type="button"
                onClick={confirmDeleteTransaction}
                className="flex-1 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
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
          className="fixed top-16 right-4 z-50 ct-accent-bg px-4 py-2.5 ct-btn-radius shadow-lg flex items-center gap-2 text-xs font-semibold print-hide"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <OfflineIndicator language={lang} />
    </div>
  );
}
