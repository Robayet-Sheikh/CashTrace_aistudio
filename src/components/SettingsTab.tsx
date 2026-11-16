import React, {useState} from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Download,
  Globe,
  Layers,
  Lock,
  LockOpen,
  LogOut,
  Megaphone,
  Moon,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {useCurrency} from '../contexts/CurrencyContext';
import {getCurrencyInfo, SUPPORTED_CURRENCIES} from '../services/currencyService';
import {
  CategoryItem,
  LanguageCode,
  ProfileMeta,
  QuickTemplate,
  SmartMemoryItem,
  UserProfile,
  WalletAccount,
} from '../types';
import {normalizePinDigits, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';
import {DEFAULT_PROFILE_ID, PROFILE_COLORS} from '../utils/storage';

export interface CloudUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface SettingsTabProps {
  profile: UserProfile;
  profiles: ProfileMeta[];
  activeProfileId: string;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  smartMemory: SmartMemoryItem[];
  quickTemplates: QuickTemplate[];
  cloudUser: CloudUserInfo | null;
  cloudSyncing: boolean;
  cloudError: string | null;
  authBusy: boolean;
  isNativePlatform: boolean;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onForceCloudSync: () => void;
  onSwitchProfile: (profileId: string) => void;
  onCreateProfile: (meta: {name: string; currency: string; color: string; copySetup: boolean}) => void;
  onUpdateProfileMeta: (profileId: string, patch: Partial<ProfileMeta>) => void;
  onDeleteProfile: (profileId: string) => void;
  onUpdateProfile: (patch: Partial<UserProfile>) => void;
  onAddSmartMemory: (item: Omit<SmartMemoryItem, 'id'>) => void;
  onDeleteSmartMemory: (id: string) => void;
  onAddCategory: (item: Omit<CategoryItem, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onAddQuickTemplate: (item: Omit<QuickTemplate, 'id'>) => void;
  onDeleteQuickTemplate: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenThemeStudio?: () => void;
  onRebaseCurrency?: (nextCurrency: string, rate: number) => void;
  onOpenCurrencyConverter?: () => void;
  onOpenUserGuide?: (view: 'guide' | 'marketing') => void;
  onShowToast: (msg: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  profile,
  profiles,
  activeProfileId,
  wallets,
  categories,
  smartMemory,
  quickTemplates,
  cloudUser,
  cloudSyncing,
  cloudError,
  authBusy,
  isNativePlatform,
  onSignInGoogle,
  onSignOutGoogle,
  onForceCloudSync,
  onSwitchProfile,
  onCreateProfile,
  onUpdateProfileMeta,
  onDeleteProfile,
  onUpdateProfile,
  onAddSmartMemory,
  onDeleteSmartMemory,
  onAddCategory,
  onDeleteCategory,
  onAddQuickTemplate,
  onDeleteQuickTemplate,
  onExportBackup,
  onImportBackup,
  onOpenThemeStudio,
  onRebaseCurrency,
  onOpenCurrencyConverter,
  onOpenUserGuide,
  onShowToast,
}) => {
  const lang = profile.language;
  const {
    baseCurrency,
    displayCurrency,
    baseCode,
    displayCode,
    rate,
    isLiveRate,
    ratesUpdatedAt,
    refreshingRates,
    refreshRates,
    convertToBase,
    formatConverted,
  } = useCurrency();
  const [confirmRebaseOpen, setConfirmRebaseOpen] = useState(false);

  // Profile Workspace Modals
  const [profCreateOpen, setProfCreateOpen] = useState(false);
  const [profName, setProfName] = useState('');
  const [profCurrency, setProfCurrency] = useState(profile.currency || '৳');
  const [profColor, setProfColor] = useState(PROFILE_COLORS[1]);
  const [profCopySetup, setProfCopySetup] = useState(true);

  const [editingProfileMeta, setEditingProfileMeta] = useState<ProfileMeta | null>(null);
  const [editProfName, setEditProfName] = useState('');
  const [editProfCurrency, setEditProfCurrency] = useState('৳');
  const [editProfColor, setEditProfColor] = useState(PROFILE_COLORS[0]);

  const [deletingProfileMeta, setDeletingProfileMeta] = useState<ProfileMeta | null>(null);

  // Smart Memory Modal
  const [smModalOpen, setSmModalOpen] = useState(false);
  const [smTitle, setSmTitle] = useState('');
  const [smAmountText, setSmAmountText] = useState('');
  const [smCategory, setSmCategory] = useState(
    categories.find((c) => c.type === 'expense')?.name || ''
  );
  const [smWallet, setSmWallet] = useState(wallets[0]?.id || 'cash');

  // Custom Category Modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [catColor, setCatColor] = useState('#059669');

  // Quick Template Modal
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplAmountText, setTplAmountText] = useState('');
  const [tplCategory, setTplCategory] = useState(
    categories.find((c) => c.type === 'expense')?.name || ''
  );

  const handleTogglePinLock = () => {
    if (!profile.pin || profile.pin.length !== 4) {
      onShowToast(
        t('লক চালু করার আগে ৪-ডিজিটের পিন কোড লিখুন', 'Enter a 4-digit PIN before enabling lock', lang)
      );
      return;
    }
    const next = !profile.pinLock;
    onUpdateProfile({pinLock: next});
    onShowToast(
      next ? t('পিন সিকিউরিটি লক চালু হয়েছে', 'PIN Lock enabled', lang) : t('পিন সিকিউরিটি বন্ধ করা হয়েছে', 'PIN Lock disabled', lang)
    );
  };

  const handleSaveSmartMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseLocaleNumber(smAmountText);
    if (!smTitle.trim() || isNaN(amt) || amt <= 0) return;
    onAddSmartMemory({
      title: smTitle.trim(),
      amount: convertToBase(amt),
      category: smCategory || categories[0]?.name || 'Other',
      walletId: smWallet,
    });
    setSmTitle('');
    setSmAmountText('');
    setSmModalOpen(false);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    onAddCategory({name: catName.trim(), type: catType, color: catColor});
    setCatName('');
    setCatModalOpen(false);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseLocaleNumber(tplAmountText);
    if (!tplTitle.trim() || isNaN(amt) || amt <= 0) return;
    onAddQuickTemplate({
      title: tplTitle.trim(),
      amount: convertToBase(amt),
      category: tplCategory || categories[0]?.name || 'Other',
      type: 'expense',
      walletId: wallets[0]?.id || 'cash',
    });
    setTplTitle('');
    setTplAmountText('');
    setTplModalOpen(false);
  };

  const handleOpenCreateProfile = () => {
    setProfName('');
    setProfCurrency(profile.currency || '৳');
    setProfColor(PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[1]);
    setProfCopySetup(true);
    setProfCreateOpen(true);
  };

  const handleSubmitCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;
    onCreateProfile({
      name: profName.trim(),
      currency: profCurrency,
      color: profColor,
      copySetup: profCopySetup,
    });
    setProfCreateOpen(false);
  };

  const handleOpenEditProfileMeta = (meta: ProfileMeta) => {
    setEditingProfileMeta(meta);
    setEditProfName(meta.name);
    setEditProfCurrency(meta.currency || '৳');
    setEditProfColor(meta.color || PROFILE_COLORS[0]);
  };

  const handleSubmitEditProfileMeta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileMeta || !editProfName.trim()) return;
    onUpdateProfileMeta(editingProfileMeta.id, {
      name: editProfName.trim(),
      currency: editProfCurrency,
      color: editProfColor,
    });
    setEditingProfileMeta(null);
  };

  const baseInfo = getCurrencyInfo(baseCurrency);
  const displayInfo = getCurrencyInfo(displayCurrency);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Google Account & Cloud Sync */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            {cloudUser?.photoURL ? (
              <img
                src={cloudUser.photoURL}
                alt={cloudUser.displayName || 'User'}
                className="w-11 h-11 rounded-2xl object-cover border border-emerald-200 dark:border-emerald-800 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  cloudUser
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {cloudUser ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                <span>{t('Google অ্যাকাউন্ট ও ক্লাউড সিঙ্ক', 'Google Account & Cloud Sync', lang)}</span>
                {cloudUser && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {cloudSyncing
                      ? t('সিঙ্ক হচ্ছে...', 'Syncing...', lang)
                      : t('সিঙ্কড ✓', 'Synced ✓', lang)}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {cloudUser
                  ? `${cloudUser.displayName || profile.name} (${cloudUser.email || ''})`
                  : t(
                      'ফ্রি ক্লাউড ব্যাকআপ — লগইন করলে যেকোনো ফোন বা ব্রাউজার থেকে সব ডেটা ফিরে পাবেন',
                      'Free cloud backup — restore all your data on any device',
                      lang
                    )}
              </p>
            </div>
          </div>
        </div>

        {cloudUser ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t(
                'আপনার সব হিসাব, ওয়ালেট, বাকি, বাজার লিস্ট ও সেভিংস গোল স্বয়ংক্রিয়ভাবে ক্লাউডে ও অফলাইনে সেভ হচ্ছে।',
                'All transactions, wallets, debts, lists & goals sync automatically and work offline.',
                lang
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={cloudSyncing}
                onClick={onForceCloudSync}
                className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                <span>{t('এখনই সিঙ্ক করুন', 'Sync Now', lang)}</span>
              </button>
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignOutGoogle}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 hover:text-rose-600 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('লগআউট', 'Sign Out', lang)}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md">
                {t(
                  'বর্তমানে অ্যাপটি অফলাইন গেস্ট মোডে চলছে। Google দিয়ে লগইন করলে আপনার বর্তমান হিসাবও সুরক্ষিত ক্লাউডে উঠে যাবে।',
                  'Currently running in offline guest mode. Sign in with Google to back up and sync across devices.',
                  lang
                )}
              </p>
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignInGoogle}
                className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-bold inline-flex items-center gap-2 shadow-sm disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                  />
                </svg>
                <span>
                  {authBusy
                    ? t('লগইন হচ্ছে...', 'Signing in...', lang)
                    : t('Google দিয়ে লগইন ও সিঙ্ক করুন', 'Sign in with Google', lang)}
                </span>
              </button>
            </div>
            {isNativePlatform && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-3 py-2">
                {t(
                  'টিপস: Android APK অ্যাপের ভেতরে Google পপআপ ব্রাউজার সীমাবদ্ধতার কারণে কাজ না করলে ওয়েব ভার্সন (PWA) থেকে লগইন করুন অথবা নিচের JSON ব্যাকআপ ব্যবহার করুন।',
                  'Note: If Google popup is blocked inside Android WebView APK, use the Web PWA for cloud login or JSON backup below.',
                  lang
                )}
              </p>
            )}
          </div>
        )}

        {cloudError && (
          <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 rounded-xl px-3.5 py-2.5">
            {cloudError}
          </div>
        )}
      </div>

      {/* Multiple Profiles Manager */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl ct-accent-soft flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('একাধিক প্রোফাইল (Workspaces)', 'Multiple Profiles', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'ব্যক্তিগত, ব্যবসা বা পারিবারিক হিসাব আলাদা আলাদা প্রোফাইলে রাখুন',
                  'Keep personal, business or family finances isolated in separate profiles',
                  lang
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateProfile}
            className="px-3 py-2 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('নতুন প্রোফাইল', 'New Profile', lang)}</span>
          </button>
        </div>

        <div className="space-y-2">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isDefault = p.id === DEFAULT_PROFILE_ID;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  isActive
                    ? 'ct-accent-border ct-accent-soft'
                    : 'border-slate-200 dark:border-slate-800 ct-surface-alt'
                }`}
              >
                <button
                  type="button"
                  onClick={() => !isActive && onSwitchProfile(p.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{backgroundColor: p.color || PROFILE_COLORS[0]}}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.currency}
                      {' · '}
                      {isDefault
                        ? t('মূল প্রোফাইল', 'Primary Workspace', lang)
                        : t('অতিরিক্ত প্রোফাইল', 'Custom Workspace', lang)}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {isActive ? (
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 px-2">
                      <Check className="w-3.5 h-3.5" />
                      {t('সক্রিয়', 'Active', lang)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSwitchProfile(p.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
                    >
                      {t('সুইচ', 'Switch', lang)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenEditProfileMeta(p)}
                    className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg"
                    title={t('সম্পাদনা', 'Edit', lang)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => setDeletingProfileMeta(p)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                      title={t('ডিলিট', 'Delete', lang)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Theme & Design Studio Card */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl ct-accent-soft flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('থিম ও ডিজাইন স্টুডিও', 'Theme & Design Studio', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'সার্ফেস (Light / Warm / Midnight / AMOLED), এক্সেন্ট রং, কার্ড স্টাইল ও ফন্ট সাইজ কাস্টমাইজ করুন',
                  'Customize surface mode, accent palette, hero card style, corner radius & font scale',
                  lang
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateProfile({darkMode: !profile.darkMode})}
              className="px-3 py-2 ct-btn-radius bg-amber-100 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5"
            >
              {profile.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              <span>{profile.darkMode ? t('লাইট', 'Light', lang) : t('ডার্ক', 'Dark', lang)}</span>
            </button>
            {onOpenThemeStudio && (
              <button
                type="button"
                onClick={onOpenThemeStudio}
                className="px-3.5 py-2 ct-btn-radius bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>{t('কাস্টমাইজ থিম', 'Customize Theme', lang)}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Multi-Currency & FX Rate Manager */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl ct-accent-soft flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('লাইভ কারেন্সি ও রিয়েল-টাইম কনভার্সন', 'Live Multi-Currency & FX Engine', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'ডিসপ্লে কারেন্সি বদলালে পুরো অ্যাপের সব হিসাব তাৎক্ষণিক লাইভ রেটে রূপান্তর হয়ে দেখাবে',
                  'Changing display currency converts all figures across the app in real time using live FX rates',
                  lang
                )}
              </p>
            </div>
          </div>
          {onOpenCurrencyConverter && (
            <button
              type="button"
              onClick={onOpenCurrencyConverter}
              className="px-3.5 py-2 ct-btn-radius bg-sky-600 hover:bg-sky-700 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{t('কনভার্টার টুল', 'FX Converter', lang)}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('ডিসপ্লে কারেন্সি (সারা অ্যাপে দেখাবে)', 'Display Currency (App-Wide)', lang)}
            </label>
            <select
              value={displayCurrency}
              onChange={(e) => onUpdateProfile({currency: e.target.value})}
              className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.symbol}>
                  {c.flag} {c.symbol} — {c.code} ({lang === 'bn' ? c.nameBn : c.nameEn})
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {t('বেস কারেন্সি', 'Base Ledger', lang)}: <strong>{baseInfo.flag} {baseCode}</strong> ·{' '}
                <span className={isLiveRate ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {isLiveRate ? t('লাইভ রেট', 'Live Rate', lang) : t('অফলাইন রেট', 'Offline Rate', lang)}
                </span>
              </p>
              <p className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                1 {baseCode} = {rate.toFixed(4)} {displayCode}
              </p>
              {ratesUpdatedAt > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(ratesUpdatedAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={refreshRates}
              disabled={refreshingRates}
              className="p-2 rounded-lg ct-surface-card border hover:ct-accent-border text-slate-600 dark:text-slate-300 shrink-0"
              title={t('রেট রিফ্রেশ করুন', 'Refresh Rates', lang)}
            >
              <RefreshCw className={`w-4 h-4 ${refreshingRates ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {baseCode !== displayCode && onRebaseCurrency && (
          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-amber-900 dark:text-amber-200 max-w-md">
              {t(
                `আপনার সংরক্ষিত ডেটা ${baseCode} (${baseInfo.symbol})-এ আছে এবং এখন ${displayCode} (${displayInfo.symbol}) হিসেবে কনভার্ট হয়ে দেখাচ্ছে। চাইলে সব ডেটা স্থায়ীভাবে ${displayCode}-তে কনভার্ট করতে পারেন।`,
                `Stored ledger data is in ${baseCode} and displayed in ${displayCode}. You can permanently rebase stored records into ${displayCode}.`,
                lang
              )}
            </p>
            <button
              type="button"
              onClick={() => setConfirmRebaseOpen(true)}
              className="px-3.5 py-2 ct-btn-radius bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0"
            >
              {t(`স্থায়ীভাবে ${displayCode}-তে রিব্যাস করুন`, `Rebase Data to ${displayCode}`, lang)}
            </button>
          </div>
        )}
      </div>

      {/* Profile & Preferences */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl ct-accent-bg text-white font-bold text-lg flex items-center justify-center shrink-0">
              {(profile.name || 'ইউ').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{profile.name || 'ইউজার'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('ব্যক্তিগত প্রোফাইল, ভাষা এবং পিন সিকিউরিটি', 'Profile name, language & PIN lock', lang)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('ব্যবহারকারীর নাম', 'Display Name', lang)}
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => onUpdateProfile({name: e.target.value})}
              className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('অ্যাপের ভাষা (Language)', 'App Language', lang)}
            </label>
            <select
              value={profile.language}
              onChange={(e) => onUpdateProfile({language: e.target.value as LanguageCode})}
              className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              <option value="bn">বাংলা (Bengali)</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('৪-ডিজিট পিন কোড ও লক', '4-Digit PIN & Lock', lang)}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profile.pin}
                onChange={(e) => {
                  const normalized = normalizePinDigits(e.target.value);
                  onUpdateProfile({
                    pin: normalized,
                    pinLock: normalized.length === 4 ? profile.pinLock : false,
                  });
                }}
                placeholder="1234"
                className="w-32 ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 dark:text-white outline-none"
              />
              <button
                type="button"
                onClick={handleTogglePinLock}
                className={`flex-1 py-2.5 px-3 ct-btn-radius text-xs font-bold inline-flex items-center justify-center gap-1.5 border transition-colors ${
                  profile.pinLock
                    ? 'ct-accent-soft ct-accent-border'
                    : 'ct-surface-alt border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {profile.pinLock ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                <span>{profile.pinLock ? t('লক চালু', 'Locked', lang) : t('লক বন্ধ', 'Unlocked', lang)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Memory Manager */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('স্মার্ট মেমোরি (মাসিক ফিক্সড খরচ)', 'Smart Memory (Fixed Monthly Costs)', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('প্রতি মাসের ফিক্সড খরচ এখানে সেভ রাখুন, ড্যাশবোর্ড থেকে ১ ক্লিকে যোগ হবে', 'Save recurring bills for 1-tap monthly apply', lang)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSmModalOpen(true)}
            className="px-3 py-2 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('আইটেম যোগ', 'Add Item', lang)}
          </button>
        </div>

        {smartMemory.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
            {t('কোনো ফিক্সড খরচ যোগ করা নেই', 'No fixed items configured', lang)}
          </p>
        ) : (
          <div className="space-y-2">
            {smartMemory.map((sm) => (
              <div
                key={sm.id}
                className="flex items-center justify-between p-3 rounded-xl ct-surface-alt border border-slate-200/70 dark:border-slate-700/70"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{sm.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{sm.category}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatConverted(sm.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteSmartMemory(sm.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                    aria-label="Delete fixed item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Categories & Quick Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="ct-surface-card border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Tag className="w-4 h-4 ct-accent-text" />
              {t('ক্যাটাগরি ম্যানেজার', 'Categories', lang)}
            </h3>
            <button
              type="button"
              onClick={() => setCatModalOpen(true)}
              className="text-xs font-bold ct-accent-text hover:underline"
            >
              + {t('নতুন খাত', 'New', lang)}
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl ct-surface-alt text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: cat.color}} />
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                  <span className="text-slate-400">({cat.type === 'income' ? t('আয়', 'Inc', lang) : t('খরচ', 'Exp', lang)})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteCategory(cat.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  aria-label="Delete category"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="ct-surface-card border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              {t('কুইক টেমপ্লেট', 'Quick Templates', lang)}
            </h3>
            <button
              type="button"
              onClick={() => setTplModalOpen(true)}
              className="text-xs font-bold ct-accent-text hover:underline"
            >
              + {t('নতুন', 'New', lang)}
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {quickTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl ct-surface-alt text-xs"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                  {tpl.title} · {formatConverted(tpl.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteQuickTemplate(tpl.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  aria-label="Delete template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Offline Backup & Restore */}
      <div className="ct-surface-card border p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t('ডেটা ব্যাকআপ ও রিস্টোর (JSON)', 'Data Backup & Restore (JSON)', lang)}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(
            'অ্যাপের সমস্ত হিসাব সম্পূর্ণ অফলাইনে আপনার ফোনে থাকে। ফোন পরিবর্তন করলে বা সুরক্ষার জন্য ব্যাকআপ ফাইল সেভ করে রাখুন।',
            'All data stays offline on your device. Export a JSON backup anytime to move or safeguard your data.',
            lang
          )}
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={onExportBackup}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{t('ব্যাকআপ ডাউনলোড / শেয়ার', 'Export Backup JSON', lang)}</span>
          </button>

          <label className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>{t('ব্যাকআপ রিস্টোর করুন', 'Import Backup JSON', lang)}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportBackup(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* User Guide PDF & Marketing Assets */}
      {onOpenUserGuide && (
        <div className="ct-surface-card border p-5 sm:p-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('ব্যবহার নির্দেশিকা (PDF) ও মার্কেটিং কিট', 'User Guide PDF & Marketing Assets', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t(
                  'অ্যাপের প্রতিটি ফিচার সহজে বোঝার জন্য ৪-পৃষ্ঠার গাইড PDF এবং প্রোমোশনাল পোস্টার ও সোশ্যাল ক্যাপশন ডাউনলোড করুন।',
                  'Open the interactive walkthrough, download the 4-page User Manual PDF, or export branded marketing posters.',
                  lang
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenUserGuide('guide')}
              className="px-4 py-2.5 ct-btn-radius bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>{t('ব্যবহার নির্দেশিকা ও গাইড PDF', 'User Guide & PDF Manual', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenUserGuide('marketing')}
              className="px-4 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              <Megaphone className="w-4 h-4" />
              <span>{t('মার্কেটিং পোস্টার ও কিট', 'Marketing Posters & Kit', lang)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {confirmRebaseOpen && onRebaseCurrency && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('সব ডেটা নতুন কারেন্সিতে রূপান্তর করবেন?', 'Rebase Stored Data?', lang)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t(
                `১ ${baseCode} = ${rate.toFixed(4)} ${displayCode} রেট অনুযায়ী আপনার সব লেনদেন, ওয়ালেট, বাকি, বাজেট ও লক্ষ্য স্থায়ীভাবে ${displayCode}-তে কনভার্ট ও সেভ হবে।`,
                `All stored transactions, wallets, debts, budgets & goals will be permanently converted from ${baseCode} to ${displayCode} at 1 ${baseCode} = ${rate.toFixed(4)} ${displayCode}.`,
                lang
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRebaseOpen(false)}
                className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRebaseCurrency(displayCurrency, rate);
                  setConfirmRebaseOpen(false);
                }}
                className="flex-1 py-2.5 ct-btn-radius bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                {t('কনভার্ট করুন', 'Confirm Rebase', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {smModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন ফিক্সড খরচ', 'Add Fixed Expense', lang)}
              </h3>
              <button type="button" onClick={() => setSmModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSmartMemory} className="space-y-3">
              <input
                type="text"
                value={smTitle}
                onChange={(e) => setSmTitle(e.target.value)}
                placeholder={t('খরচের নাম (যেমন: বাসা ভাড়া)', 'Title (e.g. Rent)', lang)}
                required
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <input
                type="text"
                inputMode="decimal"
                value={smAmountText}
                onChange={(e) => setSmAmountText(e.target.value)}
                placeholder={t(`টাকার পরিমাণ (${displayCurrency})`, `Amount (${displayCurrency})`, lang)}
                required
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
              <select
                value={smCategory}
                onChange={(e) => setSmCategory(e.target.value)}
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                value={smWallet}
                onChange={(e) => setSmWallet(e.target.value)}
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('সেভ করুন', 'Save Fixed Item', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন ক্যাটাগরি', 'New Category', lang)}
              </h3>
              <button type="button" onClick={() => setCatModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder={t('খাতের নাম (যেমন: 🐾 পোষা প্রাণী)', 'Category name', lang)}
                required
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={catType}
                  onChange={(e) => setCatType(e.target.value as 'expense' | 'income')}
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  <option value="expense">{t('খরচ', 'Expense', lang)}</option>
                  <option value="income">{t('আয়', 'Income', lang)}</option>
                </select>
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('ক্যাটাগরি যোগ করুন', 'Add Category', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {tplModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন কুইক টেমপ্লেট', 'New Quick Template', lang)}
              </h3>
              <button type="button" onClick={() => setTplModalOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <input
                type="text"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                placeholder={t('নাম (যেমন: কফি)', 'Title (e.g. Coffee)', lang)}
                required
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <input
                type="text"
                inputMode="decimal"
                value={tplAmountText}
                onChange={(e) => setTplAmountText(e.target.value)}
                placeholder={t(`পরিমাণ (${displayCurrency})`, `Amount (${displayCurrency})`, lang)}
                required
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
              <select
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value)}
                className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              >
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('সেভ করুন', 'Save Template', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create New Profile Modal */}
      {profCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন প্রোফাইল তৈরি', 'Create New Profile', lang)}
              </h3>
              <button type="button" onClick={() => setProfCreateOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitCreateProfile} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('প্রোফাইলের নাম', 'Profile Name', lang)}
                </label>
                <input
                  type="text"
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  placeholder={t('যেমন: আমার ব্যবসা / ফ্যামিলি', 'e.g. Business / Family', lang)}
                  autoFocus
                  required
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('মুদ্রা (Currency)', 'Currency', lang)}
                </label>
                <select
                  value={profCurrency}
                  onChange={(e) => setProfCurrency(e.target.value)}
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.symbol}>
                      {c.flag} {c.symbol} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('প্রোফাইলের রং', 'Profile Color', lang)}
                </label>
                <div className="flex items-center gap-2">
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProfColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        profColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                      }`}
                      style={{backgroundColor: c}}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
                <input
                  type="checkbox"
                  checked={profCopySetup}
                  onChange={(e) => setProfCopySetup(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                <span>
                  {t(
                    'বর্তমান ওয়ালেট কাঠামো ও ক্যাটাগরি কপি করুন (ব্যালেন্স ০ থাকবে)',
                    'Copy current wallet structure & categories (with 0 balance)',
                    lang
                  )}
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('প্রোফাইল তৈরি করুন', 'Create Profile', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Meta Modal */}
      {editingProfileMeta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('প্রোফাইল তথ্য এডিট', 'Edit Profile Info', lang)}
              </h3>
              <button type="button" onClick={() => setEditingProfileMeta(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitEditProfileMeta} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('প্রোফাইলের নাম', 'Profile Name', lang)}
                </label>
                <input
                  type="text"
                  value={editProfName}
                  onChange={(e) => setEditProfName(e.target.value)}
                  autoFocus
                  required
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('মুদ্রা (Currency)', 'Currency', lang)}
                </label>
                <select
                  value={editProfCurrency}
                  onChange={(e) => setEditProfCurrency(e.target.value)}
                  className="w-full ct-surface-alt border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.symbol}>
                      {c.flag} {c.symbol} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('প্রোফাইলের রং', 'Profile Color', lang)}
                </label>
                <div className="flex items-center gap-2">
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditProfColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        editProfColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                      }`}
                      style={{backgroundColor: c}}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 ct-btn-radius ct-accent-bg hover:opacity-95 text-white text-xs font-bold"
              >
                {t('আপডেট করুন', 'Save Changes', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Profile Confirmation Modal */}
      {deletingProfileMeta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-sm ct-surface-card border rounded-t-3xl sm:rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('প্রোফাইল ডিলিট করবেন?', 'Delete Profile?', lang)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              "{deletingProfileMeta.name}" —{' '}
              {t(
                'এই প্রোফাইলের সমস্ত লেনদেন, ওয়ালেট, বাকি ও বাজার লিস্ট স্থায়ীভাবে মুছে যাবে।',
                'All transactions, wallets, debts & lists inside this profile will be permanently deleted.',
                lang
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingProfileMeta(null)}
                className="flex-1 py-2.5 ct-btn-radius ct-surface-alt text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                {t('বাতিল', 'Cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProfile(deletingProfileMeta.id);
                  setDeletingProfileMeta(null);
                }}
                className="flex-1 py-2.5 ct-btn-radius bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {t('ডিলিট করুন', 'Delete', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
