import {CategoryItem, TransactionType, WalletAccount} from '../types';
import {parseLocaleNumber} from './formatters';

export interface ParsedQuickEntry {
  valid: boolean;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  walletId: string;
}

const INCOME_HINTS = [
  'বেতন',
  'salary',
  'আয়',
  'আয়',
  'income',
  'বোনাস',
  'bonus',
  'টিউশনি',
  'tuition',
  'ফ্রিল্যান্স',
  'freelance',
  'উপহার',
  'gift',
  'লাভ',
  'profit',
  'পেলাম',
  'পাইছি',
  'received',
  'pocket money',
  'পকেট মানি',
];

const CATEGORY_KEYWORDS: Array<{keywords: string[]; categoryMatch: string; type: TransactionType}> = [
  {keywords: ['বাজার', 'সবজি', 'মাছ', 'মাংস', 'চাল', 'ডাল', 'তেল', 'ডিম', 'bazar', 'grocery'], categoryMatch: 'কাঁচা বাজার', type: 'expense'},
  {keywords: ['চা', 'নাস্তা', 'খাবার', 'লাঞ্চ', 'ডিনার', 'কফি', 'বিরিয়ানি', 'ভাত', 'lunch', 'dinner', 'food', 'tea', 'coffee'], categoryMatch: 'খাবার ও নাস্তা', type: 'expense'},
  {keywords: ['রিকশা', 'বাস', 'উবার', 'পাঠাও', 'সিএনজি', 'অটো', 'ভাড়া', 'গাড়ি', 'টিকিট', 'uber', 'bus', 'rickshaw', 'ride', 'fuel', 'তেল'], categoryMatch: 'যাতায়াত', type: 'expense'},
  {keywords: ['ভাড়া', 'বাসা', 'বিদ্যুৎ', 'গ্যাস', 'পানি', 'ইন্টারনেট', 'ওয়াইফাই', 'wifi', 'rent', 'bill', 'নেট'], categoryMatch: 'বাসা ভাড়া ও বিল', type: 'expense'},
  {keywords: ['বই', 'খাতা', 'কলম', 'পড়া', 'ফর্ম', 'ভর্তি', 'কোর্স', 'book', 'pen', 'study', 'exam'], categoryMatch: 'পড়াশোনা ও বই', type: 'expense'},
  {keywords: ['ওষুধ', 'ডাক্তার', 'হাসপাতাল', 'টেস্ট', 'মেডিসিন', 'medicine', 'doctor', 'health'], categoryMatch: 'চিকিৎসা ও ওষুধ', type: 'expense'},
  {keywords: ['জামা', 'কাপড়', 'জুতা', 'শার্ট', 'প্যান্ট', 'শপিং', 'কেনাকাটা', 'shirt', 'shopping', 'cloth'], categoryMatch: 'জামাকাপড়', type: 'expense'},
  {keywords: ['রিচার্জ', 'ফ্লেক্সি', 'সিনেমা', 'মুভি', 'গেম', 'নেটফ্লিক্স', 'recharge', 'mb', 'internet'], categoryMatch: 'বিনোদন ও রিচার্জ', type: 'expense'},
  {keywords: ['বেতন', 'salary', 'মাইনে'], categoryMatch: 'মাসিক বেতন', type: 'income'},
  {keywords: ['টিউশনি', 'কোচিং', 'tuition'], categoryMatch: 'টিউশনি', type: 'income'},
  {keywords: ['ফ্রিল্যান্স', 'প্রজেক্ট', 'freelance', 'client'], categoryMatch: 'ফ্রিল্যান্সিং', type: 'income'},
  {keywords: ['অভিভাবক', 'বাবা', 'মা', 'পকেট মানি'], categoryMatch: 'অভিভাবক', type: 'income'},
  {keywords: ['বোনাস', 'উপহার', 'গিফট', 'bonus', 'gift'], categoryMatch: 'উপহার', type: 'income'},
];

const BENGALI_NUM_RE = /[০-৯0-9]+(?:[.,][০-৯0-9]+)?/;

export function parseSmartQuickEntry(
  rawInput: string,
  wallets: WalletAccount[],
  categories: CategoryItem[]
): ParsedQuickEntry {
  const input = rawInput.trim();
  const defaultWallet = wallets[0]?.id || 'cash';
  const defaultExpenseCat =
    categories.find((c) => c.type === 'expense')?.name || '💡 অন্যান্য খরচ';
  const defaultIncomeCat =
    categories.find((c) => c.type === 'income')?.name || '🪙 অন্যান্য আয়';

  if (!input) {
    return {
      valid: false,
      title: '',
      amount: 0,
      type: 'expense',
      category: defaultExpenseCat,
      walletId: defaultWallet,
    };
  }

  // 1. Extract numeric amount
  const numMatch = input.match(BENGALI_NUM_RE);
  const amount = numMatch ? parseLocaleNumber(numMatch[0]) : 0;

  // 2. Clean remaining words to identify wallet & title
  let workingText = input;
  if (numMatch) {
    workingText = workingText.replace(numMatch[0], ' ');
  }
  const lower = workingText.toLowerCase();

  // 3. Match wallet by name or common Bengali/English keywords
  let walletId = defaultWallet;
  const matchedWallet = wallets.find((w) => {
    const wn = w.name.toLowerCase();
    const firstToken = wn.split(/[\s(/]+/)[0];
    if (firstToken && firstToken.length >= 2 && lower.includes(firstToken)) return true;
    if (w.type === 'mobile' && /(বিকাশ|নগদ|রকেট|উপায়|bkash|nagad|rocket|upay)/.test(lower)) return true;
    if (w.type === 'bank' && /(ব্যাংক|কার্ড|bank|card|atm)/.test(lower)) return true;
    if (w.type === 'cash' && /(নগদ টাকা|হাতে নগদ|ক্যাশ|cash)/.test(lower)) return true;
    return false;
  });
  if (matchedWallet) {
    walletId = matchedWallet.id;
  }

  // Strip standalone wallet hint tokens from title if present
  let cleanedTitle = workingText
    .replace(/\b(bkash|nagad|rocket|upay|cash|bank|card)\b/gi, ' ')
    .replace(/(বিকাশ|রকেট|উপায়|ব্যাংক|কার্ড|টাকা|৳)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Detect income vs expense
  let detectedType: 'income' | 'expense' = INCOME_HINTS.some((kw) => lower.includes(kw))
    ? 'income'
    : 'expense';

  // 5. Detect best category
  let detectedCat = detectedType === 'income' ? defaultIncomeCat : defaultExpenseCat;
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      const cat = categories.find(
        (c) => c.type === rule.type && c.name.toLowerCase().includes(rule.categoryMatch.toLowerCase())
      );
      if (cat) {
        detectedCat = cat.name;
        detectedType = rule.type as 'income' | 'expense';
        break;
      }
    }
  }

  if (!cleanedTitle) {
    cleanedTitle = detectedCat.replace(/^[^\p{L}\p{N}]+/u, '').trim() || (detectedType === 'income' ? 'আয়' : 'খরচ');
  }

  return {
    valid: Number.isFinite(amount) && amount > 0 && cleanedTitle.length > 0,
    title: cleanedTitle,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    type: detectedType,
    category: detectedCat,
    walletId,
  };
}
