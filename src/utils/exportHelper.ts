import {Capacitor} from '@capacitor/core';
import {Directory, Encoding, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {CashTraceState, Transaction, WalletAccount} from '../types';
import {formatMonthTitle} from './formatters';

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Universal file saver & sharer:
 * - On Capacitor Android/iOS native WebView: writes to Cache/Documents and opens native Android Share Sheet (fixes WebView blob download failures!).
 * - On Web / PWA: triggers standard Blob download.
 */
async function deliverFile(
  filename: string,
  content: string,
  mimeType: string,
  shareTitle: string
): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const saved = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: shareTitle,
      text: shareTitle,
      url: saved.uri,
      dialogTitle: shareTitle,
    });
    return 'shared';
  }

  const blob = new Blob(['\ufeff' + content], {type: `${mimeType};charset=utf-8;`});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function exportBackupFile(state: CashTraceState): Promise<'shared' | 'downloaded'> {
  const payload = {
    ...state,
    exportedAt: new Date().toISOString(),
  };
  const filename = `cashtrace_backup_${new Date().toISOString().slice(0, 10)}.json`;
  return deliverFile(filename, JSON.stringify(payload, null, 2), 'application/json', 'CashTrace Backup');
}

export async function exportTransactionsExcel(
  monthKey: string,
  transactions: Transaction[],
  wallets: WalletAccount[],
  userName: string,
  currency: string
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');

  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const netBalance = totalInc - totalExp;

  let rowsHtml = '';
  incomes.forEach((item) => {
    rowsHtml += `
      <tr style="background-color:#f0fdf4;">
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#15803d;">INCOME</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.date)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;">${escapeHtml(item.title)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.category)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(walletMap.get(item.walletId) || 'Cash')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.subcategory || '-')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#15803d;text-align:right;">${item.amount}</td>
      </tr>
    `;
  });

  expenses.forEach((item) => {
    rowsHtml += `
      <tr style="background-color:#fff1f2;">
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#be123c;">EXPENSE</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.date)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;">${escapeHtml(item.title)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.category)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(walletMap.get(item.walletId) || 'Cash')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(item.subcategory || '-')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#be123c;text-align:right;">${item.amount}</td>
      </tr>
    `;
  });

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" /></head>
      <body style="font-family:Arial,sans-serif;">
        <h2 style="color:#047857;">CashTrace Financial Statement (${escapeHtml(monthKey)})</h2>
        <p style="color:#475569;font-size:12px;">User: ${escapeHtml(userName)} | Currency: ${escapeHtml(currency)}</p>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr style="background-color:#047857;color:#ffffff;font-weight:bold;">
              <th style="padding:10px;border:1px solid #047857;">Type</th>
              <th style="padding:10px;border:1px solid #047857;">Date</th>
              <th style="padding:10px;border:1px solid #047857;">Title</th>
              <th style="padding:10px;border:1px solid #047857;">Category</th>
              <th style="padding:10px;border:1px solid #047857;">Wallet</th>
              <th style="padding:10px;border:1px solid #047857;">Note</th>
              <th style="padding:10px;border:1px solid #047857;text-align:right;">Amount (${escapeHtml(currency)})</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr><td colspan="7"></td></tr>
            <tr style="background-color:#dcfce7;font-weight:bold;">
              <td colspan="6" style="padding:8px;border:1px solid #cbd5e1;color:#15803d;">TOTAL INCOME</td>
              <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#15803d;">${totalInc}</td>
            </tr>
            <tr style="background-color:#ffe4e6;font-weight:bold;">
              <td colspan="6" style="padding:8px;border:1px solid #cbd5e1;color:#be123c;">TOTAL EXPENSE</td>
              <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#be123c;">${totalExp}</td>
            </tr>
            <tr style="background-color:#ccfbf1;font-weight:bold;">
              <td colspan="6" style="padding:10px;border:1px solid #cbd5e1;color:#047857;">NET BALANCE</td>
              <td style="padding:10px;border:1px solid #cbd5e1;text-align:right;color:#047857;">${netBalance}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  return deliverFile(
    `CashTrace_${monthKey}_Statement.xls`,
    html,
    'application/vnd.ms-excel',
    `CashTrace Excel Statement (${monthKey})`
  );
}

