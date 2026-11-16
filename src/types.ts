export type LanguageCode = 'bn' | 'en';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type AppTab =
  | 'dashboard'
  | 'reports'
  | 'wallets'
  | 'shopping'
  | 'savings'
  | 'tools'
  | 'settings';

export type SurfaceMode = 'light' | 'warm' | 'dark' | 'amoled';
export type CardStyle = 'gradient' | 'glass' | 'minimal';
export type CornerRadius = 'rounded' | 'sharp';
export type LayoutDensity = 'cozy' | 'compact';
export type FontScale = 'sm' | 'md' | 'lg';

export interface ThemeConfig {
  surface: SurfaceMode;
  accentColor: string;
  cardStyle: CardStyle;
  radius: CornerRadius;
  density: LayoutDensity;
  fontScale: FontScale;
}

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

export interface CategoryBudget {
  id: string;
  category: string;
  limit: number;
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

export interface RecurringBill {
  id: string;
  title: string;
  amount: number;
  category: string;
  walletId: string;
  dueDay: number; // 1-31
  paidMonths: string[]; // YYYY-MM
  createdAt: number;
}

export interface FinancialNote {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: number;
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

export interface DailyTask {
  id: string;
  title: string;
  done: boolean;
  priority: 'normal' | 'high';
  dueTime?: string;
  dailyRoutine?: boolean;
  createdAt: number;
}

export type VaultCategory = 'bank' | 'id' | 'card' | 'wifi' | 'warranty' | 'other';

export interface VaultItem {
  id: string;
  label: string;
  category: VaultCategory;
  value: string;
  note?: string;
  expiryDate?: string; // YYYY-MM-DD (optional warranty/card expiry)
  updatedAt: number;
}

export interface UserProfile {
  name: string;
  currency: string;
  baseCurrency?: string;
  pin: string;
  pinLock: boolean;
  darkMode: boolean;
  hideBalance: boolean;
  language: LanguageCode;
  themeConfig?: ThemeConfig;
}

export interface ProfileMeta {
  id: string; // 'default' or 'prof_...'
  name: string;
  currency: string;
  baseCurrency?: string;
  color: string;
  createdAt: number;
}

export interface CashTraceState {
  version: number;
  profile: UserProfile;
  wallets: WalletAccount[];
  months: Record<string, MonthStore>;
  categories: CategoryItem[];
  categoryBudgets: CategoryBudget[];
  smartMemory: SmartMemoryItem[];
  quickTemplates: QuickTemplate[];
  recurringBills: RecurringBill[];
  financialNotes: FinancialNote[];
  dailyTasks: DailyTask[];
  vaultItems: VaultItem[];
  savingsGoals: SavingsGoal[];
  debts: DebtRecord[];
  shoppingLists: ShoppingList[];
  lastBackupAt?: string;
}
