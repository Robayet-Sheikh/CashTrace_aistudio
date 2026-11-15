import React from 'react';
import {Download, Printer, X} from 'lucide-react';
import {LanguageCode, Transaction, WalletAccount} from '../types';
import {formatMoney, formatMonthTitle} from '../utils/formatters';
import {t} from '../utils/i18n';

interface PrintStatementModalProps {
  isOpen: boolean;
  monthKey: string;
  transactions: Transaction[];
  wallets: WalletAccount[];
  userName: string;
  currency: string;
  language: LanguageCode;
  onClose: () => void;
  onDownloadStatement: () => void;
}

export const PrintStatementModal: React.FC<PrintStatementModalProps> = ({
  isOpen,
  monthKey,
  transactions,
  wallets,
  userName,
  currency,
  language,
  onClose,
  onDownloadStatement,
}) => {
  if (!isOpen) return null;

  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const totalIncome = incomes.reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 no-print">
          <h3 className="font-bold text-base text-emerald-800">
            {t('মাসিক আর্থিক বিবরণী (PDF / প্রিন্ট প্রিভিউ)', 'Monthly Financial Statement', language)}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadStatement}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('ফাইল সেভ / শেয়ার', 'Save / Share', language)}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('প্রিন্ট / PDF', 'Print / PDF', language)}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id="printableReportArea" className="bg-white p-2 sm:p-4 space-y-6 text-slate-900">
          <div className="flex flex-wrap justify-between items-start gap-2 border-b-2 border-emerald-600 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-emerald-800 tracking-tight">
                CashTrace Finance Statement
              </h2>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                {formatMonthTitle(monthKey, language)}
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p>
                {t('ব্যবহারকারী', 'User', language)}: <strong className="text-slate-900">{userName}</strong>
              </p>
              <p>
                {t('তারিখ', 'Generated', language)}: {new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-800">{t('মোট আয়', 'Total Income', language)}</span>
              <p className="text-base sm:text-lg font-bold tabular-nums text-emerald-700 mt-0.5">
                {formatMoney(totalIncome, currency, language)}
              </p>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[11px] font-bold text-rose-800">{t('মোট খরচ', 'Total Expense', language)}</span>
              <p className="text-base sm:text-lg font-bold tabular-nums text-rose-700 mt-0.5">
                {formatMoney(totalExpense, currency, language)}
              </p>
            </div>
            <div className="p-3 bg-teal-50 rounded-xl border border-teal-200">
              <span className="text-[11px] font-bold text-teal-800">{t('নেট ব্যালেন্স', 'Net Balance', language)}</span>
              <p className="text-base sm:text-lg font-bold tabular-nums text-teal-700 mt-0.5">
                {formatMoney(netBalance, currency, language)}
              </p>
            </div>
          </div>

          <div className="space-y-5 text-xs">
            <div>
              <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5 mb-2 text-sm">
                {t('১. আয়ের বিবরণী', '1. Income Details', language)}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                      <th className="p-2">{t('তারিখ', 'Date', language)}</th>
                      <th className="p-2">{t('বিবরণ', 'Title', language)}</th>
                      <th className="p-2">{t('খাত', 'Category', language)}</th>
                      <th className="p-2">{t('ওয়ালেট', 'Wallet', language)}</th>
                      <th className="p-2 text-right">{t('পরিমাণ', 'Amount', language)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {incomes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-slate-400">
                          {t('কোনো আয়ের তথ্য নেই', 'No income records', language)}
                        </td>
                      </tr>
                    ) : (
                      incomes.map((tx) => (
                        <tr key={tx.id}>
                          <td className="p-2 font-mono text-[11px] text-slate-600">{tx.date}</td>
                          <td className="p-2 font-semibold text-slate-800">{tx.title}</td>
                          <td className="p-2 text-slate-600">{tx.category}</td>
                          <td className="p-2 text-slate-600">{walletMap.get(tx.walletId) || '-'}</td>
                          <td className="p-2 text-right font-bold tabular-nums text-emerald-700">
                            {formatMoney(tx.amount, currency, language)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5 mb-2 text-sm">
                {t('২. খরচের বিবরণী', '2. Expense Details', language)}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                      <th className="p-2">{t('তারিখ', 'Date', language)}</th>
                      <th className="p-2">{t('বিবরণ', 'Title', language)}</th>
                      <th className="p-2">{t('খাত', 'Category', language)}</th>
                      <th className="p-2">{t('ওয়ালেট / নোট', 'Wallet / Note', language)}</th>
                      <th className="p-2 text-right">{t('পরিমাণ', 'Amount', language)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-slate-400">
                          {t('কোনো খরচের তথ্য নেই', 'No expense records', language)}
                        </td>
                      </tr>
                    ) : (
                      expenses.map((tx) => (
                        <tr key={tx.id}>
                          <td className="p-2 font-mono text-[11px] text-slate-600">{tx.date}</td>
                          <td className="p-2 font-semibold text-slate-800">{tx.title}</td>
                          <td className="p-2 text-slate-600">{tx.category}</td>
                          <td className="p-2 text-slate-500">
                            {walletMap.get(tx.walletId) || '-'}
                            {tx.subcategory ? ` · ${tx.subcategory}` : ''}
                          </td>
                          <td className="p-2 text-right font-bold tabular-nums text-rose-700">
                            {formatMoney(tx.amount, currency, language)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 flex justify-between items-center">
            <span>CashTrace Personal Finance</span>
            <span>{t('অফলাইন জেনারেটেড স্টেটমেন্ট', 'Offline Generated Statement', language)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
