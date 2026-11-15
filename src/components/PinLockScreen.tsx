import React, {useEffect, useState} from 'react';
import {Delete, ShieldCheck} from 'lucide-react';
import {LanguageCode} from '../types';
import {normalizePinDigits} from '../utils/formatters';
import {t} from '../utils/i18n';

interface PinLockScreenProps {
  expectedPin: string;
  language: LanguageCode;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  expectedPin,
  language,
  onUnlock,
}) => {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);

  const attemptUnlock = (candidate: string) => {
    if (candidate === expectedPin) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => {
        setEntered('');
        setError(false);
      }, 650);
    }
  };

  const handleDigit = (digit: string) => {
    if (entered.length >= 4) return;
    const next = entered + digit;
    setEntered(next);
    setError(false);
    if (next.length === 4) {
      attemptUnlock(next);
    }
  };

  const handleBackspace = () => {
    setEntered((prev) => prev.slice(0, -1));
    setError(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const normalized = normalizePinDigits(e.key);
      if (normalized.length === 1) {
        handleDigit(normalized);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && entered.length === 4) {
        attemptUnlock(entered);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-7 shadow-xl text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-200/70 dark:border-emerald-800">
          <ShieldCheck className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('CashTrace পিন লক', 'CashTrace PIN Lock', language)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('প্রবেশ করতে আপনার ৪ ডিজিটের পিন দিন', 'Enter your 4-digit PIN to unlock', language)}
          </p>
        </div>

        {/* 4-dot PIN indicator */}
        <div className="flex items-center justify-center gap-4 py-1" aria-label="PIN progress">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < entered.length;
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  error
                    ? 'bg-rose-500 scale-110'
                    : filled
                    ? 'bg-emerald-600 dark:bg-emerald-400 scale-110'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        <p className={`text-xs font-semibold h-4 ${error ? 'text-rose-600 dark:text-rose-400' : 'text-transparent'}`}>
          {t('ভুল পিন কোড! আবার চেষ্টা করুন', 'Incorrect PIN! Try again', language)}
        </p>

        {/* Touch-friendly NumPad */}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleDigit(k)}
              className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-lg font-mono font-bold text-slate-900 dark:text-white transition-all"
            >
              {k}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-lg font-mono font-bold text-slate-900 dark:text-white transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Backspace"
            className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 text-slate-600 dark:text-slate-300 hover:text-rose-600 flex items-center justify-center transition-all"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
