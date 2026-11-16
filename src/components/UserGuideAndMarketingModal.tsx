import React, {useEffect, useMemo, useState} from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  Megaphone,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import businessBannerImg from '../assets/images/cashtrace_business_banner_1794856681935.jpg';
import heroPosterImg from '../assets/images/cashtrace_hero_poster_1794856679390.jpg';
import pocketHubImg from '../assets/images/cashtrace_pocket_hub_1794856681477.jpg';
import walletsFeatureImg from '../assets/images/cashtrace_wallets_feature_1794856679381.jpg';
import {LanguageCode} from '../types';
import {exportBrandedMarketingPoster, exportUserGuidePDF} from '../utils/exportHelper';
import {t} from '../utils/i18n';

const SHARED_APP_URL =
  'https://ais-pre-owas2ijyoaznyjepjryzzx-756624311640.asia-southeast1.run.app';

interface UserGuideAndMarketingModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: LanguageCode;
  accentColor?: string;
  initialView?: 'guide' | 'marketing';
  onShowToast: (msg: string) => void;
}

interface GuideChapter {
  id: string;
  num: string;
  titleBn: string;
  titleEn: string;
  summaryBn: string;
  summaryEn: string;
  icon: React.ReactNode;
  steps: Array<{
    headBn: string;
    headEn: string;
    descBn: string;
    descEn: string;
  }>;
}

interface PosterPreset {
  id: string;
  slug: string;
  imageSrc: string;
  aspect: '3:4' | '1:1' | '16:9';
  formatLabelBn: string;
  formatLabelEn: string;
  kickerBn: string;
  kickerEn: string;
  headlineBn: string;
  headlineEn: string;
  sublineBn: string;
  sublineEn: string;
  ctaBn: string;
  ctaEn: string;
  alt: string;
}

