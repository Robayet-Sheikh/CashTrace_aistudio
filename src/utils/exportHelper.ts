import {Capacitor} from '@capacitor/core';
import {Directory, Encoding, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {jsPDF} from 'jspdf';
import {CashTraceState, LanguageCode, Transaction, WalletAccount} from '../types';
import {formatDisplayDate, formatMoney, formatMonthTitle} from './formatters';
import {t} from './i18n';

declare global {
  interface Window {
    AndroidPrintBridge?: {
      printPage: (jobName: string) => void;
    };
  }
}

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

export function triggerStatementPrint(monthKey: string): void {
  const jobName = `CashTrace_Statement_${monthKey}`;
  if (typeof window !== 'undefined' && window.AndroidPrintBridge?.printPage) {
    window.AndroidPrintBridge.printPage(jobName);
    return;
  }
  window.print();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const safe = String(text || '');
  if (ctx.measureText(safe).width <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

export async function exportStatementPDF(
  monthKey: string,
  transactions: Transaction[],
  wallets: WalletAccount[],
  userName: string,
  currency: string,
  language: LanguageCode
): Promise<'shared' | 'downloaded'> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font-ready errors on restricted environments
    }
  }

  // 150 DPI A4 canvas dimensions
  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_X = 72;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const MAX_Y = PAGE_H - 96;

  const fontSans = `'Hind Siliguri', 'Plus Jakarta Sans', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif`;
  const fontMono = `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace`;

  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const transfers = transactions.filter((tx) => tx.type === 'transfer');

  const totalIncome = incomes.reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const monthTitle = formatMonthTitle(monthKey, language);
  const generatedStr = new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US');

  const pages: HTMLCanvasElement[] = [];

  const createPage = (isFirstPage: boolean): {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number} => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    if (isFirstPage) {
      // Top Header
      ctx.fillStyle = '#065f46';
      ctx.font = `700 36px ${fontSans}`;
      ctx.textAlign = 'left';
      ctx.fillText('CashTrace Finance Statement', MARGIN_X, 92);

      ctx.fillStyle = '#475569';
      ctx.font = `600 22px ${fontSans}`;
      ctx.fillText(`${monthTitle} — ${t('মাসিক আর্থিক বিবরণী', 'Monthly Financial Statement', language)}`, MARGIN_X, 128);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#334155';
      ctx.font = `600 20px ${fontSans}`;
      ctx.fillText(`${t('ব্যবহারকারী', 'User', language)}: ${userName || 'User'}`, PAGE_W - MARGIN_X, 92);
      ctx.fillStyle = '#64748b';
      ctx.font = `500 18px ${fontSans}`;
      ctx.fillText(`${t('তারিখ', 'Generated', language)}: ${generatedStr}`, PAGE_W - MARGIN_X, 126);
      ctx.textAlign = 'left';

      // Emerald Divider
      ctx.fillStyle = '#059669';
      ctx.fillRect(MARGIN_X, 152, CONTENT_W, 4);

      // Summary Cards
      const cardGap = 22;
      const cardW = (CONTENT_W - cardGap * 2) / 3;
      const cardY = 182;
      const cardH = 108;

      const cards = [
        {
          label: t('মোট আয়', 'Total Income', language),
          value: formatMoney(totalIncome, currency, language),
          bg: '#f0fdf4',
          border: '#bbf7d0',
          labelColor: '#166534',
          valColor: '#15803d',
        },
        {
          label: t('মোট খরচ', 'Total Expense', language),
          value: formatMoney(totalExpense, currency, language),
          bg: '#fff1f2',
          border: '#fecdd3',
          labelColor: '#9f1239',
          valColor: '#be123c',
        },
        {
          label: t('নেট ব্যালেন্স', 'Net Balance', language),
          value: formatMoney(netBalance, currency, language),
          bg: '#f0fdfa',
          border: '#99f6e4',
          labelColor: '#115e59',
          valColor: '#0f766e',
        },
      ];

      cards.forEach((card, idx) => {
        const cx = MARGIN_X + idx * (cardW + cardGap);
        drawRoundedRect(ctx, cx, cardY, cardW, cardH, 14);
        ctx.fillStyle = card.bg;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = card.border;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = card.labelColor;
        ctx.font = `700 19px ${fontSans}`;
        ctx.fillText(card.label, cx + cardW / 2, cardY + 38);

        ctx.fillStyle = card.valColor;
        ctx.font = `700 28px ${fontSans}`;
        ctx.fillText(truncateCanvasText(ctx, card.value, cardW - 24), cx + cardW / 2, cardY + 80);
      });
      ctx.textAlign = 'left';

      pages.push(canvas);
      return {canvas, ctx, y: 334};
    }

    // Continuation page compact header
    ctx.fillStyle = '#065f46';
    ctx.font = `700 24px ${fontSans}`;
    ctx.fillText(`CashTrace Statement — ${monthTitle}`, MARGIN_X, 76);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(MARGIN_X, 94, CONTENT_W, 2);

    pages.push(canvas);
    return {canvas, ctx, y: 128};
  };

  let current = createPage(true);

  // Column x offsets within CONTENT_W (1096px)
  const colDateX = MARGIN_X + 12;
  const colTitleX = MARGIN_X + 160;
  const colCatX = MARGIN_X + 490;
  const colWalletX = MARGIN_X + 700;
  const colAmtRightX = MARGIN_X + CONTENT_W - 12;

  const drawTableHeader = (ctx: CanvasRenderingContext2D, y: number, lastColTitle: string): number => {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, 40);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(MARGIN_X, y + 39, CONTENT_W, 1.5);

    ctx.fillStyle = '#334155';
    ctx.font = `700 18px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('তারিখ', 'Date', language), colDateX, y + 26);
    ctx.fillText(t('বিবরণ', 'Title', language), colTitleX, y + 26);
    ctx.fillText(t('খাত', 'Category', language), colCatX, y + 26);
    ctx.fillText(lastColTitle, colWalletX, y + 26);
    ctx.textAlign = 'right';
    ctx.fillText(t('পরিমাণ', 'Amount', language), colAmtRightX, y + 26);
    ctx.textAlign = 'left';
    return y + 42;
  };

  const renderSection = (
    sectionTitle: string,
    rows: Transaction[],
    amountColor: string,
    emptyLabel: string,
    walletColLabel: string,
    isTransferSection = false
  ) => {
    // Ensure section title + table header + at least 1 row fit on current page
    if (current.y + 130 > MAX_Y) {
      current = createPage(false);
    }

    current.ctx.fillStyle = '#0f172a';
    current.ctx.font = `700 23px ${fontSans}`;
    current.ctx.textAlign = 'left';
    current.ctx.fillText(sectionTitle, MARGIN_X, current.y + 24);
    current.ctx.fillStyle = '#e2e8f0';
    current.ctx.fillRect(MARGIN_X, current.y + 34, CONTENT_W, 1.5);
    current.y += 44;

    current.y = drawTableHeader(current.ctx, current.y, walletColLabel);

    if (rows.length === 0) {
      current.ctx.fillStyle = '#64748b';
      current.ctx.font = `500 19px ${fontSans}`;
      current.ctx.textAlign = 'center';
      current.ctx.fillText(emptyLabel, MARGIN_X + CONTENT_W / 2, current.y + 32);
      current.ctx.textAlign = 'left';
      current.y += 66;
      return;
    }

    const rowHeight = 44;
    for (let i = 0; i < rows.length; i++) {
      const tx = rows[i];
      if (current.y + rowHeight > MAX_Y) {
        current = createPage(false);
        current.ctx.fillStyle = '#475569';
        current.ctx.font = `700 19px ${fontSans}`;
        current.ctx.fillText(`${sectionTitle} (${t('চলমান', 'cont.', language)})`, MARGIN_X, current.y + 18);
        current.y += 30;
        current.y = drawTableHeader(current.ctx, current.y, walletColLabel);
      }

      if (i % 2 === 1) {
        current.ctx.fillStyle = '#f8fafc';
        current.ctx.fillRect(MARGIN_X, current.y, CONTENT_W, rowHeight);
      }

      const textY = current.y + 28;
      current.ctx.textAlign = 'left';

      current.ctx.fillStyle = '#475569';
      current.ctx.font = `500 17px ${fontMono}`;
      current.ctx.fillText(formatDisplayDate(tx.date, language), colDateX, textY);

      current.ctx.fillStyle = '#0f172a';
      current.ctx.font = `600 18px ${fontSans}`;
      current.ctx.fillText(truncateCanvasText(current.ctx, tx.title, 310), colTitleX, textY);

      current.ctx.fillStyle = '#475569';
      current.ctx.font = `500 17px ${fontSans}`;
      current.ctx.fillText(truncateCanvasText(current.ctx, tx.category, 195), colCatX, textY);

      const walletLabel = walletMap.get(tx.walletId) || 'Cash';
      const walletText = isTransferSection && tx.toWalletId
        ? `${walletLabel} -> ${walletMap.get(tx.toWalletId) || tx.toWalletId}`
        : tx.subcategory
        ? `${walletLabel} · ${tx.subcategory}`
        : walletLabel;
      current.ctx.fillStyle = '#64748b';
      current.ctx.font = `500 17px ${fontSans}`;
      current.ctx.fillText(truncateCanvasText(current.ctx, walletText, 225), colWalletX, textY);

      current.ctx.textAlign = 'right';
      current.ctx.fillStyle = amountColor;
      current.ctx.font = `700 18px ${fontSans}`;
      current.ctx.fillText(formatMoney(tx.amount, currency, language), colAmtRightX, textY);
      current.ctx.textAlign = 'left';

      current.ctx.fillStyle = '#e2e8f0';
      current.ctx.fillRect(MARGIN_X, current.y + rowHeight - 1, CONTENT_W, 1);

      current.y += rowHeight;
    }

    current.y += 30;
  };

  renderSection(
    t('১. আয়ের বিবরণী', '1. Income Details', language),
    incomes,
    '#15803d',
    t('কোনো আয়ের তথ্য নেই', 'No income records', language),
    t('ওয়ালেট', 'Wallet', language)
  );

  renderSection(
    t('২. খরচের বিবরণী', '2. Expense Details', language),
    expenses,
    '#be123c',
    t('কোনো খরচের তথ্য নেই', 'No expense records', language),
    t('ওয়ালেট / নোট', 'Wallet / Note', language)
  );

  if (transfers.length > 0) {
    renderSection(
      t('৩. ওয়ালেট ট্রান্সফার', '3. Wallet Transfers', language),
      transfers,
      '#0369a1',
      '',
      t('ওয়ালেট', 'Wallets', language),
      true
    );
  }

  // Draw footers on all pages
  const totalPages = pages.length;
  pages.forEach((canvas, idx) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN_X, PAGE_H - 72, CONTENT_W, 1.5);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 16px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `CashTrace Personal Finance · ${t('অফলাইন জেনারেটেড স্টেটমেন্ট', 'Offline Generated Statement', language)}`,
      MARGIN_X,
      PAGE_H - 42
    );
    ctx.textAlign = 'right';
    ctx.fillText(`${t('পৃষ্ঠা', 'Page', language)} ${idx + 1} / ${totalPages}`, PAGE_W - MARGIN_X, PAGE_H - 42);
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const a4Width = doc.internal.pageSize.getWidth();
  const a4Height = doc.internal.pageSize.getHeight();

  pages.forEach((canvas, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'portrait');
    }
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    doc.addImage(imgData, 'JPEG', 0, 0, a4Width, a4Height, undefined, 'FAST');
  });

  const filename = `CashTrace_${monthKey}_Statement.pdf`;

  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output('datauristring');
    const base64Data = dataUri.split(',')[1] || '';

    // Best-effort persistent copy in Documents folder (no storage permission needed on Android 10+)
    try {
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });
    } catch {
      // Ignore if OEM scoped storage restricts Documents
    }

    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });

    await Share.share({
      title: `CashTrace PDF Statement (${monthKey})`,
      text: `CashTrace PDF Statement (${monthKey})`,
      url: cached.uri,
      dialogTitle: t('PDF ওপেন বা শেয়ার করুন', 'Open or Share PDF', language),
    });

    return 'shared';
  }

  doc.save(filename);
  return 'downloaded';
}

