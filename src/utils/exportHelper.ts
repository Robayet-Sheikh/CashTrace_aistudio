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
  currency: string,
  fxRate: number = 1
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');
  const conv = (n: number) => (fxRate === 1 ? n : Math.round(n * fxRate * 100) / 100);

  const totalInc = conv(incomes.reduce((s, t) => s + t.amount, 0));
  const totalExp = conv(expenses.reduce((s, t) => s + t.amount, 0));
  const netBalance = Math.round((totalInc - totalExp) * 100) / 100;

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
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#15803d;text-align:right;">${conv(item.amount)}</td>
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
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;color:#be123c;text-align:right;">${conv(item.amount)}</td>
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
  wallets: WalletAccount[],
  fxRate: number = 1
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const conv = (n: number) => (fxRate === 1 ? n : Math.round(n * fxRate * 100) / 100);
  const header = ['Type', 'Date', 'Title', 'Category', 'Wallet', 'Note', 'Amount'].join(',');
  const rows = transactions.map((t) =>
    [
      escapeCsvCell(t.type.toUpperCase()),
      escapeCsvCell(t.date),
      escapeCsvCell(t.title),
      escapeCsvCell(t.category),
      escapeCsvCell(walletMap.get(t.walletId) || t.walletId),
      escapeCsvCell(t.subcategory || ''),
      escapeCsvCell(conv(t.amount)),
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
  currency: string,
  fxRate: number = 1
): Promise<'shared' | 'downloaded'> {
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const conv = (n: number) => (fxRate === 1 ? n : Math.round(n * fxRate * 100) / 100);
  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');
  const totalInc = conv(incomes.reduce((s, t) => s + t.amount, 0));
  const totalExp = conv(expenses.reduce((s, t) => s + t.amount, 0));
  const net = Math.round((totalInc - totalExp) * 100) / 100;
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
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${color};">${escapeHtml(currency)} ${conv(t.amount).toLocaleString('bn-BD')}</td>
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

interface PdfTextRun {
  text: string;
  x: number;
  y: number;
  fontPx: number;
  align: 'left' | 'center' | 'right';
}

interface PdfPageSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  runs: PdfTextRun[];
}

let cachedPdfFontBase64: string | null = null;

async function ensurePdfUnicodeFont(doc: jsPDF): Promise<string> {
  try {
    if (!cachedPdfFontBase64) {
      const resp = await fetch('/fonts/HindSiliguri-Regular.ttf');
      if (!resp.ok) throw new Error('Font fetch failed');
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      cachedPdfFontBase64 = btoa(binary);
    }
    doc.addFileToVFS('HindSiliguri-Regular.ttf', cachedPdfFontBase64);
    doc.addFont('HindSiliguri-Regular.ttf', 'HindSiliguriPDF', 'normal');
    return 'HindSiliguriPDF';
  } catch {
    return 'helvetica';
  }
}

function createHiDpiPdfSurface(
  logicalW: number,
  logicalH: number,
  scale = 2
): PdfPageSurface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalW * scale);
  canvas.height = Math.round(logicalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const runs: PdfTextRun[] = [];
  const origFillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    origFillText(text, x, y, maxWidth);
    const str = String(text ?? '');
    if (str.trim().length > 0) {
      const match = String(ctx.font || '').match(/(\d+(?:\.\d+)?)px/);
      const fontPx = match ? parseFloat(match[1]) : 18;
      const rawAlign = ctx.textAlign;
      const align: 'left' | 'center' | 'right' =
        rawAlign === 'center' ? 'center' : rawAlign === 'right' || rawAlign === 'end' ? 'right' : 'left';
      runs.push({text: str, x, y, fontPx, align});
    }
  };

  return {canvas, ctx, runs};
}

function sanitizePdfSelectableText(text: string, hasUnicodeFont: boolean): string {
  // Strip pictographic emojis so jsPDF TTF CMap never breaks while preserving Bengali + Latin + symbols
  const noEmoji = text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();
  if (hasUnicodeFont) return noEmoji;
  return noEmoji.replace(/[^\x20-\xFF]/g, '').trim();
}

async function renderSurfacesToPdf(
  surfaces: PdfPageSurface[],
  logicalW: number
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const fontName = await ensurePdfUnicodeFont(doc);
  const hasUnicodeFont = fontName === 'HindSiliguriPDF';
  const a4W = doc.internal.pageSize.getWidth();
  const a4H = doc.internal.pageSize.getHeight();
  const pxToMm = a4W / logicalW;

  surfaces.forEach((surface, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'portrait');
    }
    // PNG lossless rendering at 2x HiDPI (2480x3508 = 300 DPI) prevents blurry compression on crisp text
    const imgData = surface.canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, a4W, a4H, undefined, 'SLOW');

    // Overlay exact invisible selectable Unicode text layer
    doc.setFont(fontName, 'normal');
    surface.runs.forEach((run) => {
      const clean = sanitizePdfSelectableText(run.text, hasUnicodeFont);
      if (!clean) return;
      const ptSize = Math.max(5.5, run.fontPx * pxToMm * 2.83465);
      doc.setFontSize(ptSize);
      try {
        doc.text(clean, run.x * pxToMm, run.y * pxToMm, {
          renderingMode: 'invisible',
          align: run.align,
        });
      } catch {
        // Ignore isolated unmapped glyph issues safely
      }
    });
  });

  return doc;
}

