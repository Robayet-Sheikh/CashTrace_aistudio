export type LanguageCode = 'bn' | 'en';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type AppTab = 'dashboard' | 'reports' | 'wallets' | 'shopping' | 'savings' | 'settings';

export interface WalletAccount {
  id: string;
  name: string;
  type: 'cash' | 'mobile' | 'bank';
  initialBalance: number;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  category: string;
  subcategory?: string;
  date: string; // YYYY-MM-DD (local date)
  walletId: string;
  toWalletId?: string; // only for transfers
  createdAt: number;
}

export interface MonthStore {
  budgetCap: number;
  transactions: Transaction[];
}

export interface CategoryItem {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
}

export interface SmartMemoryItem {
  id: string;
  title: string;
  amount: number;
  category: string;
  walletId: string;
}

export interface QuickTemplate {
  id: string;
  title: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  walletId: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  target: number;
  saved: number;
  createdAt: number;
}

export interface DebtRecord {
  id: string;
  personName: string;
  type: 'lent' | 'borrowed'; // lent = পাওনা (আমি দিয়েছি), borrowed = দেনা (আমি নিয়েছি)
  amount: number;
  paidAmount: number;
  date: string;
  dueDate?: string;
  note?: string;
  walletId?: string;
  settled: boolean;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  estimatedPrice?: number;
  checked: boolean;
  createdAt: number;
}

export interface ShoppingList {
  id: string;
  title: string;
  items: ShoppingItem[];
  createdAt: number;
}

export interface UserProfile {
  name: string;
  currency: string;
  pin: string;
  pinLock: boolean;
  darkMode: boolean;
  hideBalance: boolean;
  language: LanguageCode;
}

export interface ProfileMeta {
  id: string; // 'default' or 'prof_...'
  name: string;
  currency: string;
  color: string;
  createdAt: number;
}

export interface CashTraceState {
  version: number;
  profile: UserProfile;
  wallets: WalletAccount[];
  months: Record<string, MonthStore>;
  categories: CategoryItem[];
  smartMemory: SmartMemoryItem[];
  quickTemplates: QuickTemplate[];
  savingsGoals: SavingsGoal[];
  debts: DebtRecord[];
  shoppingLists: ShoppingList[];
  lastBackupAt?: string;
}

