import {DebtRecord, RecurringBill, VaultItem} from '../types';
import {getLocalDateStr, getLocalMonthKey} from './formatters';

export type DueAlertSeverity = 'overdue' | 'today' | 'soon';
export type DueAlertKind = 'bill' | 'debt' | 'vault';

export interface DueAlertItem {
  id: string;
  kind: DueAlertKind;
  severity: DueAlertSeverity;
  daysDelta: number; // < 0 overdue, 0 today, > 0 upcoming
  title: string;
  subtitleBn: string;
  subtitleEn: string;
  amount?: number;
  debtType?: 'lent' | 'borrowed';
  dueDateStr: string;
  billRef?: RecurringBill;
  debtRef?: DebtRecord;
  vaultRef?: VaultItem;
}

function parseYMDToLocalMidnight(ymd: string): number | null {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).getTime();
}

export function computeDueAlerts(params: {
  recurringBills?: RecurringBill[];
  debts?: DebtRecord[];
  vaultItems?: VaultItem[];
  now?: Date;
}): DueAlertItem[] {
  const now = params.now || new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const currentMonthKey = getLocalMonthKey(now);
  const todayStr = getLocalDateStr(now);
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const alerts: DueAlertItem[] = [];

  // 1. Unpaid Recurring Bills for current month
  (params.recurringBills || []).forEach((bill) => {
    if (bill.paidMonths.includes(currentMonthKey)) return;
    const clampedDay = Math.min(daysInThisMonth, Math.max(1, bill.dueDay));
    const billMidnight = new Date(now.getFullYear(), now.getMonth(), clampedDay).getTime();
    const diffDays = Math.round((billMidnight - todayMidnight) / 86400000);
    if (diffDays > 7) return; // Show overdue, due today, or within next 7 days

    const severity: DueAlertSeverity =
      diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : 'soon';
    const dueDateStr = `${currentMonthKey}-${String(clampedDay).padStart(2, '0')}`;

    alerts.push({
      id: `bill_${bill.id}`,
      kind: 'bill',
      severity,
      daysDelta: diffDays,
      title: bill.title,
      subtitleBn:
        diffDays < 0
          ? `${Math.abs(diffDays)} দিন বিলম্বিত · মাসিক বিল`
          : diffDays === 0
          ? 'আজ পরিশোধের শেষ দিন · মাসিক বিল'
          : `${diffDays} দিন বাকি · প্রতি মাসের ${clampedDay} তারিখ`,
      subtitleEn:
        diffDays < 0
          ? `${Math.abs(diffDays)}d overdue · Monthly bill`
          : diffDays === 0
          ? 'Due today · Monthly bill'
          : `Due in ${diffDays}d · Day ${clampedDay}`,
      amount: bill.amount,
      dueDateStr,
      billRef: bill,
    });
  });

  // 2. Unsettled Debts / Receivables with a dueDate
  (params.debts || []).forEach((debt) => {
    if (debt.settled || !debt.dueDate) return;
    const remaining = Math.max(0, debt.amount - debt.paidAmount);
    if (remaining <= 0) return;

    const targetMs = parseYMDToLocalMidnight(debt.dueDate);
    if (targetMs === null) return;
    const diffDays = Math.round((targetMs - todayMidnight) / 86400000);
    if (diffDays > 7) return;

    const severity: DueAlertSeverity =
      diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : 'soon';
    const roleBn = debt.type === 'lent' ? 'পাওনা' : 'দেনা';
    const roleEn = debt.type === 'lent' ? 'Receivable' : 'Payable';

    alerts.push({
      id: `debt_${debt.id}`,
      kind: 'debt',
      severity,
      daysDelta: diffDays,
      title: debt.personName,
      subtitleBn:
        diffDays < 0
          ? `${Math.abs(diffDays)} দিন পার হয়েছে · ${roleBn}`
          : diffDays === 0
          ? `আজ তারিখ · ${roleBn}`
          : `${diffDays} দিন বাকি · ${roleBn}`,
      subtitleEn:
        diffDays < 0
          ? `${Math.abs(diffDays)}d overdue · ${roleEn}`
          : diffDays === 0
          ? `Due today · ${roleEn}`
          : `Due in ${diffDays}d · ${roleEn}`,
      amount: remaining,
      debtType: debt.type,
      dueDateStr: debt.dueDate,
      debtRef: debt,
    });
  });

  // 3. Vault Warranty / Card / ID Expirations (within 14 days or expired within 30 days)
  (params.vaultItems || []).forEach((item) => {
    if (!item.expiryDate) return;
    const targetMs = parseYMDToLocalMidnight(item.expiryDate);
    if (targetMs === null) return;
    const diffDays = Math.round((targetMs - todayMidnight) / 86400000);
    if (diffDays > 14 || diffDays < -30) return;

    const severity: DueAlertSeverity =
      diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : 'soon';

    alerts.push({
      id: `vault_${item.id}`,
      kind: 'vault',
      severity,
      daysDelta: diffDays,
      title: item.label,
      subtitleBn:
        diffDays < 0
          ? `মেয়াদ শেষ (${item.expiryDate})`
          : diffDays === 0
          ? 'আজ মেয়াদ শেষ হচ্ছে'
          : `${diffDays} দিনে মেয়াদ শেষ (${item.expiryDate})`,
      subtitleEn:
        diffDays < 0
          ? `Expired (${item.expiryDate})`
          : diffDays === 0
          ? 'Expires today'
          : `Expires in ${diffDays}d (${item.expiryDate})`,
      dueDateStr: item.expiryDate || todayStr,
      vaultRef: item,
    });
  });

  const severityOrder: Record<DueAlertSeverity, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
  };

  return alerts.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.daysDelta - b.daysDelta
  );
}
