import React, {useState} from 'react';
import {CheckCircle2, PiggyBank, Plus, Trash2, X} from 'lucide-react';
import {LanguageCode, SavingsGoal} from '../types';
import {formatMoney, parseLocaleNumber} from '../utils/formatters';
import {t} from '../utils/i18n';

interface SavingsTabProps {
  goals: SavingsGoal[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
  onCreateGoal: (title: string, target: number) => void;
  onDepositGoal: (goalId: string, amount: number) => void;
  onDeleteGoal: (goalId: string) => void;
}

export const SavingsTab: React.FC<SavingsTabProps> = ({
  goals,
  currency,
  language,
  hideBalance,
  onCreateGoal,
  onDepositGoal,
  onDeleteGoal,
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetText, setTargetText] = useState('');

  const [depositTarget, setDepositTarget] = useState<SavingsGoal | null>(null);
  const [depositText, setDepositText] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseLocaleNumber(targetText);
    if (!title.trim() || isNaN(target) || target <= 0) return;
    onCreateGoal(title.trim(), target);
    setTitle('');
    setTargetText('');
    setCreateOpen(false);
  };

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositTarget) return;
    const amt = parseLocaleNumber(depositText);
    if (isNaN(amt) || amt <= 0) return;
    onDepositGoal(depositTarget.id, amt);
    setDepositText('');
    setDepositTarget(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('সেভিংস গোল (Savings Goals)', 'Savings Goals', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('শখ, জরুরি ফান্ড বা ভ্রমণের জন্য টাকা জমানোর লক্ষ্য তৈরি করুন', 'Track targets for emergencies, gadgets, or travel', language)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{t('নতুন টার্গেট', 'New Goal', language)}</span>
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('এখনো কোনো সেভিংস গোল তৈরি করা হয়নি।', 'No savings goals added yet.', language)}
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('প্রথম সেভিংস গোল তৈরি করুন', 'Create First Goal', language)}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals.map((goal) => {
              const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
              const completed = goal.saved >= goal.target;

              return (
                <div
                  key={goal.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{goal.title}</h3>
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                        {pct}% {completed ? `· ${t('লক্ষ্য পূরণ হয়েছে!', 'Goal Reached!', language)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(goal.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      aria-label="Delete goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        completed ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{width: `${pct}%`}}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>
                      {t('জমা', 'Saved', language)}: <strong className="text-slate-900 dark:text-white">{formatMoney(goal.saved, currency, language, hideBalance)}</strong>
                    </span>
                    <span>
                      {t('লক্ষ্য', 'Target', language)}: <strong className="text-slate-900 dark:text-white">{formatMoney(goal.target, currency, language, hideBalance)}</strong>
                    </span>
                  </div>

                  <div className="pt-1">
                    {completed ? (
                      <div className="w-full py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {t('সম্পন্ন', 'Completed', language)}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDepositTarget(goal);
                          setDepositText('');
                        }}
                        className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
                      >
                        + {t('টাকা জমা করুন', 'Add Savings', language)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Goal Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('নতুন সেভিংস লক্ষ্য', 'New Savings Goal', language)}
              </h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('লক্ষ্যের নাম *', 'Goal Title *', language)}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('যেমন: নতুন ল্যাপটপ, ভ্রমণ ফান্ড', 'e.g. Laptop, Emergency Fund', language)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`টার্গেট পরিমাণ (${currency}) *`, `Target Amount (${currency}) *`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetText}
                  onChange={(e) => setTargetText(e.target.value)}
                  placeholder="25000"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                {t('তৈরি করুন', 'Create Goal', language)}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {depositTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {depositTarget.title}
              </h3>
              <button type="button" onClick={() => setDepositTarget(null)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t(`কত টাকা জমা করবেন? (${currency})`, `Deposit Amount (${currency})`, language)}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositText}
                  onChange={(e) => setDepositText(e.target.value)}
                  placeholder="1000"
                  autoFocus
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                {t('জমা নিশ্চিত করুন', 'Confirm Deposit', language)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