export const UserGuideAndMarketingModal: React.FC<UserGuideAndMarketingModalProps> = ({
  isOpen,
  onClose,
  language,
  accentColor = '#059669',
  initialView = 'guide',
  onShowToast,
}) => {
  const [activeView, setActiveView] = useState<'guide' | 'marketing'>(initialView);
  const [openChapterId, setOpenChapterId] = useState<string>('ch_start');
  const [guideSearch, setGuideSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [customAppUrl, setCustomAppUrl] = useState(SHARED_APP_URL);

  useEffect(() => {
    if (isOpen) {
      setActiveView(initialView);
    }
  }, [isOpen, initialView]);

  const chapters: GuideChapter[] = useMemo(
    () => [
      {
        id: 'ch_start',
        num: '01',
        titleBn: 'দ্রুত শুরু, প্রোফাইল ও লাইভ কারেন্সি',
        titleEn: 'Quick Start, Multi-Profile & Live FX',
        summaryBn: 'অফলাইন শুরু, গুগল ক্লাউড সিঙ্ক, আলাদা খাতা ও রিয়েল-টাইম কারেন্সি কনভার্সন।',
        summaryEn: 'Offline-first launch, Google sync, isolated workspaces & real-time currency conversion.',
        icon: <Layers className="w-4 h-4 ct-accent-text" />,
        steps: [
          {
            headBn: '১. এক সেকেন্ডেই শুরু (অফলাইন + ক্লাউড)',
            headEn: '1. Start Offline or Sync with Google',
            descBn:
              'অ্যাপ ওপেন করেই ইন্টারনেট ছাড়া হিসাব লেখা শুরু করুন। একাধিক ফোনে সিঙ্ক রাখতে হেডারের Cloud বাটন বা সেটিংস থেকে Google Sign-In করুন।',
            descEn:
              'Record entries offline from second one. Sign in with Google from the header or Settings whenever you want real-time multi-device sync.',
          },
          {
            headBn: '২. আলাদা প্রোফাইল ওয়ার্কস্পেস',
            headEn: '2. Personal, Business & Family Workspaces',
            descBn:
              'হেডারের প্রোফাইল নাম ট্যাপ করে নতুন প্রোফাইল বানান (যেমন: ব্যবসা, ফ্যামিলি, ট্যুর)। প্রতিটির ওয়ালেট, দেনা-পাওনা ও মুদ্রা আলাদা থাকবে।',
            descEn:
              'Tap your profile name in the top bar to switch or create separate books for Personal, Shop/Business, or Family.',
          },
          {
            headBn: '৩. রিয়েল-টাইম কারেন্সি পরিবর্তন ও Rebase',
            headEn: '3. Live Currency Switching & Permanent Rebase',
            descBn:
              'সেটিংস থেকে মুদ্রা বদলালেই পুরো অ্যাপের টাকা, বাজেট ও রিপোর্ট লাইভ রেটে রূপান্তরিত হবে। স্থায়ী সেভ করতে "Confirm Rebase" চাপুন।',
            descEn:
              'Change your display currency in Settings to convert all balances live, or run "Confirm Rebase" to permanently save values in the new currency.',
          },
          {
            headBn: '৪. স্পটলাইট কুইক সার্চ (Ctrl+K / ⌘K)',
            headEn: '4. Spotlight Command Palette (Ctrl+K / ⌘K)',
            descBn:
              'হেডারের সার্চ আইকনে ট্যাপ করে যেকোনো লেনদেন, ব্যক্তি, ভল্ট লেবেল, দৈনিক কাজ বা ১১টি পকেট টুলসের যেকোনোটি সাথে সাথে খুলুন।',
            descEn:
              'Click the search icon in the header or press Ctrl+K to jump instantly to any transaction, contact, task, or tool.',
          },
        ],
      },
      {
        id: 'ch_ledger',
        num: '02',
        titleBn: 'স্মার্ট ড্যাশবোর্ড, ৩ডি ওয়ালেট ও দেনা-পাওনা',
        titleEn: 'Dashboard, 3D Wallets & Debt Ledger',
        summaryBn: 'এক লাইনে কুইক এন্ট্রি, দৈনিক গড় খরচ, ৩ডি কার্ড ফ্লিপ ও WhatsApp বাকি রিমাইন্ডার।',
        summaryEn: 'Natural quick entry, burn rate KPIs, 3D card flip & 1-click WhatsApp reminders.',
        icon: <Wallet className="w-4 h-4 ct-accent-text" />,
        steps: [
          {
            headBn: '১. এক লাইনেই স্মার্ট কুইক-এন্ট্রি',
            headEn: '1. Smart One-Line Quick Entry',
            descBn:
              'ড্যাশবোর্ডের কুইক-এন্ট্রি বক্সে লিখুন "বিকাশ ৫০০ বাজার" বা "1200 salary"—অ্যাপ নিজেই পরিমাণ, ওয়ালেট ও ধরন শনাক্ত করে সেভ করে।',
            descEn:
              'Type natural phrases like "500 lunch" or "বিকাশ ৫০০ বাজার" into Quick Entry—amount, wallet, and type are parsed automatically.',
          },
          {
            headBn: '২. বেনটো কমান্ড সেন্টার ও ক্যালেন্ডার গ্রিড',
            headEn: '2. Bento Command Grid & Calendar Heatmap',
            descBn:
              'উপরের কার্ডে মোট ব্যালেন্স, দৈনিক গড় খরচ (Daily Burn), সেভিংস রেট ও মাসিক বাজেট প্রগ্রেস দেখা যায়। ক্যালেন্ডারে তারিখ ট্যাপ করে ঐ দিনের হিসাব দেখুন।',
            descEn:
              'Scan net balance, daily average spend rate, savings ratio, and budget status at a glance; tap any calendar date to inspect or add entries.',
          },
          {
            headBn: '৩. ৩ডি ফ্লিপেবল ওয়ালেট কার্ড',
            headEn: '3. 3D Flippable Wallet Cards',
            descBn:
              'নগদ, ব্যাংক, বিকাশ বা নগদ—সব ওয়ালেট কার্ড উল্টে (Flip) সাম্প্রতিক লেনদেন, মোট আয়-ব্যয় ও শুরুর ব্যালেন্স আপডেট করা যায়।',
            descEn:
              'Flip any Cash, Bank, bKash, or Nagad card to inspect recent wallet history, net cashflow, or edit opening balance.',
          },
          {
            headBn: '৪. ব্যক্তি-ভিত্তিক বাকি ও ১ ক্লিক হোয়াটসঅ্যাপ রিমাইন্ডার',
            headEn: '4. Person-Wise Debts & WhatsApp Reminders',
            descBn:
              'পাবো ও দেবো হিসাব ব্যক্তি অনুযায়ী গ্রুপ থাকে। পাওনা মনে করিয়ে দিতে "Remind" বাটনে ট্যাপ করলে বাংলা/ইংরেজি মেসেজ সরাসরি WhatsApp-এ খুলবে।',
            descEn:
              'Track receivables and payables grouped by contact with progress bars, and tap "Remind" to launch a ready-to-send WhatsApp message.',
          },
        ],
      },
      {
        id: 'ch_tools',
        num: '03',
        titleBn: '১১টি পকেট ও বিজনেস টুলস হাব',
        titleEn: '11 Pocket & Business Tools',
        summaryBn: 'কাজের রুটিন, গোপন ভল্ট, QR কার্ড, বিজনেস ইনভয়েস PDF, FX, MFS চার্জ ও ক্যালকুলেটর।',
        summaryEn: 'Planner & Pomodoro, Pocket Vault, QR Cards, Invoice PDF, FX, MFS fees & calculators.',
        icon: <Wrench className="w-4 h-4 ct-accent-text" />,
        steps: [
          {
            headBn: '১. দৈনিক কাজ ও ফোকাস টাইমার + সুরক্ষিত পকেট ভল্ট',
            headEn: '1. Daily Planner & Pomodoro + Secure Pocket Vault',
            descBn:
              'প্রতিদিনের কাজের চেকলিস্ট ও ২৫ মিনিটের Pomodoro ফোকাস টাইমার ব্যবহার করুন। ভল্টে NID, পাসপোর্ট, ব্যাংক ও Wi-Fi তথ্য লুকিয়ে সেভ রাখুন।',
            descEn:
              'Stay focused with task checklists and a built-in Pomodoro timer. Keep masked NID, passport, bank & Wi-Fi credentials inside Pocket Vault.',
          },
          {
            headBn: '২. ডিজিটাল QR কার্ড ও বিজনেস ইনভয়েস PDF',
            headEn: '2. Digital QR Card & Business Invoice PDF',
            descBn:
              'বিকাশ/নগদ পেমেন্ট, Wi-Fi বা বিজনেস কন্টাক্ট QR কার্ড PNG বানান। ইনভয়েস মেকারে আইটেম, ডিসকাউন্ট, ভ্যাট ও PAID/DUE ব্যাজ দিয়ে A4 PDF ডাউনলোড করুন।',
            descEn:
              'Create shareable Payment/Wi-Fi/vCard QR PNGs, and generate crisp A4 Business Invoices & Quotations with VAT, discounts & status badges.',
          },
          {
            headBn: '৩. কারেন্সি কনভার্টার, MFS চার্জ ও বিল স্প্লিট',
            headEn: '3. Live FX, MFS Cash-Out Fees & Bill Splitter',
            descBn:
              '২০+ মুদ্রার লাইভ কনভার্সন, বিকাশ/নগদ/রকেট/উপায় ক্যাশআউট চার্জ, মাসিক বিল রিমাইন্ডার ও ট্যুর/মেসের খরচ ভাগ করার অটো হিসাব।',
            descEn:
              'Convert 20+ currencies live, calculate bKash/Nagad/Rocket cash-out fees, manage monthly bills, and settle group trip/mess expenses fairly.',
          },
          {
            headBn: '৪. EMI/DPS/যাকাত ক্যালকুলেটর, রসিদ ও নোটস',
            headEn: '4. EMI/DPS/Zakat Calculators, Receipt & Notes',
            descBn:
              'লোন কিস্তি, DPS মেয়াদান্তে মুনাফা, ২.৫% যাকাত ও ডিসকাউন্ট হিসাব, দোকানের কুইক রসিদ ও জরুরি নোটস সংরক্ষণ।',
            descEn:
              'Run loan EMI, DPS maturity, Zakat (2.5%) & discount math, generate quick shop receipts, and pin important notes.',
          },
        ],
      },
      {
        id: 'ch_customize',
        num: '04',
        titleBn: 'থিম স্টুডিও, নিরাপত্তা, রিপোর্ট ও ব্যাকআপ',
        titleEn: 'Theme Studio, Security, Reports & Backup',
        summaryBn: '৭টি প্রিসেট থিম, ৪-সংখ্যার পিন লক, মাসিক PDF/Excel রিপোর্ট ও JSON ব্যাকআপ।',
        summaryEn: '7 theme presets, 4-digit PIN lock, monthly PDF/Excel exports & offline backup.',
        icon: <ShieldCheck className="w-4 h-4 ct-accent-text" />,
        steps: [
          {
            headBn: '১. থিম স্টুডিও (Theme Studio)',
            headEn: '1. Theme Studio Visual Customization',
            descBn:
              'লাইট, ডার্ক ও OLED AMOLED মোডের সাথে ৭টি কালার প্রিসেট, গ্লাস/বর্ডার কার্ড স্টাইল, ফন্ট ও কমপ্যাক্ট/কম্ফর্টেবল ডেনসিটি পরিবর্তন করুন।',
            descEn:
              'Switch between Light, Dark, and OLED AMOLED surfaces with 7 color presets, card finishes, font pairings, and UI density.',
          },
          {
            headBn: '২. প্রাইভেসি আই ও ৪-ডিজিট PIN লক',
            headEn: '2. Balance Masking & 4-Digit PIN Lock',
            descBn:
              'উপরের Eye আইকনে ট্যাপ করে আশেপাশের মানুষ থেকে টাকার অঙ্ক লুকান। সেটিংস থেকে ৪-সংখ্যার PIN চালু করে অ্যাপ লক রাখুন।',
            descEn:
              'Tap the header Eye button to mask sensitive balances in public, and activate 4-digit PIN Lock in Settings.',
          },
          {
            headBn: '৩. PDF, Excel, সামারি কার্ড ও JSON ব্যাকআপ',
            headEn: '3. PDF, Excel, Summary PNG & JSON Backup',
            descBn:
              'রিপোর্ট ট্যাব থেকে মাসিক A4 PDF স্টেটমেন্ট, Excel (.xls), CSV এবং শেয়ারযোগ্য PNG কার্ড ডাউনলোড করুন। সেটিংস থেকে সম্পূর্ণ JSON ব্যাকআপ নিন।',
            descEn:
              'Export monthly A4 PDFs, Excel (.xls), CSV spreadsheets, and social summary PNGs in Reports, or export full offline JSON backups in Settings.',
          },
        ],
      },
    ],
    []
  );

  const posters: PosterPreset[] = useMemo(
    () => [
      {
        id: 'poster_hero',
        slug: 'CashTrace_Hero_Launch_Poster',
        imageSrc: heroPosterImg,
        aspect: '3:4',
        formatLabelBn: '৩:৪ ভার্টিকাল সোশ্যাল পোস্টার',
        formatLabelEn: '3:4 Vertical Social Poster',
        kickerBn: 'স্মার্ট ফিন্যান্স ও পকেট হাব',
        kickerEn: 'SMART FINANCE & POCKET HUB',
        headlineBn: 'সব হিসাব ও প্রয়োজনীয় টুলস—এক পকেটেই।',
        headlineEn: 'Every Taka, Wallet & Daily Tool in One Pocket.',
        sublineBn: '৩ডি ওয়ালেট, বাকি হিসাব, লাইভ কারেন্সি ও ১১টি স্মার্ট টুলস।',
        sublineEn: '3D Wallets, Debt Ledger, Live FX & 11 Daily Utilities.',
        ctaBn: 'আজই ফ্রি ব্যবহার করুন',
        ctaEn: 'Start Free on Web & App',
        alt: 'CashTrace hero smartphone finance dashboard studio poster',
      },
      {
        id: 'poster_wallets',
        slug: 'CashTrace_3D_Wallets_FX_Square',
        imageSrc: walletsFeatureImg,
        aspect: '1:1',
        formatLabelBn: '১:১ স্কয়ার ফেসবুক / ইনস্টাগ্রাম পোস্ট',
        formatLabelEn: '1:1 Square Social Post',
        kickerBn: '৩ডি ওয়ালেট ও লাইভ FX',
        kickerEn: '3D WALLETS · LIVE FX ENGINE',
        headlineBn: 'নগদ, ব্যাংক, বিকাশ — রিয়েল-টাইম সব কারেন্সিতে।',
        headlineEn: 'Cash, Cards & Global FX Rates Updated Live.',
        sublineBn: '২০+ আন্তর্জাতিক মুদ্রা, ফ্লিপেবল কার্ড ও হোয়াটসঅ্যাপ বাকি রিমাইন্ডার।',
        sublineEn: 'Convert balances across 20+ currencies with 1-click WhatsApp reminders.',
        ctaBn: 'আপনার ওয়ালেট সাজান',
        ctaEn: 'Try Live Currency Engine',
        alt: 'CashTrace matte metallic payment cards and global currency smartphone',
      },
      {
        id: 'poster_business',
        slug: 'CashTrace_Business_Invoice_Banner',
        imageSrc: businessBannerImg,
        aspect: '16:9',
        formatLabelBn: '১৬:৯ কভার / লিংকডইন / ইউটিউব ব্যানার',
        formatLabelEn: '16:9 Widescreen Cover Banner',
        kickerBn: 'ব্যবসা ও ফ্রিল্যান্সার কমান্ড',
        kickerEn: 'BUSINESS & FREELANCE SUITE',
        headlineBn: 'ব্যবসায়িক হিসাব, ইনভয়েস PDF ও QR কার্ড এক অ্যাপেই।',
        headlineEn: 'Separate Business Books, A4 Invoices & Digital QR Cards.',
        sublineBn: 'মাল্টি-প্রোফাইল ওয়ার্কস্পেস · ভ্যাট/ডিসকাউন্ট সহ প্রফেশনাল বিল তৈরি করুন।',
        sublineEn: 'Isolated business workspaces with instant PDF quotations & payment QR.',
        ctaBn: 'ইনভয়েস তৈরি করুন',
        ctaEn: 'Launch Business Hub',
        alt: 'CashTrace business workspace laptop, smartphone and invoice stationery',
      },
      {
        id: 'poster_pocket',
        slug: 'CashTrace_Pocket_Essentials_Story',
        imageSrc: pocketHubImg,
        aspect: '3:4',
        formatLabelBn: '৩:৪ পকেট এসেনশিয়ালস স্টোরি / পোস্টার',
        formatLabelEn: '3:4 Pocket Essentials Poster',
        kickerBn: '১১টি দৈনিক পকেট টুলস',
        kickerEn: 'ALL-IN-ONE POCKET UTILITY',
        headlineBn: 'কাজের প্ল্যানার, সুরক্ষিত ভল্ট ও দৈনিক হিসাব একসাথে।',
        headlineEn: 'Daily Planner, Encrypted Vault & Calculators in Your Pocket.',
        sublineBn: 'পমোডোরো টাইমার · NID/পাসপোর্ট ভল্ট · MFS চার্জ · EMI ও যাকাত ক্যালকুলেটর।',
        sublineEn: 'Pomodoro Timer · Secure Vault · MFS Fees · EMI, DPS & Zakat Math.',
        ctaBn: 'পকেট হাব এক্সপ্লোর করুন',
        ctaEn: 'Explore 11 Pocket Tools',
        alt: 'CashTrace pocket essentials leather cardholder and daily planner phone',
      },
    ],
    []
  );

  const socialCaptions = useMemo(
    () => [
      {
        id: 'cap_fb',
        labelBn: 'ফেসবুক / লিংকডইন লঞ্চ পোস্ট',
        labelEn: 'Facebook / LinkedIn Launch Post',
        textBn: `প্রতিদিনের আয়-ব্যয়, ৩ডি ওয়ালেট, বাকি খাতা আর ১১টি দরকারি পকেট টুলস—সব এখন এক অ্যাপেই!\n\n✅ এক লাইনেই দ্রুত এন্ট্রি ("বিকাশ ৫০০ বাজার")\n✅ ব্যক্তিগত ও ব্যবসার আলাদা প্রোফাইল + লাইভ কারেন্সি কনভার্টার\n✅ ১ ক্লিকে হোয়াটসঅ্যাপ পাওনা রিমাইন্ডার ও A4 বিজনেস ইনভয়েস PDF\n✅ দৈনিক কাজ-প্ল্যানার, সুরক্ষিত পকেট ভল্ট, বিকাশ/নগদ চার্জ ও যাকাত/EMI ক্যালকুলেটর\n✅ অফলাইনেও কাজ করে + গুগল ক্লাউড সিঙ্ক ও ৪-ডিজিট PIN লক\n\nএখনই ব্যবহার করুন: ${customAppUrl}`,
        textEn: `Track every transaction, manage 3D wallets, settle group/personal debts, and unlock 11 everyday pocket tools — all in one fast, offline-ready app.\n\n• One-line smart quick entry & Ctrl+K Spotlight command search\n• Isolated Personal & Business workspaces with Live Currency FX Engine\n• 1-click WhatsApp debt reminders & A4 Business Invoice PDF maker\n• Daily Planner + Pomodoro Timer, Encrypted Pocket Vault & Payment QR Cards\n• Works completely offline with optional real-time Google Cloud Sync\n\nLaunch CashTrace: ${customAppUrl}`,
      },
      {
        id: 'cap_wa',
        labelBn: 'হোয়াটসঅ্যাপ / মেসেঞ্জার শেয়ার মেসেজ',
        labelEn: 'WhatsApp / Quick Referral Message',
        textBn: `দৈনিক খরচ, বাকি হিসাব, বাজারের তালিকা, ইনভয়েস আর টাকার হিসাবের জন্য দারুণ একটি অ্যাপ ব্যবহার করছি — CashTrace!\nঅফলাইনে চলে, একদম ফ্রি এবং বাংলা/ইংরেজি দুটোতেই ব্যবহার করা যায়।\n\nএখানে দেখে নিন: ${customAppUrl}`,
        textEn: `Check out CashTrace — a fast, clean personal finance & pocket utility app with 3D wallets, live FX currency conversion, A4 invoice maker, daily planner & offline JSON backup.\n\nTry it here: ${customAppUrl}`,
      },
    ],
    [customAppUrl]
  );

  if (!isOpen) return null;

  const filteredChapters = guideSearch.trim()
    ? chapters.filter((ch) => {
        const hay = `${ch.titleBn} ${ch.titleEn} ${ch.summaryBn} ${ch.summaryEn} ${ch.steps
          .map((s) => `${s.headBn} ${s.headEn} ${s.descBn} ${s.descEn}`)
          .join(' ')}`.toLowerCase();
        return hay.includes(guideSearch.trim().toLowerCase());
      })
    : chapters;

  const handleDownloadGuidePDF = async () => {
    setBusyId('guide_pdf');
    try {
      const mode = await exportUserGuidePDF(language, accentColor, customAppUrl);
      onShowToast(
        mode === 'shared'
          ? t('ব্যবহার নির্দেশিকা PDF শেয়ার/সেভের জন্য প্রস্তুত', 'User Guide PDF ready to share/save', language)
          : t('CashTrace ব্যবহার নির্দেশিকা PDF ডাউনলোড হয়েছে', 'User Guide PDF downloaded', language)
      );
    } catch {
      onShowToast(t('PDF তৈরি করতে সমস্যা হয়েছে', 'Failed to export User Guide PDF', language));
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadBrandedPoster = async (p: PosterPreset) => {
    setBusyId(`branded_${p.id}`);
    try {
      const mode = await exportBrandedMarketingPoster({
        imageSrc: p.imageSrc,
        aspect: p.aspect,
        kicker: language === 'bn' ? p.kickerBn : p.kickerEn,
        headline: language === 'bn' ? p.headlineBn : p.headlineEn,
        subline: language === 'bn' ? p.sublineBn : p.sublineEn,
        ctaLabel: language === 'bn' ? p.ctaBn : p.ctaEn,
        footerUrl: customAppUrl,
        accentColor,
        fileSlug: p.slug,
        language,
      });
      onShowToast(
        mode === 'shared'
          ? t('ব্র্যান্ডেড পোস্টার শেয়ার/সেভের জন্য প্রস্তুত', 'Branded poster ready to share/save', language)
          : t('ব্র্যান্ডেড পোস্টার PNG ডাউনলোড হয়েছে', 'Branded poster PNG downloaded', language)
      );
    } catch {
      onShowToast(t('পোস্টার এক্সপোর্ট করা যায়নি', 'Failed to generate branded poster', language));
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadCleanPhoto = async (p: PosterPreset) => {
    setBusyId(`clean_${p.id}`);
    try {
      const res = await fetch(p.imageSrc);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `${p.slug}_Clean.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      onShowToast(t('ক্লিন স্টুডিও ছবি ডাউনলোড হয়েছে', 'Clean studio asset downloaded', language));
    } catch {
      onShowToast(t('ছবি ডাউনলোড করতে সমস্যা হয়েছে', 'Failed to download photo', language));
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
      onShowToast(t('ক্লিপবোর্ডে কপি হয়েছে ✓', 'Copied to clipboard ✓', language));
    } catch {
      onShowToast(t('কপি করা যায়নি', 'Copy failed', language));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[92vh] ct-surface-card border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl ct-accent-soft flex items-center justify-center shrink-0">
              {activeView === 'guide' ? (
                <BookOpen className="w-5 h-5 ct-accent-text" />
              ) : (
                <Megaphone className="w-5 h-5 ct-accent-text" />
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {t('CashTrace ব্যবহার নির্দেশিকা ও মার্কেটিং কিট', 'CashTrace User Guide & Marketing Kit', language)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'সম্পূর্ণ ৪-পৃষ্ঠার গাইড PDF ডাউনলোড ও সোশ্যাল পোস্টার তৈরি করুন',
                  'Download the 4-page User Manual PDF & export ready-to-share posters',
                  language
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl ct-surface-alt text-slate-500 hover:text-slate-800 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Mode Switcher */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/60 dark:bg-slate-900/40">
          <div className="inline-flex p-1 rounded-xl ct-surface-alt border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveView('guide')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                activeView === 'guide'
                  ? 'ct-accent-bg shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t('ব্যবহার নির্দেশিকা (গাইড)', 'User Guide Manual', language)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('marketing')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                activeView === 'marketing'
                  ? 'ct-accent-bg shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{t('মার্কেটিং পোস্টার ও কিট', 'Marketing Posters & Kit', language)}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={busyId === 'guide_pdf'}
            onClick={() => void handleDownloadGuidePDF()}
            className="px-4 py-2 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>
              {busyId === 'guide_pdf'
                ? t('PDF তৈরি হচ্ছে...', 'Building PDF...', language)
                : t('৪-পৃষ্ঠার গাইড PDF ডাউনলোড', 'Download 4-Page Guide PDF', language)}
            </span>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeView === 'guide' ? (
            <>
              {/* Quick Search inside Guide + Shortcut summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 flex items-center gap-2.5 ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    placeholder={t(
                      'যেকোনো ফিচার খুঁজুন (যেমন: ওয়ালেট, WhatsApp, ভল্ট, ইনভয়েস)...',
                      'Filter guide topics (e.g. wallet, invoice, vault, sync)...',
                      language
                    )}
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                  />
                </div>
                <div className="ct-surface-alt border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {t('কুইক সার্চ শর্টকাট', 'Quick Command', language)}
                    </p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      Ctrl + K / ⌘K
                    </p>
                  </div>
                  <Sparkles className="w-4 h-4 ct-accent-text shrink-0" />
                </div>
              </div>

              {/* Chapters Accordion */}
              <div className="space-y-3">
                {filteredChapters.map((ch) => {
                  const isOpenCh = openChapterId === ch.id || Boolean(guideSearch.trim());
                  return (
                    <div
                      key={ch.id}
                      className="ct-surface-alt border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenChapterId(isOpenCh && !guideSearch.trim() ? '' : ch.id)}
                        className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-8 h-8 rounded-lg ct-accent-bg text-xs font-bold font-mono flex items-center justify-center shrink-0">
                            {ch.num}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {ch.icon}
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {language === 'bn' ? ch.titleBn : ch.titleEn}
                              </h3>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {language === 'bn' ? ch.summaryBn : ch.summaryEn}
                            </p>
                          </div>
                        </div>
                        {isOpenCh ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {isOpenCh && (
                        <div className="px-4 sm:px-5 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200/70 dark:border-slate-800">
                          {ch.steps.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
                            >
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {language === 'bn' ? st.headBn : st.headEn}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {language === 'bn' ? st.descBn : st.descEn}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Editable App URL for Poster Footer */}
              <div className="ct-surface-alt border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('পোস্টার ও ক্যাপশনে দেখানোর জন্য অ্যাপ লিংক', 'App Link Embedded on Posters & Captions', language)}
                  </label>
                  <input
                    type="url"
                    value={customAppUrl}
                    onChange={(e) => setCustomAppUrl(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText('app_url', customAppUrl)}
                  className="px-3.5 py-2.5 ct-btn-radius bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
                >
                  {copiedKey === 'app_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{t('লিংক কপি', 'Copy URL', language)}</span>
                </button>
              </div>

              {/* Poster Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {posters.map((p) => {
                  const isWide = p.aspect === '16:9';
                  return (
                    <div
                      key={p.id}
                      className={`ct-surface-alt border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col ${
                        isWide ? 'md:col-span-2' : ''
                      }`}
                    >
                      <div className="relative bg-slate-900 overflow-hidden aspect-[4/3] max-h-72 flex items-center justify-center">
                        {!brokenImages[p.id] ? (
                          <img
                            src={p.imageSrc}
                            alt={p.alt}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages((prev) => ({...prev, [p.id]: true}))}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            {p.alt}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent flex flex-col justify-between p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-1 rounded-md bg-slate-950/75 text-white text-[10px] font-bold tracking-wider uppercase backdrop-blur-sm">
                              CashTrace · {p.aspect}
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-white/15 text-white text-[10px] font-semibold backdrop-blur-sm">
                              {language === 'bn' ? p.formatLabelBn : p.formatLabelEn}
                            </span>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                              {language === 'bn' ? p.kickerBn : p.kickerEn}
                            </p>
                            <h4 className="text-sm sm:text-base font-bold text-white leading-snug mt-0.5">
                              {language === 'bn' ? p.headlineBn : p.headlineEn}
                            </h4>
                            <p className="text-xs text-slate-300 line-clamp-1 mt-0.5">
                              {language === 'bn' ? p.sublineBn : p.sublineEn}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900">
                        <button
                          type="button"
                          disabled={busyId === `branded_${p.id}`}
                          onClick={() => void handleDownloadBrandedPoster(p)}
                          className="flex-1 px-3 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>
                            {busyId === `branded_${p.id}`
                              ? t('তৈরি হচ্ছে...', 'Rendering...', language)
                              : t('ব্র্যান্ডেড পোস্টার PNG', 'Branded Poster PNG', language)}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `clean_${p.id}`}
                          onClick={() => void handleDownloadCleanPhoto(p)}
                          className="px-3 py-2.5 ct-btn-radius ct-surface-alt border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{t('ক্লিন ছবি', 'Clean Image', language)}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ready-to-Post Social Captions */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('কপি-রেডি মার্কেটিং ক্যাপশন', 'Ready-to-Post Promotional Captions', language)}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {socialCaptions.map((cap) => {
                    const text = language === 'bn' ? cap.textBn : cap.textEn;
                    return (
                      <div
                        key={cap.id}
                        className="ct-surface-alt border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              {language === 'bn' ? cap.labelBn : cap.labelEn}
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleCopyText(cap.id, text)}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                            >
                              {copiedKey === cap.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{t('কপি', 'Copy', language)}</span>
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 max-h-44 overflow-y-auto">
                            {text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