export async function exportStatementPDF(
  monthKey: string,
  transactions: Transaction[],
  wallets: WalletAccount[],
  userName: string,
  currency: string,
  language: LanguageCode,
  fxRate: number = 1
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

  const conv = (n: number) => (fxRate === 1 ? n : Math.round(n * fxRate * 100) / 100);
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const incomes = transactions.filter((tx) => tx.type === 'income');
  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const transfers = transactions.filter((tx) => tx.type === 'transfer');

  const totalIncome = conv(incomes.reduce((sum, tx) => sum + tx.amount, 0));
  const totalExpense = conv(expenses.reduce((sum, tx) => sum + tx.amount, 0));
  const netBalance = Math.round((totalIncome - totalExpense) * 100) / 100;
  const monthTitle = formatMonthTitle(monthKey, language);
  const generatedStr = new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US');

  const pages: PdfPageSurface[] = [];

  const createPage = (isFirstPage: boolean): {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number} => {
    const surface = createHiDpiPdfSurface(PAGE_W, PAGE_H, 2);
    const {canvas, ctx} = surface;

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

      pages.push(surface);
      return {canvas, ctx, y: 334};
    }

    // Continuation page compact header
    ctx.fillStyle = '#065f46';
    ctx.font = `700 24px ${fontSans}`;
    ctx.fillText(`CashTrace Statement — ${monthTitle}`, MARGIN_X, 76);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(MARGIN_X, 94, CONTENT_W, 2);

    pages.push(surface);
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
      current.ctx.fillText(formatMoney(conv(tx.amount), currency, language), colAmtRightX, textY);
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
  pages.forEach(({ctx}, idx) => {
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

  const doc = await renderSurfacesToPdf(pages, PAGE_W);

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

export interface MonthlySummaryCardParams {
  periodLabel: string;
  userName: string;
  currency: string;
  language: LanguageCode;
  accentColor: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  budgetCap: number;
  topCategories: Array<{name: string; amount: number; color: string}>;
  fxRate?: number;
}

export async function exportMonthlySummaryPNGCard(
  params: MonthlySummaryCardParams
): Promise<'shared' | 'downloaded'> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore
    }
  }

  const fxRate = params.fxRate ?? 1;
  const conv = (n: number) => (fxRate === 1 ? n : Math.round(n * fxRate * 100) / 100);
  const W = 1080;
  const H = 1350;
  const PAD = 64;
  const CW = W - PAD * 2;
  const fontSans = `'Hind Siliguri', 'Plus Jakarta Sans', system-ui, sans-serif`;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.55, '#111827');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle accent glow at top right
  const accentGlow = ctx.createRadialGradient(W - 140, 120, 20, W - 140, 120, 420);
  accentGlow.addColorStop(0, `${params.accentColor}44`);
  accentGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = accentGlow;
  ctx.fillRect(0, 0, W, 600);

  // Brand header
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 42px ${fontSans}`;
  ctx.textAlign = 'left';
  ctx.fillText('CashTrace', PAD, 110);

  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 24px ${fontSans}`;
  ctx.fillText(
    `${params.userName || 'User'} · ${params.periodLabel}`,
    PAD,
    154
  );

  // Accent bar
  ctx.fillStyle = params.accentColor || '#059669';
  drawRoundedRect(ctx, PAD, 182, 120, 6, 3);
  ctx.fill();

  // Net Savings Hero Card
  const heroY = 225;
  const heroH = 240;
  drawRoundedRect(ctx, PAD, heroY, CW, heroH, 28);
  const heroGrad = ctx.createLinearGradient(PAD, heroY, PAD + CW, heroY + heroH);
  heroGrad.addColorStop(0, params.accentColor || '#059669');
  heroGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 26px ${fontSans}`;
  ctx.fillText(t('নিট সারসংক্ষেপ (Net Balance)', 'Net Period Summary', params.language), PAD + 40, heroY + 68);

  const netVal = conv(params.netBalance);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 64px ${fontSans}`;
  ctx.fillText(
    truncateCanvasText(ctx, formatMoney(netVal, params.currency, params.language), CW - 80),
    PAD + 40,
    heroY + 156
  );

  if (params.budgetCap > 0) {
    const usedPct = Math.round((params.totalExpense / params.budgetCap) * 100);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `500 22px ${fontSans}`;
    ctx.fillText(
      `${t('বাজেট ব্যবহার', 'Budget Used', params.language)}: ${usedPct}% (${formatMoney(conv(params.budgetCap), params.currency, params.language)})`,
      PAD + 40,
      heroY + 206
    );
  }

  // Two Metric Boxes (Income / Expense)
  const boxY = 500;
  const boxGap = 28;
  const boxW = (CW - boxGap) / 2;
  const boxH = 165;

  // Income box
  drawRoundedRect(ctx, PAD, boxY, boxW, boxH, 24);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
  ctx.stroke();
  ctx.fillStyle = '#6ee7b7';
  ctx.font = `600 24px ${fontSans}`;
  ctx.fillText(t('মোট আয়', 'Total Income', params.language), PAD + 34, boxY + 58);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 42px ${fontSans}`;
  ctx.fillText(
    truncateCanvasText(ctx, formatMoney(conv(params.totalIncome), params.currency, params.language), boxW - 68),
    PAD + 34,
    boxY + 122
  );

  // Expense box
  const expX = PAD + boxW + boxGap;
  drawRoundedRect(ctx, expX, boxY, boxW, boxH, 24);
  ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.font = `600 24px ${fontSans}`;
  ctx.fillText(t('মোট খরচ', 'Total Expense', params.language), expX + 34, boxY + 58);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 42px ${fontSans}`;
  ctx.fillText(
    truncateCanvasText(ctx, formatMoney(conv(params.totalExpense), params.currency, params.language), boxW - 68),
    expX + 34,
    boxY + 122
  );

  // Top Spending Categories Card
  const catY = 706;
  const catH = 500;
  drawRoundedRect(ctx, PAD, catY, CW, catH, 28);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 28px ${fontSans}`;
  ctx.fillText(t('শীর্ষ খরচের খাতসমূহ', 'Top Spending Categories', params.language), PAD + 36, catY + 58);

  const cats = params.topCategories.slice(0, 5);
  const totalExpConv = Math.max(1, conv(params.totalExpense));
  if (cats.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 24px ${fontSans}`;
    ctx.fillText(t('এই সময়ে কোনো খরচের হিসাব নেই', 'No expenses recorded in this period', params.language), PAD + 36, catY + 140);
  } else {
    cats.forEach((c, idx) => {
      const rowY = catY + 106 + idx * 74;
      const amtConv = conv(c.amount);
      const pct = Math.min(100, Math.round((amtConv / totalExpConv) * 100));

      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 24px ${fontSans}`;
      ctx.textAlign = 'left';
      ctx.fillText(truncateCanvasText(ctx, c.name, 460), PAD + 36, rowY + 24);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 24px ${fontSans}`;
      ctx.fillText(`${formatMoney(amtConv, params.currency, params.language)} (${pct}%)`, PAD + CW - 36, rowY + 24);
      ctx.textAlign = 'left';

      // Progress track
      drawRoundedRect(ctx, PAD + 36, rowY + 40, CW - 72, 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();

      drawRoundedRect(ctx, PAD + 36, rowY + 40, Math.max(14, ((CW - 72) * pct) / 100), 12, 6);
      ctx.fillStyle = c.color || params.accentColor || '#059669';
      ctx.fill();
    });
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = `500 20px ${fontSans}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `CashTrace Smart Personal Finance · ${new Date().toLocaleDateString(params.language === 'bn' ? 'bn-BD' : 'en-US')}`,
    W / 2,
    H - 64
  );

  const dataUrl = canvas.toDataURL('image/png');
  const filename = `CashTrace_Summary_${Date.now()}.png`;

  if (Capacitor.isNativePlatform()) {
    const base64Data = dataUrl.split(',')[1] || '';
    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
    await Share.share({
      title: `CashTrace Summary (${params.periodLabel})`,
      text: `CashTrace Summary (${params.periodLabel})`,
      url: cached.uri,
      dialogTitle: t('সামারি কার্ড শেয়ার করুন', 'Share Summary Card', params.language),
    });
    return 'shared';
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'downloaded';
}

export interface BusinessInvoiceLine {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface BusinessInvoiceParams {
  invoiceNo: string;
  date: string;
  dueDate?: string;
  status: 'PAID' | 'DUE' | 'QUOTE';
  businessName: string;
  businessContact?: string;
  clientName: string;
  clientContact?: string;
  items: BusinessInvoiceLine[];
  discountPct: number;
  vatPct: number;
  paymentNote?: string;
  currency: string;
  language: LanguageCode;
  accentColor?: string;
}

export async function exportBusinessInvoicePDF(
  params: BusinessInvoiceParams
): Promise<'shared' | 'downloaded'> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore
    }
  }

  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_X = 76;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const accent = params.accentColor || '#059669';
  const fontSans = `'Hind Siliguri', 'Plus Jakarta Sans', system-ui, sans-serif`;
  const fontMono = `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace`;

  const surface = createHiDpiPdfSurface(PAGE_W, PAGE_H, 2);
  const {ctx} = surface;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Top Accent Stripe
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, PAGE_W, 18);

  // Business Header (Left)
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 38px ${fontSans}`;
  ctx.textAlign = 'left';
  ctx.fillText(truncateCanvasText(ctx, params.businessName || 'CashTrace Business', 620), MARGIN_X, 108);

  if (params.businessContact) {
    ctx.fillStyle = '#475569';
    ctx.font = `500 20px ${fontSans}`;
    ctx.fillText(truncateCanvasText(ctx, params.businessContact, 620), MARGIN_X, 144);
  }

  // Invoice Title + Status Badge (Right)
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.font = `700 34px ${fontSans}`;
  ctx.fillText(
    params.status === 'QUOTE'
      ? t('কোটেশন (QUOTATION)', 'QUOTATION', params.language)
      : t('ইনভয়েস (INVOICE)', 'INVOICE', params.language),
    PAGE_W - MARGIN_X,
    106
  );

  ctx.fillStyle = '#334155';
  ctx.font = `600 20px ${fontMono}`;
  ctx.fillText(`#${params.invoiceNo || 'INV-001'}`, PAGE_W - MARGIN_X, 140);

  const badgeColor =
    params.status === 'PAID' ? '#059669' : params.status === 'DUE' ? '#e11d48' : '#0284c7';
  const badgeBg =
    params.status === 'PAID' ? '#ecfdf5' : params.status === 'DUE' ? '#fff1f2' : '#f0f9ff';
  const badgeW = 136;
  const badgeH = 38;
  drawRoundedRect(ctx, PAGE_W - MARGIN_X - badgeW, 158, badgeW, badgeH, 10);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = badgeColor;
  ctx.stroke();
  ctx.fillStyle = badgeColor;
  ctx.font = `700 18px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.fillText(params.status, PAGE_W - MARGIN_X - badgeW / 2, 183);

  ctx.textAlign = 'left';

  // Bill To & Metadata Cards
  const infoY = 236;
  const boxW = (CONTENT_W - 28) / 2;
  drawRoundedRect(ctx, MARGIN_X, infoY, boxW, 140, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `700 17px ${fontSans}`;
  ctx.fillText(t('গ্রাহক / বিল প্রাপক (BILL TO)', 'BILL TO', params.language), MARGIN_X + 24, infoY + 36);
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 24px ${fontSans}`;
  ctx.fillText(truncateCanvasText(ctx, params.clientName || 'Valued Client', boxW - 48), MARGIN_X + 24, infoY + 76);
  if (params.clientContact) {
    ctx.fillStyle = '#475569';
    ctx.font = `500 19px ${fontSans}`;
    ctx.fillText(truncateCanvasText(ctx, params.clientContact, boxW - 48), MARGIN_X + 24, infoY + 112);
  }

  const rightBoxX = MARGIN_X + boxW + 28;
  drawRoundedRect(ctx, rightBoxX, infoY, boxW, 140, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `700 17px ${fontSans}`;
  ctx.fillText(t('তারিখ ও মেয়াদ', 'INVOICE DETAILS', params.language), rightBoxX + 24, infoY + 36);
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 20px ${fontSans}`;
  ctx.fillText(
    `${t('ইস্যু তারিখ', 'Issue Date', params.language)}: ${formatDisplayDate(params.date, params.language)}`,
    rightBoxX + 24,
    infoY + 76
  );
  if (params.dueDate) {
    ctx.fillStyle = '#475569';
    ctx.fillText(
      `${t('পরিশোধের শেষ তারিখ', 'Due Date', params.language)}: ${formatDisplayDate(params.dueDate, params.language)}`,
      rightBoxX + 24,
      infoY + 112
    );
  }

  // Table Header
  let y = 420;
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 48, 10);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 19px ${fontSans}`;
  ctx.textAlign = 'left';
  ctx.fillText('#', MARGIN_X + 20, y + 31);
  ctx.fillText(t('বিবরণ / সার্ভিস', 'Item / Description', params.language), MARGIN_X + 68, y + 31);
  ctx.textAlign = 'right';
  ctx.fillText(t('পরিমাণ', 'Qty', params.language), MARGIN_X + 700, y + 31);
  ctx.fillText(t('একক মূল্য', 'Rate', params.language), MARGIN_X + 885, y + 31);
  ctx.fillText(t('মোট', 'Total', params.language), MARGIN_X + CONTENT_W - 22, y + 31);
  ctx.textAlign = 'left';

  y += 54;
  const maxItems = params.items.slice(0, 14);
  let subtotal = 0;

  maxItems.forEach((item, idx) => {
    const lineTotal = item.qty * item.unitPrice;
    subtotal += lineTotal;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(MARGIN_X, y, CONTENT_W, 50);
    }

    const rowTextY = y + 32;
    ctx.fillStyle = '#64748b';
    ctx.font = `600 18px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(idx + 1), MARGIN_X + 20, rowTextY);

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 20px ${fontSans}`;
    ctx.fillText(truncateCanvasText(ctx, item.name, 540), MARGIN_X + 68, rowTextY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = `600 19px ${fontMono}`;
    ctx.fillText(String(item.qty), MARGIN_X + 700, rowTextY);
    ctx.fillText(formatMoney(item.unitPrice, params.currency, params.language), MARGIN_X + 885, rowTextY);
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 20px ${fontMono}`;
    ctx.fillText(formatMoney(lineTotal, params.currency, params.language), MARGIN_X + CONTENT_W - 22, rowTextY);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN_X, y + 49, CONTENT_W, 1);
    y += 50;
  });

  const discountAmt = subtotal * (Math.max(0, params.discountPct) / 100);
  const afterDiscount = Math.max(0, subtotal - discountAmt);
  const vatAmt = afterDiscount * (Math.max(0, params.vatPct) / 100);
  const grandTotal = afterDiscount + vatAmt;

  y += 32;
  const sumW = 430;
  const sumX = MARGIN_X + CONTENT_W - sumW;

  const drawSummaryLine = (label: string, val: string, bold = false, color = '#0f172a') => {
    ctx.textAlign = 'left';
    ctx.fillStyle = bold ? color : '#475569';
    ctx.font = `${bold ? '700' : '600'} ${bold ? 24 : 20}px ${fontSans}`;
    ctx.fillText(label, sumX, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = `700 ${bold ? 26 : 20}px ${fontMono}`;
    ctx.fillText(val, MARGIN_X + CONTENT_W, y);
    ctx.textAlign = 'left';
    y += bold ? 42 : 34;
  };

  drawSummaryLine(
    t('সাবটোটাল', 'Subtotal', params.language),
    formatMoney(subtotal, params.currency, params.language)
  );
  if (discountAmt > 0) {
    drawSummaryLine(
      `${t('ডিসকাউন্ট', 'Discount', params.language)} (${params.discountPct}%)`,
      `-${formatMoney(discountAmt, params.currency, params.language)}`,
      false,
      '#e11d48'
    );
  }
  if (vatAmt > 0) {
    drawSummaryLine(
      `${t('ভ্যাট / ট্যাক্স', 'VAT / Tax', params.language)} (${params.vatPct}%)`,
      `+${formatMoney(vatAmt, params.currency, params.language)}`
    );
  }

  ctx.fillStyle = accent;
  ctx.fillRect(sumX, y - 16, sumW, 3);
  y += 22;

  drawSummaryLine(
    t('সর্বমোট বিল', 'Grand Total', params.language),
    formatMoney(grandTotal, params.currency, params.language),
    true,
    accent
  );

  // Payment Note / Terms
  if (params.paymentNote) {
    const noteY = Math.max(y + 30, PAGE_H - 250);
    drawRoundedRect(ctx, MARGIN_X, noteY, CONTENT_W, 110, 14);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = `700 17px ${fontSans}`;
    ctx.fillText(t('পেমেন্ট নির্দেশনা ও নোট', 'PAYMENT TERMS & NOTES', params.language), MARGIN_X + 24, noteY + 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 19px ${fontSans}`;
    ctx.fillText(truncateCanvasText(ctx, params.paymentNote, CONTENT_W - 48), MARGIN_X + 24, noteY + 74);
  }

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 17px ${fontSans}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `${params.businessName || 'CashTrace'} · ${t('CashTrace ইনভয়েস মেকার দ্বারা প্রস্তুত', 'Generated with CashTrace Invoice Maker', params.language)}`,
    PAGE_W / 2,
    PAGE_H - 52
  );

  const doc = await renderSurfacesToPdf([surface], PAGE_W);

  const safeInv = (params.invoiceNo || 'Invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeInv}_${params.date}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output('datauristring');
    const base64Data = dataUri.split(',')[1] || '';
    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
    await Share.share({
      title: `${params.businessName} — #${params.invoiceNo}`,
      text: `${params.businessName} Invoice #${params.invoiceNo}`,
      url: cached.uri,
      dialogTitle: t('ইনভয়েস PDF শেয়ার বা সেভ করুন', 'Open or Share Invoice PDF', params.language),
    });
    return 'shared';
  }

  doc.save(filename);
  return 'downloaded';
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

export async function exportUserGuidePDF(
  language: LanguageCode,
  accentColor: string = '#059669',
  appUrl: string = 'https://ais-pre-owas2ijyoaznyjepjryzzx-756624311640.asia-southeast1.run.app'
): Promise<'shared' | 'downloaded'> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font-ready errors
    }
  }

  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_X = 72;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const accent = accentColor || '#059669';
  const fontSans = `'Hind Siliguri', 'Plus Jakarta Sans', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif`;
  const fontMono = `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace`;

  const pages: PdfPageSurface[] = [];

  const createGuidePage = (pageNum: number, sectionTag: string, title: string, subtitle: string) => {
    const surface = createHiDpiPdfSurface(PAGE_W, PAGE_H, 2);
    const {ctx} = surface;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Top accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, PAGE_W, 14);

    if (pageNum === 1) {
      // Hero cover header
      drawRoundedRect(ctx, MARGIN_X, 52, CONTENT_W, 250, 24);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      ctx.fillStyle = accent;
      drawRoundedRect(ctx, MARGIN_X + 36, 86, 178, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 16px ${fontMono}`;
      ctx.textAlign = 'center';
      ctx.fillText('USER MANUAL · v2.0', MARGIN_X + 36 + 89, 110);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 46px ${fontSans}`;
      ctx.fillText(title, MARGIN_X + 36, 176);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `500 22px ${fontSans}`;
      const subLines = wrapCanvasLines(ctx, subtitle, CONTENT_W - 72);
      subLines.slice(0, 2).forEach((ln, idx) => {
        ctx.fillText(ln, MARGIN_X + 36, 222 + idx * 32);
      });

      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 16px ${fontMono}`;
      ctx.fillText(appUrl, MARGIN_X + 36, 284);
      pages.push(surface);
      return {ctx, y: 340};
    }

    // Standard guide header
    ctx.fillStyle = accent;
    ctx.font = `700 16px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText(sectionTag.toUpperCase(), MARGIN_X, 68);

    ctx.fillStyle = '#0f172a';
    ctx.font = `700 34px ${fontSans}`;
    ctx.fillText(title, MARGIN_X, 110);

    ctx.fillStyle = '#64748b';
    ctx.font = `500 19px ${fontSans}`;
    ctx.fillText(subtitle, MARGIN_X, 144);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN_X, 166, CONTENT_W, 2);

    pages.push(surface);
    return {ctx, y: 196};
  };

  const drawGuideCard = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    num: string,
    heading: string,
    bullets: string[],
    badgeColor: string = accent
  ): number => {
    ctx.font = `500 18px ${fontSans}`;
    let textH = 0;
    const wrappedBullets: string[][] = bullets.map((b) => {
      const lines = wrapCanvasLines(ctx, b, w - 76);
      textH += lines.length * 27 + 10;
      return lines;
    });
    const cardH = Math.max(132, 74 + textH + 16);

    drawRoundedRect(ctx, x, y, w, cardH, 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Number tag
    drawRoundedRect(ctx, x + 22, y + 20, 42, 32, 8);
    ctx.fillStyle = badgeColor;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 16px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText(num, x + 43, y + 41);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 22px ${fontSans}`;
    ctx.fillText(truncateCanvasText(ctx, heading, w - 96), x + 78, y + 43);

    let cursorY = y + 80;
    wrappedBullets.forEach((lines) => {
      // Small square marker
      ctx.fillStyle = badgeColor;
      ctx.fillRect(x + 26, cursorY - 12, 7, 7);

      ctx.fillStyle = '#334155';
      ctx.font = `500 18px ${fontSans}`;
      lines.forEach((line) => {
        ctx.fillText(line, x + 46, cursorY);
        cursorY += 27;
      });
      cursorY += 10;
    });

    return y + cardH + 20;
  };

  // PAGE 1 — Getting Started, Profiles & Live Currency
  const p1 = createGuidePage(
    1,
    'CHAPTER 01',
    t('CashTrace ব্যবহার নির্দেশিকা', 'CashTrace Complete User Guide', language),
    t(
      'দৈনিক হিসাব, ওয়ালেট, দেনা-পাওনা, ব্যবসা ও প্রয়োজনীয় পকেট টুলসের পূর্ণাঙ্গ ম্যানুয়াল',
      'Everything you need to master daily finance, wallets, ledgers, and 11 pocket tools.',
      language
    )
  );
  let y = p1.y;
  y = drawGuideCard(
    p1.ctx,
    MARGIN_X,
    y,
    CONTENT_W,
    '01',
    t('১. দ্রুত শুরু করুন (৬০ সেকেন্ডে সেটআপ)', '1. Quick Start (60-Second Setup)', language),
    [
      t(
        'অ্যাপ ওপেন করেই অফলাইনে সাথে সাথে হিসাব শুরু করা যায়। উপরের বার থেকে গুগল লগইন করলে সব ডিভাইসে রিয়েল-টাইম ক্লাউড সিঙ্ক চালু হবে।',
        'Start recording immediately offline—no account required. Sign in with Google anytime for real-time multi-device cloud sync.',
        language
      ),
      t(
        'প্রথম ব্যবহারে সেটিংস ট্যাব থেকে আপনার নাম, ভাষা (বাংলা / English) ও মূল মুদ্রা (৳, $, €, SAR ইত্যাদি) ঠিক করে নিন।',
        'Set your name, preferred language (Bangla / English), and default currency inside the Settings tab.',
        language
      ),
    ]
  );
  y = drawGuideCard(
    p1.ctx,
    MARGIN_X,
    y,
    CONTENT_W,
    '02',
    t('২. মাল্টি-প্রোফাইল ওয়ার্কস্পেস (Personal / Business / Family)', '2. Multi-Profile Workspaces', language),
    [
      t(
        'হেডারের প্রোফাইল নাম বা সেটিংস থেকে আলাদা হিসাব-খাতা তৈরি করুন—যেমন ব্যক্তিগত, দোকান/ব্যবসা, ফ্যামিলি বা অফিস প্রোফাইল।',
        'Create separate isolated books for Personal, Business, Family, or Travel from the header profile switcher.',
        language
      ),
      t(
        'প্রতিটি প্রোফাইলের ওয়ালেট, লেনদেন, দেনা-পাওনা এবং মুদ্রা সম্পূর্ণ আলাদাভাবে সংরক্ষিত ও সিঙ্ক হয়।',
        'Every workspace keeps its own wallets, transactions, pending debts, budgets, and currency settings.',
        language
      ),
    ],
    '#0284c7'
  );
  y = drawGuideCard(
    p1.ctx,
    MARGIN_X,
    y,
    CONTENT_W,
    '03',
    t('৩. রিয়েল-টাইম কারেন্সি ইঞ্জিন ও স্থায়ী কনভার্সন (FX Rebase)', '3. Live Currency Engine & Permanent Rebase', language),
    [
      t(
        'সেটিংস থেকে যেকোনো সময় কারেন্সি বদলালে ড্যাশবোর্ড, ওয়ালেট, দেনা-পাওনা ও রিপোর্টের সব সংখ্যা লাইভ এক্সচেঞ্জ রেটে রূপান্তর হয়ে দেখাবে।',
        'Switch display currency anytime in Settings to view every balance, transaction, and report converted at live exchange rates.',
        language
      ),
      t(
        'স্থায়ীভাবে সব রেকর্ড নতুন কারেন্সিতে সেভ করতে চাইলে "Rebase Stored Data" বাটনে ক্লিক করে কনফার্ম করুন।',
        'To permanently convert stored amounts into the new currency, use the "Confirm Rebase" option inside Settings.',
        language
      ),
    ],
    '#7c3aed'
  );
  drawGuideCard(
    p1.ctx,
    MARGIN_X,
    y,
    CONTENT_W,
    '04',
    t('৪. স্পটলাইট কুইক সার্চ (⌘K / Ctrl+K)', '4. Spotlight Global Command Search (⌘K)', language),
    [
      t(
        'হেডারের সার্চ আইকন অথবা Ctrl+K চাপুন—যেকোনো লেনদেন, ব্যক্তি, ভল্ট লেবেল, দৈনিক কাজ বা ১১টি টুলসের যেকোনোটি এক সেকেন্ডে খুঁজুন।',
        'Tap the header search icon or press Ctrl+K / ⌘K to jump straight to any transaction, person, task, vault label, or pocket tool.',
        language
      ),
    ],
    '#0f172a'
  );

  // PAGE 2 — Dashboard, Quick Entry, 3D Wallets & Debts
  const p2 = createGuidePage(
    2,
    'CHAPTER 02',
    t('হিসাব, ৩ডি ওয়ালেট ও দেনা-পাওনা', 'Dashboard, 3D Wallets & Debt Ledger', language),
    t(
      'প্রতিদিনের আয়-ব্যয়, কিস্তি ও বাকি হিসাবের সহজ ও দ্রুত পরিচালনা',
      'Track daily cashflow, card wallets, and personal/business receivables effortlessly.',
      language
    )
  );
  let y2 = p2.y;
  y2 = drawGuideCard(
    p2.ctx,
    MARGIN_X,
    y2,
    CONTENT_W,
    '01',
    t('স্মার্ট কুইক-এন্ট্রি (এক লাইনেই এন্ট্রি)', 'Smart One-Line Quick Entry', language),
    [
      t(
        'ড্যাশবোর্ডের কুইক বক্সে সরাসরি লিখুন: যেমন "বিকাশ ৫০০ বাজার" বা "1200 salary"—অ্যাপ নিজেই পরিমাণ, ওয়ালেট ও ধরন বুঝে ১ ট্যাপে সেভ করে।',
        'Type naturally in the Quick Entry bar (e.g., "500 lunch" or "বিকাশ ৫০০ বাজার") — CashTrace automatically detects amount, wallet, and category.',
        language
      ),
      t(
        'নিয়মিত খরচ যেমন বাড়ি ভাড়া, বেতন বা বাজার সেটিংস থেকে "Quick Templates" হিসেবে সেভ করলে ১ ক্লিকেই এন্ট্রি দেওয়া যায়।',
        'Save recurring entries as Quick Templates in Settings for single-tap logging.',
        language
      ),
    ]
  );
  y2 = drawGuideCard(
    p2.ctx,
    MARGIN_X,
    y2,
    CONTENT_W,
    '02',
    t('বেনটো-গ্রিড ড্যাশবোর্ড ও ডেইলি বার্ণ-রেট', 'Bento Command Center & Daily Burn Rate', language),
    [
      t(
        'উপরের কার্ডে একসাথে মোট ব্যালেন্স, দৈনিক গড় খরচ (Daily Burn), মাসিক সেভিংস রেট এবং বাজেট প্রগ্রেস বার দেখতে পাবেন।',
        'See total net balance, daily average spend rate, savings ratio, and remaining monthly budget progress in one scan.',
        language
      ),
      t(
        'ডেইলি ক্যালেন্ডার গ্রিডের যেকোনো তারিখে ট্যাপ করে ঐ দিনের সব হিসাব দেখা বা সরাসরি নতুন লেনদেন যোগ করা যায়।',
        'Tap any day on the monthly calendar grid to inspect or add entries for that specific date.',
        language
      ),
    ],
    '#0284c7'
  );
  y2 = drawGuideCard(
    p2.ctx,
    MARGIN_X,
    y2,
    CONTENT_W,
    '03',
    t('৩ডি ফ্লিপেবল ওয়ালেট কার্ড ও ওয়ালেট ট্রান্সফার', '3D Flippable Wallet Cards & Internal Transfers', language),
    [
      t(
        'নগদ (Cash), ব্যাংক, বিকাশ, নগদ বা রকেট—সব একাউন্ট আলাদা কার্ড হিসেবে সাজানো থাকে।',
        'Manage Cash, Bank, bKash, Nagad, and Rocket accounts as clean interactive 3D cards.',
        language
      ),
      t(
        'যেকোনো কার্ডে "ফ্লিপ / বিস্তারিত" বাটনে ট্যাপ করলে কার্ড উল্টে শেষ লেনদেন, মোট আয়-ব্যয় ও প্রারম্ভিক ব্যালেন্স দেখা যায়।',
        'Flip any wallet card to inspect recent wallet transactions, inflows, outflows, and edit opening balance.',
        language
      ),
    ],
    '#d97706'
  );
  drawGuideCard(
    p2.ctx,
    MARGIN_X,
    y2,
    CONTENT_W,
    '04',
    t('ব্যক্তি-ভিত্তিক দেনা-পাওনা ও হোয়াটসঅ্যাপ রিমাইন্ডার', 'Person-Wise Debts & 1-Click WhatsApp Reminder', language),
    [
      t(
        'কাকে কত টাকা দিয়েছেন (পাবো) বা কার কাছ থেকে নিয়েছেন (দেবো)—ব্যক্তি অনুযায়ী গ্রুপ করে প্রগ্রেস বার সহ দেখুন।',
        'Group receivables and payables automatically by person with live repayment progress bars.',
        language
      ),
      t(
        'পাওনা আদায়ের জন্য "Remind" বাটনে ট্যাপ করলেই বাংলা/ইংরেজি মেসেজ তৈরি হয়ে সরাসরি WhatsApp বা কপি অপশন খুলে যাবে।',
        'Tap "Remind" next to any receivable contact to generate a polite bilingual payment reminder ready for WhatsApp or clipboard.',
        language
      ),
    ],
    '#e11d48'
  );

  // PAGE 3 — 11 Daily Pocket & Business Tools
  const p3 = createGuidePage(
    3,
    'CHAPTER 03',
    t('১১টি পকেট ও বিজনেস টুলস', '11 Daily Pocket & Business Tools', language),
    t(
      'প্রতিদিনের কাজ, গোপন ডকুমেন্ট, QR কার্ড, ইনভয়েস ও হিসাব-নিকাশের অল-ইন-ওয়ান হাব',
      'Every utility you need in your pocket—inside the Hub & Tools tab.',
      language
    )
  );
  let y3 = p3.y;
  const colW = (CONTENT_W - 24) / 2;
  const toolsList = [
    {
      num: '01',
      tBn: 'দৈনিক কাজ ও ফোকাস টাইমার',
      tEn: 'Daily Planner & Pomodoro',
      dBn: 'টু-ডু লিস্ট, সময় অনুযায়ী কাজ এবং ২৫/১৫ মিনিট ফোকাস টাইমার।',
      dEn: 'To-do checklist with priority & due times paired with a 25/15 min Pomodoro timer.',
    },
    {
      num: '02',
      tBn: 'সুরক্ষিত পকেট ভল্ট',
      tEn: 'Secure Pocket Vault',
      dBn: 'NID, পাসপোর্ট, ব্যাংক, কার্ড বা Wi-Fi তথ্য লুকিয়ে রাখুন; পিন দিয়ে সুরক্ষিত।',
      dEn: 'Store masked NID, Passport, Bank & Wi-Fi details with 1-tap copy & hide protection.',
    },
    {
      num: '03',
      tBn: 'ডিজিটাল QR কার্ড মেকার',
      tEn: 'Digital QR Card Maker',
      dBn: 'বিকাশ/নগদ পেমেন্ট, Wi-Fi পাসওয়ার্ড বা বিজনেস vCard QR তৈরি ও PNG সেভ করুন।',
      dEn: 'Generate Payment, Wi-Fi join, or Contact vCard QR cards and export crisp PNGs.',
    },
    {
      num: '04',
      tBn: 'বিজনেস ইনভয়েস ও কোটেশন PDF',
      tEn: 'Business Invoice & Quote PDF',
      dBn: 'গ্রাহকের জন্য ডিসকাউন্ট, ভ্যাট ও স্ট্যাটাস (PAID/DUE/QUOTE) সহ প্রফেশনাল A4 PDF।',
      dEn: 'Create branded A4 invoices and quotations with VAT, discounts & status badges.',
    },
    {
      num: '05',
      tBn: 'লাইভ কারেন্সি কনভার্টার',
      tEn: 'Live Currency Converter',
      dBn: 'USD, SAR, EUR, GBP, BDT সহ ২০+ মুদ্রার রিয়েল-টাইম রেট কনভার্সন।',
      dEn: 'Convert across 20+ global currencies using live exchange rates anytime.',
    },
    {
      num: '06',
      tBn: 'বিকাশ/নগদ ক্যাশআউট চার্জ',
      tEn: 'MFS Cash-Out Calculator',
      dBn: 'বিকাশ (প্রিয় এজেন্ট/রেগুলার), নগদ, রকেট ও উপায় এর সঠিক চার্জ জানুন।',
      dEn: 'Instant cash-out fee and net-receivable breakdown for bKash, Nagad, Rocket & Upay.',
    },
    {
      num: '07',
      tBn: 'মাসিক বিল রিমাইন্ডার',
      tEn: 'Monthly Bills & Subscriptions',
      dBn: 'বাসা ভাড়া, ইন্টারনেট, বিদ্যুৎ বা সাবস্ক্রিপশন বিল ট্র্যাক ও ১ ট্যাপে পরিশোধ করুন।',
      dEn: 'Track recurring rent, Wi-Fi, utility & subscription due dates with 1-tap payment logging.',
    },
    {
      num: '08',
      tBn: 'ট্যুর ও মেস বিল স্প্লিট',
      tEn: 'Tour & Mess Bill Splitter',
      dBn: 'বন্ধুদের ট্যুর বা মেসের যৌথ খরচ কে কাকে কত দেবে অটোমেটিক সেটেলমেন্ট।',
      dEn: 'Calculate exact "who pays whom" settlements for group trips or shared flats.',
    },
    {
      num: '09',
      tBn: 'আর্থিক ক্যালকুলেটর প্যাক',
      tEn: 'EMI / DPS / Zakat / VAT',
      dBn: 'লোন EMI, সঞ্চয়/DPS মেয়াদান্তে প্রাপ্তি, যাকাত (২.৫%) ও ডিসকাউন্ট হিসাব।',
      dEn: 'Built-in calculators for loan EMI, DPS returns, Zakat (2.5%), VAT & store discounts.',
    },
    {
      num: '10',
      tBn: 'কুইক রসিদ ও নোটস ভল্ট',
      tEn: 'Quick Receipt & Notes Vault',
      dBn: 'দোকানের রসিদ প্রিন্ট/PDF ও জরুরি আর্থিক মেমো সংরক্ষণের সুবিধা।',
      dEn: 'Print or download instant receipts and pin important financial memos.',
    },
  ];

  for (let i = 0; i < toolsList.length; i += 2) {
    const left = toolsList[i];
    const right = toolsList[i + 1];
    const nextYLeft = drawGuideCard(
      p3.ctx,
      MARGIN_X,
      y3,
      colW,
      left.num,
      language === 'bn' ? left.tBn : left.tEn,
      [language === 'bn' ? left.dBn : left.dEn],
      accent
    );
    let nextYRight = nextYLeft;
    if (right) {
      nextYRight = drawGuideCard(
        p3.ctx,
        MARGIN_X + colW + 24,
        y3,
        colW,
        right.num,
        language === 'bn' ? right.tBn : right.tEn,
        [language === 'bn' ? right.dBn : right.dEn],
        '#0284c7'
      );
    }
    y3 = Math.max(nextYLeft, nextYRight);
  }

  // PAGE 4 — Reports, Theme Studio, Cloud Sync & Backup
  const p4 = createGuidePage(
    4,
    'CHAPTER 04',
    t('রিপোর্ট, থিম স্টুডিও, নিরাপত্তা ও ব্যাকআপ', 'Reports, Theme Studio, Security & Backup', language),
    t(
      'পছন্দমতো ডিজাইন, ডেটা সুরক্ষা ও প্রিন্ট-রেডি স্টেটমেন্ট এক্সপোর্ট',
      'Customize aesthetics, lock sensitive access, and keep your data safe forever.',
      language
    )
  );
  let y4 = p4.y;
  y4 = drawGuideCard(
    p4.ctx,
    MARGIN_X,
    y4,
    CONTENT_W,
    '01',
    t('রিপোর্ট, স্টেটমেন্ট PDF, Excel ও CSV', 'Reports, Monthly PDF Statements, Excel & CSV', language),
    [
      t(
        'রিপোর্ট ট্যাব থেকে ক্যাটাগরি-ভিত্তিক চার্ট এবং সোশ্যাল শেয়ারযোগ্য মাসিক সামারি PNG কার্ড ডাউনলোড করুন।',
        'Inspect category spending charts and export shareable monthly visual summary PNG cards from the Reports tab.',
        language
      ),
      t(
        '"Print / Export" বাটন থেকে A4 PDF স্টেটমেন্ট, Excel (.xls) বা CSV ফাইল ডাউনলোড/শেয়ার করুন।',
        'Generate clean A4 PDF financial statements, Excel (.xls), or CSV sheets anytime.',
        language
      ),
    ]
  );
  y4 = drawGuideCard(
    p4.ctx,
    MARGIN_X,
    y4,
    CONTENT_W,
    '02',
    t('থিম স্টুডিও (Theme Studio)', 'Theme Studio — Personalize Everything', language),
    [
      t(
        'হেডার বা সেটিংস থেকে থিম স্টুডিও খুলুন: ৭টি কিউরেটেড প্রিসেট (Emerald, Midnight, Ocean, Rose, Amber, Ivory, Forest) থেকে বেছে নিন।',
        'Open Theme Studio to pick from 7 curated theme presets or customize Light, Dark & OLED AMOLED surfaces.',
        language
      ),
      t(
        'কার্ড স্টাইল (Glass / Flat / Crisp Border), ফন্ট (Hind Siliguri / Plus Jakarta / Serif / Mono) ও ডেনসিটি নিজের মতো সাজান।',
        'Fine-tune accent colors, card geometry, typography pairs, and compact vs comfortable spacing.',
        language
      ),
    ],
    '#7c3aed'
  );
  y4 = drawGuideCard(
    p4.ctx,
    MARGIN_X,
    y4,
    CONTENT_W,
    '03',
    t('৪-ডিজিট PIN লক, প্রাইভেসি আই ও বাজার লিস্ট', '4-Digit PIN Lock, Privacy Toggle & Shopping Hub', language),
    [
      t(
        'সেটিংস থেকে ৪-সংখ্যার PIN চালু করলে প্রতিবার অ্যাপ খোলার সময় পাসকোড চাইবে। ব্যালেন্স আইকনে ট্যাপ করে আশেপাশের মানুষ থেকে টাকার পরিমাণ আড়াল (••••) করুন।',
        'Enable the 4-digit PIN lock in Settings to secure entry, and tap the Eye button in the header to mask amounts in public.',
        language
      ),
      t(
        'শপিং ও সেভিংস হাব থেকে বাজার ফর্দ চেক করুন এবং সম্পন্ন বাজার সরাসরি খরচে কনভার্ট করুন।',
        'Build grocery checklists inside the Hub tab and convert completed trips directly into an expense entry.',
        language
      ),
    ],
    '#0284c7'
  );
  drawGuideCard(
    p4.ctx,
    MARGIN_X,
    y4,
    CONTENT_W,
    '04',
    t('ক্লাউড সিঙ্ক + অফলাইন JSON ব্যাকআপ', 'Cloud Sync & Offline JSON Backup', language),
    [
      t(
        'গুগল অ্যাকাউন্ট দিয়ে সাইন-ইন করলে সমস্ত প্রোফাইল ও টুলস ডেটা Firestore ক্লাউডে রিয়েল-টাইম সেভ থাকবে।',
        'Sign in with Google to enable real-time encrypted Firestore sync across all your workspaces.',
        language
      ),
      t(
        'এছাড়াও সেটিংস থেকে যেকোনো সময় ১ ক্লিকে সম্পূর্ণ JSON ব্যাকআপ ডাউনলোড বা নতুন ফোনে রিস্টোর করতে পারবেন।',
        'You can also export a complete offline JSON backup anytime from Settings and restore it on any device.',
        language
      ),
    ],
    '#0f172a'
  );

  // Add page numbers & footer to all 4 pages
  pages.forEach(({ctx}, idx) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN_X, PAGE_H - 74, CONTENT_W, 1);

    ctx.fillStyle = '#64748b';
    ctx.font = `500 16px ${fontSans}`;
    ctx.textAlign = 'left';
    ctx.fillText('CashTrace — Smart Daily Finance & Pocket Hub', MARGIN_X, PAGE_H - 40);

    ctx.textAlign = 'right';
    ctx.font = `600 16px ${fontMono}`;
    ctx.fillText(
      `${t('পৃষ্ঠা', 'Page', language)} ${idx + 1} / ${pages.length}`,
      PAGE_W - MARGIN_X,
      PAGE_H - 40
    );
  });

  const doc = await renderSurfacesToPdf(pages, PAGE_W);

  const filename = `CashTrace_User_Guide_${language.toUpperCase()}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output('datauristring');
    const base64Data = dataUri.split(',')[1] || '';
    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
    await Share.share({
      title: 'CashTrace User Guide PDF',
      text: t('CashTrace ব্যবহার নির্দেশিকা PDF', 'CashTrace Complete User Guide PDF', language),
      url: cached.uri,
      dialogTitle: t('ব্যবহার নির্দেশিকা PDF শেয়ার বা সেভ করুন', 'Save or Share User Guide PDF', language),
    });
    return 'shared';
  }

  doc.save(filename);
  return 'downloaded';
}

