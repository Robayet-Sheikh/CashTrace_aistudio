import React, {useState} from 'react';
import {Download, Smartphone, WifiOff, X} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {LanguageCode} from '../types';
import {t} from '../utils/i18n';

export const PWAInstallButton: React.FC<{language: LanguageCode; compact?: boolean}> = ({
  language,
  compact = false,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="w-4 h-4" />
        <span>{compact ? t('ইন্সটল', 'Install', language) : t('অ্যাপ ইন্সটল করুন', 'Install App', language)}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <Smartphone className="w-4 h-4 text-emerald-600" />
          <span>{t('হোম স্ক্রিনে যোগ করুন', 'Install iOS', language)}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('iPhone / iPad-এ ইন্সটল করুন', 'Install on iPhone / iPad', language)}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal pl-4">
                <li>{t('Safari ব্রাউজারের নিচে Share বাটনে ট্যাপ করুন।', 'Tap the Share button in Safari toolbar.', language)}</li>
                <li>{t('নিচে স্ক্রল করে "Add to Home Screen" সিলেক্ট করুন।', 'Scroll down and tap "Add to Home Screen".', language)}</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                {t('বুঝেছি', 'Got it', language)}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC<{language: LanguageCode}> = ({language}) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 text-white px-3 py-2 text-xs font-semibold shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{t('অফলাইন মোড — সব ডেটা ডিভাইসে সুরক্ষিত আছে', 'Offline Mode — All data saved locally', language)}</span>
    </div>
  );
};
