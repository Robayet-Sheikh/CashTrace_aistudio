import React, {useState} from 'react';
import {PieChart} from 'lucide-react';
import {CategoryItem, LanguageCode, MonthStore, Transaction} from '../types';
import {formatMoney, formatShortMonth, getTrailingMonthKeys} from '../utils/formatters';
import {t} from '../utils/i18n';

const FALLBACK_COLORS = [
  '#059669',
  '#e11d48',
  '#7c3aed',
  '#0284c7',
  '#d97706',
  '#db2777',
  '#4f46e5',
  '#0d9488',
  '#64748b',
];

interface ExpenseDonutChartProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
}

export const ExpenseDonutChart: React.FC<ExpenseDonutChartProps> = ({
  transactions,
  categories,
  currency,
  language,
  hideBalance,
}) => {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const totalsMap = new Map<string, number>();
  expenses.forEach((tx) => {
    totalsMap.set(tx.category, (totalsMap.get(tx.category) || 0) + tx.amount);
  });

  const catColorMap = new Map(categories.map((c) => [c.name, c.color]));
  const slices = Array.from(totalsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount], idx) => ({
      name,
      amount,
      color: catColorMap.get(name) || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    }));

  const totalExpense = slices.reduce((sum, s) => sum + s.amount, 0);

  if (slices.length === 0 || totalExpense <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
          <PieChart className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {t('এই মাসে এখনো কোনো খরচের তথ্য নেই', 'No expense entries recorded for this month', language)}
        </p>
      </div>
    );
  }

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let cumulativeFraction = 0;

  const activeSlice = slices.find((s) => s.name === hoveredCat) || null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 168 168" className="w-full h-full -rotate-90">
          {slices.map((slice) => {
            const fraction = slice.amount / totalExpense;
            const dashLength = Math.max(0, fraction * circumference - 2);
            const dashOffset = -cumulativeFraction * circumference;
            cumulativeFraction += fraction;
            const isHovered = hoveredCat === slice.name;

            return (
              <circle
                key={slice.name}
                cx="84"
                cy="84"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? 24 : 20}
                strokeDasharray={`${dashLength} ${circumference}`}
                strokeDashoffset={dashOffset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredCat(slice.name)}
                onMouseLeave={() => setHoveredCat(null)}
                onClick={() => setHoveredCat(hoveredCat === slice.name ? null : slice.name)}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[96px]">
            {activeSlice ? activeSlice.name : t('মোট খরচ', 'Total Expense', language)}
          </span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
            {formatMoney(activeSlice ? activeSlice.amount : totalExpense, currency, language, hideBalance)}
          </span>
        </div>
      </div>

      <div className="w-full space-y-2 max-h-52 overflow-y-auto pr-1">
        {slices.map((slice) => {
          const pct = Math.round((slice.amount / totalExpense) * 100);
          const isHovered = hoveredCat === slice.name;
          return (
            <button
              key={slice.name}
              type="button"
              onMouseEnter={() => setHoveredCat(slice.name)}
              onMouseLeave={() => setHoveredCat(null)}
              onClick={() => setHoveredCat(hoveredCat === slice.name ? null : slice.name)}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                isHovered
                  ? 'bg-slate-100 dark:bg-slate-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{backgroundColor: slice.color}}
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                  {slice.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 tabular-nums">
                <span className="text-slate-400 dark:text-slate-500 font-mono">{pct}%</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatMoney(slice.amount, currency, language, hideBalance)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface SixMonthComparisonChartProps {
  selectedMonthKey: string;
  months: Record<string, MonthStore>;
  currency: string;
  language: LanguageCode;
  hideBalance: boolean;
}

export const SixMonthComparisonChart: React.FC<SixMonthComparisonChartProps> = ({
  selectedMonthKey,
  months,
  currency,
  language,
  hideBalance,
}) => {
  const keys = getTrailingMonthKeys(selectedMonthKey, 6);
  const series = keys.map((key) => {
    const txs = months[key]?.transactions || [];
    const income = txs.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const expense = txs.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    return {
      key,
      label: formatShortMonth(key, language),
      income,
      expense,
    };
  });

  const maxVal = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const [activeKey, setActiveKey] = useState<string>(selectedMonthKey);
  const activeItem = series.find((s) => s.key === activeKey) || series[series.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            {t('আয়', 'Income', language)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            {t('খরচ', 'Expense', language)}
          </span>
        </div>
        <div className="text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{activeItem.label}:</span>{' '}
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            +{formatMoney(activeItem.income, currency, language, hideBalance)}
          </span>{' '}
          ·{' '}
          <span className="text-rose-600 dark:text-rose-400 font-semibold">
            -{formatMoney(activeItem.expense, currency, language, hideBalance)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:gap-3 items-end h-44 pt-4 border-b border-slate-200 dark:border-slate-800">
        {series.map((item) => {
          const incHeight = Math.round((item.income / maxVal) * 100);
          const expHeight = Math.round((item.expense / maxVal) * 100);
          const isSelected = item.key === activeItem.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveKey(item.key)}
              onMouseEnter={() => setActiveKey(item.key)}
              className={`h-full flex flex-col justify-end items-center gap-1.5 rounded-t-lg px-1 pt-2 transition-colors ${
                isSelected ? 'bg-slate-100/80 dark:bg-slate-800/70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="w-full flex items-end justify-center gap-1 h-32">
                <div
                  className="w-3 sm:w-4 rounded-t bg-emerald-500 transition-all duration-300"
                  style={{height: `${item.income > 0 ? Math.max(6, incHeight) : 2}%`}}
                  title={`${item.label} Income: ${item.income}`}
                />
                <div
                  className="w-3 sm:w-4 rounded-t bg-rose-500 transition-all duration-300"
                  style={{height: `${item.expense > 0 ? Math.max(6, expHeight) : 2}%`}}
                  title={`${item.label} Expense: ${item.expense}`}
                />
              </div>
              <span
                className={`text-[11px] pb-1.5 font-medium truncate max-w-full ${
                  isSelected ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