export interface BrandedPosterParams {
  imageSrc: string;
  aspect: '3:4' | '1:1' | '16:9';
  kicker: string;
  headline: string;
  subline: string;
  ctaLabel: string;
  footerUrl: string;
  accentColor?: string;
  fileSlug: string;
  language: LanguageCode;
}

export async function exportBrandedMarketingPoster(
  params: BrandedPosterParams
): Promise<'shared' | 'downloaded'> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore
    }
  }

  const width = params.aspect === '16:9' ? 1600 : 1200;
  const height = params.aspect === '16:9' ? 900 : params.aspect === '1:1' ? 1200 : 1600;
  const accent = params.accentColor || '#059669';
  const fontSans = `'Hind Siliguri', 'Plus Jakarta Sans', system-ui, sans-serif`;
  const fontMono = `'JetBrains Mono', ui-monospace, monospace`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Poster asset failed to load'));
    el.src = params.imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Cover-fit image
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > canvasRatio) {
    sw = img.height * canvasRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / canvasRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  // Subtle top vignette + bold bottom editorial gradient scrim for sharp legibility
  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.28);
  topGrad.addColorStop(0, 'rgba(15, 23, 42, 0.72)');
  topGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.28);

  const botGrad = ctx.createLinearGradient(0, height * 0.48, 0, height);
  botGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
  botGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.82)');
  botGrad.addColorStop(1, 'rgba(15, 23, 42, 0.96)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height * 0.48, width, height * 0.52);

  const pad = params.aspect === '16:9' ? 68 : 64;

  // Top Brand Lockup
  drawRoundedRect(ctx, pad, pad - 8, 52, 52, 14);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 28px ${fontSans}`;
  ctx.textAlign = 'center';
  ctx.fillText('৳', pad + 26, pad + 28);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 32px ${fontSans}`;
  ctx.fillText('CashTrace', pad + 68, pad + 27);

  // Kicker tag on top right
  ctx.font = `700 18px ${fontMono}`;
  const kickerText = params.kicker.toUpperCase();
  const kickerW = Math.min(460, ctx.measureText(kickerText).width + 36);
  drawRoundedRect(ctx, width - pad - kickerW, pad - 4, kickerW, 42, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(truncateCanvasText(ctx, kickerText, kickerW - 24), width - pad - kickerW / 2, pad + 23);

  // Bottom Editorial Copy
  ctx.textAlign = 'left';
  const maxTextW = width - pad * 2;
  const headlineSize = params.aspect === '16:9' ? 56 : 62;
  ctx.font = `700 ${headlineSize}px ${fontSans}`;
  const headlineLines = wrapCanvasLines(ctx, params.headline, maxTextW).slice(0, 3);

  ctx.font = `500 28px ${fontSans}`;
  const subLines = wrapCanvasLines(ctx, params.subline, maxTextW).slice(0, 2);

  const footerBarY = height - pad - 54;
  const subStartY = footerBarY - 36 - subLines.length * 38;
  const headStartY = subStartY - 18 - headlineLines.length * (headlineSize + 10);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${headlineSize}px ${fontSans}`;
  headlineLines.forEach((line, idx) => {
    ctx.fillText(line, pad, headStartY + idx * (headlineSize + 10));
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 28px ${fontSans}`;
  subLines.forEach((line, idx) => {
    ctx.fillText(line, pad, subStartY + idx * 38);
  });

  // Footer CTA badge + URL
  ctx.font = `700 22px ${fontSans}`;
  const ctaW = Math.min(440, ctx.measureText(params.ctaLabel).width + 52);
  drawRoundedRect(ctx, pad, footerBarY, ctaW, 54, 12);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(params.ctaLabel, pad + ctaW / 2, footerBarY + 35);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 18px ${fontMono}`;
  ctx.fillText(truncateCanvasText(ctx, params.footerUrl.replace(/^https?:\/\//, ''), maxTextW - ctaW - 28), width - pad, footerBarY + 34);

  const dataUrl = canvas.toDataURL('image/png');
  const filename = `${params.fileSlug}_${params.language}.png`;

  if (Capacitor.isNativePlatform()) {
    const base64Data = dataUrl.split(',')[1] || '';
    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
    await Share.share({
      title: 'CashTrace Marketing Poster',
      text: `${params.headline} — ${params.footerUrl}`,
      url: cached.uri,
      dialogTitle: t('মার্কেটিং পোস্টার শেয়ার বা সেভ করুন', 'Save or Share Marketing Poster', params.language),
    });
    return 'shared';
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'downloaded';
}



