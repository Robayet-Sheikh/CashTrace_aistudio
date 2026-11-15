import React, {useState} from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  Lock,
  LockOpen,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  CategoryItem,
  LanguageCode,
  QuickTemplate,
  SmartMemoryItem,
  UserProfile,
  WalletAccount,
} from '../types';
import {formatMoney, normalizePinDigits, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

export interface CloudUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface SettingsTabProps {
  profile: UserProfile;
  wallets: WalletAccount[];
  categories: CategoryItem[];
  smartMemory: SmartMemoryItem[];
  quickTemplates: QuickTemplate[];
  cloudUser: CloudUserInfo | null;
  cloudSyncing: boolean;
  authBusy: boolean;
  isNativePlatform: boolean;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onForceCloudSync: () => void;
  onUpdateProfile: (patch: Partial<UserProfile>) => void;
  onAddSmartMemory: (item: Omit<SmartMemoryItem, 'id'>) => void;
  onDeleteSmartMemory: (id: string) => void;
  onAddCategory: (item: Omit<CategoryItem, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onAddQuickTemplate: (item: Omit<QuickTemplate, 'id'>) => void;
  onDeleteQuickTemplate: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onShowToast: (msg: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  profile,
  wallets,
  categories,
  smartMemory,
  quickTemplates,
  cloudUser,
  cloudSyncing,
  authBusy,
  isNativePlatform,
  onSignInGoogle,
  onSignOutGoogle,
  onForceCloudSync,
  onUpdateProfile,
  onAddSmartMemory,
  onDeleteSmartMemory,
  onAddCategory,
  onDeleteCategory,
  onAddQuickTemplate,
  onDeleteQuickTemplate,
  onExportBackup,
  onImportBackup,
  onShowToast,
}) => {
  const lang = profile.language;

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
      amount: amt,
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
      amount: amt,
      category: tplCategory || categories[0]?.name || 'Other',
      type: 'expense',
      walletId: wallets[0]?.id || 'cash',
    });
    setTplTitle('');
    setTplAmountText('');
    setTplModalOpen(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Google Account & Cloud Sync */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
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
      </div>

      {/* Profile & Preferences */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
              {(profile.name || 'ইউ').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{profile.name || 'ইউজার'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('ব্যক্তিগত প্রোফাইল, ভাষা, থিম এবং পিন লক', 'Profile, language, theme & security', lang)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onUpdateProfile({darkMode: !profile.darkMode})}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            {profile.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            <span>{profile.darkMode ? t('লাইট মোড', 'Light', lang) : t('ডার্ক মোড', 'Dark', lang)}</span>
          </button>
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
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('অ্যাপের ভাষা (Language)', 'App Language', lang)}
            </label>
            <select
              value={profile.language}
              onChange={(e) => onUpdateProfile({language: e.target.value as LanguageCode})}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              <option value="bn">বাংলা (Bengali)</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('মুদ্রা (Currency)', 'Currency Symbol', lang)}
            </label>
            <select
              value={profile.currency}
              onChange={(e) => onUpdateProfile({currency: e.target.value})}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              <option value="৳">৳ (BDT টাকা)</option>
              <option value="$">$ (USD)</option>
              <option value="€">€ (EUR)</option>
              <option value="₹">₹ (INR)</option>
              <option value="£">£ (GBP)</option>
            </select>
          </div>

          <div>
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
                className="w-28 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 dark:text-white outline-none"
              />
              <button
                type="button"
                onClick={handleTogglePinLock}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border transition-colors ${
                  profile.pinLock
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
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
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1"
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
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{sm.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{sm.category}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatMoney(sm.amount, profile.currency, lang)}
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-emerald-600" />
              {t('ক্যাটাগরি ম্যানেজার', 'Categories', lang)}
            </h3>
            <button
              type="button"
              onClick={() => setCatModalOpen(true)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              + {t('নতুন খাত', 'New', lang)}
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
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

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              {t('কুইক টেমপ্লেট', 'Quick Templates', lang)}
            </h3>
            <button
              type="button"
              onClick={() => setTplModalOpen(true)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              + {t('নতুন', 'New', lang)}
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {quickTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                  {tpl.title} · {formatMoney(tpl.amount, profile.currency, lang)}
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
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

      {/* Modals */}
      {smModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <input
                type="text"
                inputMode="decimal"
                value={smAmountText}
                onChange={(e) => setSmAmountText(e.target.value)}
                placeholder={t('টাকার পরিমাণ', 'Amount', lang)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
              <select
                value={smCategory}
                onChange={(e) => setSmCategory(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('সেভ করুন', 'Save Fixed Item', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={catType}
                  onChange={(e) => setCatType(e.target.value as 'expense' | 'income')}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('ক্যাটাগরি যোগ করুন', 'Add Category', lang)}
              </button>
            </form>
          </div>
        </div>
      )}

      {tplModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
              />
              <input
                type="text"
                inputMode="decimal"
                value={tplAmountText}
                onChange={(e) => setTplAmountText(e.target.value)}
                placeholder={t('পরিমাণ', 'Amount', lang)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
              />
              <select
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {t('সেভ করুন', 'Save Template', lang)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