export async function exportTransactionsCSV(
  monthKey: string,
  transactions: Transaction[],
  wallets: WalletAccount[]
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const header = ['Type', 'Date', 'Title', 'Category', 'Wallet', 'Note', 'Amount'].join(',');
  const rows = transactions.map((t) =>
    [
      escapeCsvCell(t.type.toUpperCase()),
      escapeCsvCell(t.date),
      escapeCsvCell(t.title),
      escapeCsvCell(t.category),
      escapeCsvCell(walletMap.get(t.walletId) || t.walletId),
      escapeCsvCell(t.subcategory || ''),
      escapeCsvCell(t.amount),
    ].join(',')
  );
  return deliverFile(
    `CashTrace_${monthKey}.csv`,
    [header, ...rows].join('\n'),
    'text/csv',
    `CashTrace CSV (${monthKey})`
  );
}

export async function exportStandaloneStatementHTML(
  monthKey: string,
  transactions: Transaction[],
  wallets: WalletAccount[],
  userName: string,
  currency: string
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');
  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const net = totalInc - totalExp;
  const monthTitle = formatMonthTitle(monthKey, 'bn');

  const rowBuilder = (items: Transaction[], color: string) =>
    items.length === 0
      ? `<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;">কোনো তথ্য নেই</td></tr>`
      : items
          .map(
            (t) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escapeHtml(t.date)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(t.title)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(t.category)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#475569;">${escapeHtml(walletMap.get(t.walletId) || '-')}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${color};">${escapeHtml(currency)} ${t.amount.toLocaleString('bn-BD')}</td>
          </tr>
        `
          )
          .join('');

  const html = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>CashTrace Statement - ${escapeHtml(monthKey)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; max-width: 820px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #059669; padding-bottom: 14px; margin-bottom: 20px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .card { padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin:0;color:#065f46;font-size:22px;">CashTrace Finance Statement</h1>
      <p style="margin:4px 0 0;color:#475569;font-size:13px;">${escapeHtml(monthTitle)} — আর্থিক বিবরণী</p>
    </div>
    <div style="text-align:right;font-size:12px;color:#475569;">
      <div>ব্যবহারকারী: <strong>${escapeHtml(userName)}</strong></div>
      <div>তৈরির তারিখ: ${escapeHtml(new Date().toLocaleDateString('bn-BD'))}</div>
    </div>
  </div>
  <div class="cards">
    <div class="card" style="background:#f0fdf4;"><div style="font-size:11px;color:#166534;">মোট আয়</div><strong style="font-size:18px;color:#15803d;">${escapeHtml(currency)} ${totalInc.toLocaleString('bn-BD')}</strong></div>
    <div class="card" style="background:#fff1f2;"><div style="font-size:11px;color:#9f1239;">মোট খরচ</div><strong style="font-size:18px;color:#be123c;">${escapeHtml(currency)} ${totalExp.toLocaleString('bn-BD')}</strong></div>
    <div class="card" style="background:#f0fdfa;"><div style="font-size:11px;color:#115e59;">নেট ব্যালেন্স</div><strong style="font-size:18px;color:#0f766e;">${escapeHtml(currency)} ${net.toLocaleString('bn-BD')}</strong></div>
  </div>
  <h3>১. আয়ের বিবরণী</h3>
  <table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th>খাত</th><th>ওয়ালেট</th><th style="text-align:right;">পরিমাণ</th></tr></thead><tbody>${rowBuilder(incomes, '#15803d')}</tbody></table>
  <h3>২. খরচের বিবরণী</h3>
  <table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th>খাত</th><th>ওয়ালেট</th><th style="text-align:right;">পরিমাণ</th></tr></thead><tbody>${rowBuilder(expenses, '#be123c')}</tbody></table>
  <p class="no-print" style="text-align:center;margin-top:24px;"><button onclick="window.print()" style="padding:10px 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">প্রিন্ট / PDF সেভ করুন</button></p>
</body>
</html>`;

  return deliverFile(
    `CashTrace_${monthKey}_Report.html`,
    html,
    'text/html',
    `CashTrace Statement (${monthKey})`
  );
}
