import {User} from 'firebase/auth';
import {
  collection,
  CollectionReference,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {db, handleFirestoreError, OperationType} from '../firebase';
import {
  CashTraceState,
  CategoryBudget,
  CategoryItem,
  DailyTask,
  DebtRecord,
  FinancialNote,
  MonthStore,
  ProfileMeta,
  QuickTemplate,
  RecurringBill,
  SavingsGoal,
  ShoppingItem,
  ShoppingList,
  SmartMemoryItem,
  ThemeConfig,
  Transaction,
  UserProfile,
  VaultCategory,
  VaultItem,
  WalletAccount,
} from '../types';
import {getLocalDateStr, getLocalMonthKey} from '../utils/formatters';
import {
  createInitialState,
  DEFAULT_CATEGORIES,
  DEFAULT_PROFILE_ID,
  DEFAULT_QUICK_TEMPLATES,
  DEFAULT_WALLETS,
  PROFILE_COLORS,
} from '../utils/storage';
import {DEFAULT_THEME_CONFIG, resolveEffectiveThemeConfig} from '../utils/themeEngine';

// Limits aligned verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  MONTH_REGEX: /^[0-9]{4}-[0-9]{2}$/,
  DATE_REGEX: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  COLOR_REGEX: /^#[0-9a-fA-F]{3,8}$/,
  PIN_REGEX: /^[0-9]{4}$/,
  MAX_ID: 128,
  MAX_EMAIL: 200,
  MAX_NAME: 80,
  MAX_CURRENCY: 10,
  MAX_TITLE: 120,
  MAX_TX_TITLE: 160,
  MAX_SUBCATEGORY: 120,
  MAX_CATEGORY: 80,
  MAX_PERSON_NAME: 100,
  MAX_NOTE: 300,
  MAX_ITEM_NAME: 140,
  MAX_QUANTITY: 60,
  MAX_NUM: 1000000000,
};

export function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, BLUEPRINT_LIMITS.MAX_ID);
  if (cleaned.length > 0 && BLUEPRINT_LIMITS.ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

function clampStr(raw: unknown, maxLen: number, fallback = ''): string {
  const str = String(raw ?? '').trim().slice(0, maxLen);
  return str.length > 0 ? str : fallback;
}

function clampNum(raw: unknown, min: number, max = BLUEPRINT_LIMITS.MAX_NUM, fallback = 0): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeColor(raw: unknown, fallback = '#059669'): string {
  const str = String(raw ?? '').trim();
  return BLUEPRINT_LIMITS.COLOR_REGEX.test(str) ? str : fallback;
}

function sanitizeDateStr(raw: unknown): string {
  const str = String(raw ?? '').trim();
  return BLUEPRINT_LIMITS.DATE_REGEX.test(str) ? str : getLocalDateStr();
}

function sanitizeOptionalDateStr(raw: unknown): string | undefined {
  const str = String(raw ?? '').trim();
  if (!str) return undefined;
  return BLUEPRINT_LIMITS.DATE_REGEX.test(str) ? str : undefined;
}

function sanitizeMonthKey(raw: unknown): string {
  const str = String(raw ?? '').trim();
  return BLUEPRINT_LIMITS.MONTH_REGEX.test(str) ? str : getLocalMonthKey();
}

function sanitizePin(raw: unknown): string {
  const str = String(raw ?? '').trim();
  return BLUEPRINT_LIMITS.PIN_REGEX.test(str) ? str : '';
}

function isDefaultProfile(profileId: string): boolean {
  return !profileId || profileId === DEFAULT_PROFILE_ID;
}

function workspacePrefix(uid: string, profileId: string): string {
  return isDefaultProfile(profileId)
    ? `users/${uid}`
    : `users/${uid}/profiles/${sanitizeId(profileId, 'prof')}`;
}

function wsDocRef(uid: string, profileId: string): DocumentReference<DocumentData> {
  if (isDefaultProfile(profileId)) {
    return doc(db, 'users', uid);
  }
  return doc(db, 'users', uid, 'profiles', sanitizeId(profileId, 'prof'));
}

function wsCol(uid: string, profileId: string, subcol: string): CollectionReference<DocumentData> {
  if (isDefaultProfile(profileId)) {
    return collection(db, 'users', uid, subcol);
  }
  return collection(db, 'users', uid, 'profiles', sanitizeId(profileId, 'prof'), subcol);
}

function wsDoc(
  uid: string,
  profileId: string,
  subcol: string,
  itemId: string
): DocumentReference<DocumentData> {
  if (isDefaultProfile(profileId)) {
    return doc(db, 'users', uid, subcol, itemId);
  }
  return doc(db, 'users', uid, 'profiles', sanitizeId(profileId, 'prof'), subcol, itemId);
}

function wsListItemCol(
  uid: string,
  profileId: string,
  listId: string
): CollectionReference<DocumentData> {
  if (isDefaultProfile(profileId)) {
    return collection(db, 'users', uid, 'shoppingLists', listId, 'items');
  }
  return collection(
    db,
    'users',
    uid,
    'profiles',
    sanitizeId(profileId, 'prof'),
    'shoppingLists',
    listId,
    'items'
  );
}

function wsListItemDoc(
  uid: string,
  profileId: string,
  listId: string,
  itemId: string
): DocumentReference<DocumentData> {
  if (isDefaultProfile(profileId)) {
    return doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId);
  }
  return doc(
    db,
    'users',
    uid,
    'profiles',
    sanitizeId(profileId, 'prof'),
    'shoppingLists',
    listId,
    'items',
    itemId
  );
}

function buildThemeConfigPayload(themeConfig?: Partial<ThemeConfig>, darkMode = false): ThemeConfig {
  return resolveEffectiveThemeConfig(themeConfig, darkMode);
}

function buildProfilePayload(uid: string, email: string, profile: UserProfile) {
  const pin = sanitizePin(profile.pin);
  const currency = clampStr(profile.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳');
  const baseCurrency = clampStr(profile.baseCurrency || currency, BLUEPRINT_LIMITS.MAX_CURRENCY, currency);
  const themeConfig = buildThemeConfigPayload(profile.themeConfig, profile.darkMode);
  const isDark = themeConfig.surface === 'dark' || themeConfig.surface === 'amoled';
  return {
    ownerId: uid,
    email: clampStr(email || 'user@cashtrace.app', BLUEPRINT_LIMITS.MAX_EMAIL, 'user@cashtrace.app'),
    name: clampStr(profile.name, BLUEPRINT_LIMITS.MAX_NAME, 'ইউজার'),
    currency,
    baseCurrency,
    pin,
    pinLock: Boolean(profile.pinLock && pin.length === 4),
    darkMode: isDark,
    hideBalance: Boolean(profile.hideBalance),
    language: (profile.language === 'en' ? 'en' : 'bn') as 'bn' | 'en',
    themeConfig,
  };
}

function buildProfileWorkspacePayload(uid: string, meta: ProfileMeta, hideBalance = false) {
  const currency = clampStr(meta.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳');
  const baseCurrency = clampStr(meta.baseCurrency || currency, BLUEPRINT_LIMITS.MAX_CURRENCY, currency);
  return {
    ownerId: uid,
    name: clampStr(meta.name, BLUEPRINT_LIMITS.MAX_NAME, 'Profile'),
    currency,
    baseCurrency,
    color: sanitizeColor(meta.color, PROFILE_COLORS[0]),
    hideBalance: Boolean(hideBalance),
    clientCreatedAt: clampNum(meta.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function buildWalletPayload(uid: string, wallet: WalletAccount) {
  return {
    ownerId: uid,
    name: clampStr(wallet.name, BLUEPRINT_LIMITS.MAX_NAME, 'Wallet'),
    type: (wallet.type === 'mobile' || wallet.type === 'bank' ? wallet.type : 'cash') as WalletAccount['type'],
    initialBalance: clampNum(wallet.initialBalance, -BLUEPRINT_LIMITS.MAX_NUM),
    color: sanitizeColor(wallet.color, '#059669'),
  };
}

function buildCategoryPayload(uid: string, cat: CategoryItem) {
  return {
    ownerId: uid,
    name: clampStr(cat.name, BLUEPRINT_LIMITS.MAX_CATEGORY, 'Other'),
    type: (cat.type === 'income' ? 'income' : 'expense') as CategoryItem['type'],
    color: sanitizeColor(cat.color, '#64748b'),
  };
}

function buildSmartMemoryPayload(uid: string, item: SmartMemoryItem) {
  return {
    ownerId: uid,
    title: clampStr(item.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Fixed Item'),
    amount: clampNum(item.amount, 0),
    category: clampStr(item.category, BLUEPRINT_LIMITS.MAX_CATEGORY, '💡 অন্যান্য খরচ'),
    walletId: sanitizeId(item.walletId || 'cash', 'cash'),
  };
}

function buildQuickTemplatePayload(uid: string, item: QuickTemplate) {
  return {
    ownerId: uid,
    title: clampStr(item.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Quick Item'),
    amount: clampNum(item.amount, 0),
    category: clampStr(item.category, BLUEPRINT_LIMITS.MAX_CATEGORY, '💡 অন্যান্য খরচ'),
    type: (item.type === 'income' ? 'income' : 'expense') as QuickTemplate['type'],
    walletId: sanitizeId(item.walletId || 'cash', 'cash'),
  };
}

function buildTransactionPayload(uid: string, tx: Transaction) {
  const base: Record<string, unknown> = {
    ownerId: uid,
    type: (tx.type === 'income' || tx.type === 'transfer' ? tx.type : 'expense') as Transaction['type'],
    title: clampStr(tx.title, BLUEPRINT_LIMITS.MAX_TX_TITLE, 'Transaction'),
    amount: Math.max(0.01, clampNum(tx.amount, 0.01, BLUEPRINT_LIMITS.MAX_NUM, 1)),
    category: clampStr(tx.category, BLUEPRINT_LIMITS.MAX_CATEGORY, '💡 অন্যান্য খরচ'),
    date: sanitizeDateStr(tx.date),
    walletId: sanitizeId(tx.walletId || 'cash', 'cash'),
    clientCreatedAt: clampNum(tx.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
  const sub = clampStr(tx.subcategory, BLUEPRINT_LIMITS.MAX_SUBCATEGORY);
  if (sub) base.subcategory = sub;
  if (tx.type === 'transfer' && tx.toWalletId) {
    base.toWalletId = sanitizeId(tx.toWalletId, 'cash');
  }
  return base;
}

function buildDebtPayload(uid: string, debt: DebtRecord) {
  const amount = Math.max(0.01, clampNum(debt.amount, 0.01, BLUEPRINT_LIMITS.MAX_NUM, 1));
  const paidAmount = clampNum(debt.paidAmount, 0, amount, 0);
  const base: Record<string, unknown> = {
    ownerId: uid,
    personName: clampStr(debt.personName, BLUEPRINT_LIMITS.MAX_PERSON_NAME, 'Person'),
    type: (debt.type === 'borrowed' ? 'borrowed' : 'lent') as DebtRecord['type'],
    amount,
    paidAmount,
    date: sanitizeDateStr(debt.date),
    settled: Boolean(debt.settled || paidAmount >= amount),
  };
  const dueDate = sanitizeOptionalDateStr(debt.dueDate);
  if (dueDate) base.dueDate = dueDate;
  const note = clampStr(debt.note, BLUEPRINT_LIMITS.MAX_NOTE);
  if (note) base.note = note;
  if (debt.walletId) base.walletId = sanitizeId(debt.walletId, 'cash');
  return base;
}

function buildSavingsGoalPayload(uid: string, goal: SavingsGoal) {
  return {
    ownerId: uid,
    title: clampStr(goal.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Goal'),
    target: Math.max(1, clampNum(goal.target, 1, BLUEPRINT_LIMITS.MAX_NUM, 100)),
    saved: clampNum(goal.saved, 0),
    clientCreatedAt: clampNum(goal.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function buildShoppingListPayload(uid: string, list: ShoppingList) {
  return {
    ownerId: uid,
    title: clampStr(list.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Bazar List'),
    clientCreatedAt: clampNum(list.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function buildShoppingItemPayload(uid: string, listId: string, item: ShoppingItem) {
  const base: Record<string, unknown> = {
    ownerId: uid,
    listId: sanitizeId(listId, 'list'),
    name: clampStr(item.name, BLUEPRINT_LIMITS.MAX_ITEM_NAME, 'Item'),
    checked: Boolean(item.checked),
    clientCreatedAt: clampNum(item.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
  const qty = clampStr(item.quantity, BLUEPRINT_LIMITS.MAX_QUANTITY);
  if (qty) base.quantity = qty;
  if (typeof item.estimatedPrice === 'number' && Number.isFinite(item.estimatedPrice) && item.estimatedPrice >= 0) {
    base.estimatedPrice = clampNum(item.estimatedPrice, 0);
  }
  return base;
}

function buildCategoryBudgetPayload(uid: string, cb: CategoryBudget) {
  return {
    ownerId: uid,
    category: clampStr(cb.category, BLUEPRINT_LIMITS.MAX_CATEGORY, '💡 অন্যান্য খরচ'),
    limit: clampNum(cb.limit, 0),
  };
}

function buildRecurringBillPayload(uid: string, bill: RecurringBill) {
  const paidMonths = Array.isArray(bill.paidMonths)
    ? bill.paidMonths.filter((m) => BLUEPRINT_LIMITS.MONTH_REGEX.test(String(m))).slice(0, 120)
    : [];
  return {
    ownerId: uid,
    title: clampStr(bill.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Bill'),
    amount: Math.max(0.01, clampNum(bill.amount, 0.01, BLUEPRINT_LIMITS.MAX_NUM, 1)),
    category: clampStr(bill.category, BLUEPRINT_LIMITS.MAX_CATEGORY, '🏠 বাসা ভাড়া ও বিল'),
    walletId: sanitizeId(bill.walletId || 'cash', 'cash'),
    dueDay: Math.round(clampNum(bill.dueDay, 1, 31, 1)),
    paidMonths,
    clientCreatedAt: clampNum(bill.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function buildFinancialNotePayload(uid: string, note: FinancialNote) {
  return {
    ownerId: uid,
    title: clampStr(note.title, BLUEPRINT_LIMITS.MAX_TITLE, 'Note'),
    body: String(note.body ?? '').slice(0, 1000),
    pinned: Boolean(note.pinned),
    clientUpdatedAt: clampNum(note.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function buildDailyTaskPayload(uid: string, task: DailyTask) {
  const base: Record<string, unknown> = {
    ownerId: uid,
    title: clampStr(task.title, BLUEPRINT_LIMITS.MAX_TX_TITLE, 'Task'),
    done: Boolean(task.done),
    priority: (task.priority === 'high' ? 'high' : 'normal') as DailyTask['priority'],
    clientCreatedAt: clampNum(task.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
  const due = clampStr(task.dueTime, 10);
  if (due) base.dueTime = due;
  if (typeof task.dailyRoutine === 'boolean') base.dailyRoutine = task.dailyRoutine;
  return base;
}

const VALID_VAULT_CATS: VaultCategory[] = ['bank', 'id', 'card', 'wifi', 'warranty', 'other'];

function buildVaultItemPayload(uid: string, item: VaultItem) {
  const cat: VaultCategory = VALID_VAULT_CATS.includes(item.category) ? item.category : 'other';
  const base: Record<string, unknown> = {
    ownerId: uid,
    label: clampStr(item.label, BLUEPRINT_LIMITS.MAX_TITLE, 'Vault Record'),
    category: cat,
    value: clampStr(item.value, 400, '***'),
    clientUpdatedAt: clampNum(item.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
  const note = clampStr(item.note, BLUEPRINT_LIMITS.MAX_NOTE);
  if (note) base.note = note;
  const exp = sanitizeOptionalDateStr(item.expiryDate);
  if (exp) base.expiryDate = exp;
  return base;
}

type BatchOp = {
  ref: DocumentReference<DocumentData>;
  data: Record<string, unknown>;
};

async function commitBatchOps(ops: BatchOp[], pathLabel: string): Promise<void> {
  const CHUNK = 350;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const chunk = ops.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach((op) => {
      batch.set(op.ref, {
        ...op.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, pathLabel);
    }
  }
}

export function hasMeaningfulLocalData(state: CashTraceState): boolean {
  const txCount = Object.values(state.months).reduce((sum, m) => sum + (m.transactions?.length || 0), 0);
  const hasBudget = Object.values(state.months).some((m) => (m.budgetCap || 0) > 0);
  const hasWalletBalance = state.wallets.some((w) => (w.initialBalance || 0) !== 0);
  const hasShoppingItems = state.shoppingLists.some((l) => l.items.length > 0);
  return (
    txCount > 0 ||
    hasBudget ||
    hasWalletBalance ||
    state.debts.length > 0 ||
    state.savingsGoals.length > 0 ||
    (state.recurringBills?.length || 0) > 0 ||
    (state.financialNotes?.length || 0) > 0 ||
    (state.dailyTasks?.length || 0) > 0 ||
    (state.vaultItems?.length || 0) > 0 ||
    hasShoppingItems
  );
}

export async function checkUserProfileExists(uid: string): Promise<boolean> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('offline')) {
      return false;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function ensureUserRootDoc(user: User, profile: UserProfile): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload = buildProfilePayload(uid, user.email || '', {
        ...profile,
        name:
          profile.name === 'ইউজার' && user.displayName
            ? clampStr(user.displayName, BLUEPRINT_LIMITS.MAX_NAME, 'ইউজার')
            : profile.name,
      });
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureProfileWorkspaceDoc(
  user: User,
  profileId: string,
  state: CashTraceState,
  meta?: ProfileMeta
): Promise<void> {
  await ensureUserRootDoc(user, state.profile);
  if (isDefaultProfile(profileId)) return;

  const uid = sanitizeId(user.uid, 'user');
  const pid = sanitizeId(profileId, 'prof');
  const path = `users/${uid}/profiles/${pid}`;
  const ref = doc(db, 'users', uid, 'profiles', pid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload = buildProfileWorkspacePayload(
        uid,
        meta || {
          id: pid,
          name: state.profile.name || 'প্রোফাইল',
          currency: state.profile.currency || '৳',
          color: PROFILE_COLORS[1],
          createdAt: Date.now(),
        },
        state.profile.hideBalance
      );
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function uploadFullStateToCloud(
  user: User,
  state: CashTraceState,
  onlyMissing = false,
  profileId: string = DEFAULT_PROFILE_ID,
  meta?: ProfileMeta
): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  await ensureProfileWorkspaceDoc(user, profileId, state, meta);

  const prefix = workspacePrefix(uid, profileId);

  let existingTxIds = new Set<string>();
  let existingDebtIds = new Set<string>();
  let existingGoalIds = new Set<string>();
  let existingListIds = new Set<string>();
  let existingWalletIds = new Set<string>();
  let existingCategoryIds = new Set<string>();
  let existingBudgetKeys = new Set<string>();
  let existingCatBudgetIds = new Set<string>();
  let existingBillIds = new Set<string>();
  let existingNoteIds = new Set<string>();
  let existingTaskIds = new Set<string>();
  let existingVaultIds = new Set<string>();

  if (onlyMissing) {
    try {
      const [txS, debtS, goalS, listS, walS, catS, budS, cbS, billS, noteS, taskS, vaultS] = await Promise.all([
        getDocs(query(wsCol(uid, profileId, 'transactions'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'debts'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'savingsGoals'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'shoppingLists'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'wallets'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'categories'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'monthBudgets'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'categoryBudgets'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'recurringBills'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'financialNotes'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'dailyTasks'), where('ownerId', '==', uid))),
        getDocs(query(wsCol(uid, profileId, 'vaultItems'), where('ownerId', '==', uid))),
      ]);
      existingTxIds = new Set(txS.docs.map((d) => d.id));
      existingDebtIds = new Set(debtS.docs.map((d) => d.id));
      existingGoalIds = new Set(goalS.docs.map((d) => d.id));
      existingListIds = new Set(listS.docs.map((d) => d.id));
      existingWalletIds = new Set(walS.docs.map((d) => d.id));
      existingCategoryIds = new Set(catS.docs.map((d) => d.id));
      existingBudgetKeys = new Set(budS.docs.map((d) => d.id));
      existingCatBudgetIds = new Set(cbS.docs.map((d) => d.id));
      existingBillIds = new Set(billS.docs.map((d) => d.id));
      existingNoteIds = new Set(noteS.docs.map((d) => d.id));
      existingTaskIds = new Set(taskS.docs.map((d) => d.id));
      existingVaultIds = new Set(vaultS.docs.map((d) => d.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, prefix);
    }
  }

  const level1Ops: BatchOp[] = [];
  const listItemOps: BatchOp[] = [];

  state.wallets.forEach((w) => {
    const id = sanitizeId(w.id, 'wallet');
    if (!onlyMissing || !existingWalletIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'wallets', id),
        data: buildWalletPayload(uid, w),
      });
    }
  });

  state.categories.forEach((c) => {
    const id = sanitizeId(c.id, 'cat');
    if (!onlyMissing || !existingCategoryIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'categories', id),
        data: buildCategoryPayload(uid, c),
      });
    }
  });

  if (!onlyMissing) {
    state.smartMemory.forEach((sm) => {
      const id = sanitizeId(sm.id, 'sm');
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'smartMemory', id),
        data: buildSmartMemoryPayload(uid, sm),
      });
    });

    state.quickTemplates.forEach((qt) => {
      const id = sanitizeId(qt.id, 'qt');
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'quickTemplates', id),
        data: buildQuickTemplatePayload(uid, qt),
      });
    });
  }

  Object.entries(state.months).forEach(([mKeyRaw, mStore]) => {
    const mKey = sanitizeMonthKey(mKeyRaw);
    if ((mStore.budgetCap || 0) > 0 && (!onlyMissing || !existingBudgetKeys.has(mKey))) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'monthBudgets', mKey),
        data: {
          ownerId: uid,
          monthKey: mKey,
          budgetCap: clampNum(mStore.budgetCap, 0),
        },
      });
    }
    (mStore.transactions || []).forEach((tx) => {
      const id = sanitizeId(tx.id, 'tx');
      if (!onlyMissing || !existingTxIds.has(id)) {
        level1Ops.push({
          ref: wsDoc(uid, profileId, 'transactions', id),
          data: buildTransactionPayload(uid, tx),
        });
      }
    });
  });

  state.debts.forEach((d) => {
    const id = sanitizeId(d.id, 'debt');
    if (!onlyMissing || !existingDebtIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'debts', id),
        data: buildDebtPayload(uid, d),
      });
    }
  });

  state.savingsGoals.forEach((g) => {
    const id = sanitizeId(g.id, 'goal');
    if (!onlyMissing || !existingGoalIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'savingsGoals', id),
        data: buildSavingsGoalPayload(uid, g),
      });
    }
  });

  (state.categoryBudgets || []).forEach((cb) => {
    const id = sanitizeId(cb.id, 'cb');
    if (!onlyMissing || !existingCatBudgetIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'categoryBudgets', id),
        data: buildCategoryBudgetPayload(uid, cb),
      });
    }
  });

  (state.recurringBills || []).forEach((bill) => {
    const id = sanitizeId(bill.id, 'bill');
    if (!onlyMissing || !existingBillIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'recurringBills', id),
        data: buildRecurringBillPayload(uid, bill),
      });
    }
  });

  (state.financialNotes || []).forEach((note) => {
    const id = sanitizeId(note.id, 'note');
    if (!onlyMissing || !existingNoteIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'financialNotes', id),
        data: buildFinancialNotePayload(uid, note),
      });
    }
  });

  (state.dailyTasks || []).forEach((task) => {
    const id = sanitizeId(task.id, 'task');
    if (!onlyMissing || !existingTaskIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'dailyTasks', id),
        data: buildDailyTaskPayload(uid, task),
      });
    }
  });

  (state.vaultItems || []).forEach((item) => {
    const id = sanitizeId(item.id, 'vault');
    if (!onlyMissing || !existingVaultIds.has(id)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'vaultItems', id),
        data: buildVaultItemPayload(uid, item),
      });
    }
  });

  for (const lst of state.shoppingLists) {
    const listId = sanitizeId(lst.id, 'list');
    if (!onlyMissing || !existingListIds.has(listId)) {
      level1Ops.push({
        ref: wsDoc(uid, profileId, 'shoppingLists', listId),
        data: buildShoppingListPayload(uid, lst),
      });
      lst.items.forEach((it) => {
        const itemId = sanitizeId(it.id, 'sitem');
        listItemOps.push({
          ref: wsListItemDoc(uid, profileId, listId, itemId),
          data: buildShoppingItemPayload(uid, listId, it),
        });
      });
    } else if (lst.items.length > 0) {
      try {
        const itemSnap = await getDocs(
          query(wsListItemCol(uid, profileId, listId), where('ownerId', '==', uid))
        );
        const existingItemIds = new Set(itemSnap.docs.map((d) => d.id));
        lst.items.forEach((it) => {
          const itemId = sanitizeId(it.id, 'sitem');
          if (!existingItemIds.has(itemId)) {
            listItemOps.push({
              ref: wsListItemDoc(uid, profileId, listId, itemId),
              data: buildShoppingItemPayload(uid, listId, it),
            });
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `${prefix}/shoppingLists/${listId}/items`);
      }
    }
  }

  if (level1Ops.length > 0) {
    await commitBatchOps(level1Ops, prefix);
  }
  if (listItemOps.length > 0) {
    await commitBatchOps(listItemOps, `${prefix}/shoppingLists/items`);
  }
}

export function subscribeToProfilesMeta(
  user: User,
  onProfilesUpdate: (cloudCustomProfiles: ProfileMeta[], defaultMetaPatch?: Partial<ProfileMeta>) => void
): () => void {
  const uid = sanitizeId(user.uid, 'user');
  let customProfiles: ProfileMeta[] = [];
  let defaultPatch: Partial<ProfileMeta> | undefined;

  const emit = () => {
    onProfilesUpdate(customProfiles, defaultPatch);
  };

  const unsubRoot = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        defaultPatch = {
          name: String(d.name || 'ইউজার'),
          currency: String(d.currency || '৳'),
          baseCurrency: String(d.baseCurrency || d.currency || '৳'),
        };
        emit();
      }
    },
    (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}`)
  );

  const unsubList = onSnapshot(
    query(collection(db, 'users', uid, 'profiles'), where('ownerId', '==', uid)),
    (snap) => {
      customProfiles = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: d.id,
            name: String(v.name || 'Profile'),
            currency: String(v.currency || '৳'),
            baseCurrency: String(v.baseCurrency || v.currency || '৳'),
            color: String(v.color || PROFILE_COLORS[1]),
            createdAt: Number(v.clientCreatedAt) || Date.now(),
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt);
      emit();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/profiles`)
  );

  return () => {
    unsubRoot();
    unsubList();
  };
}

export async function cloudCreateProfileWorkspace(
  user: User,
  meta: ProfileMeta,
  initialState: CashTraceState
): Promise<void> {
  await uploadFullStateToCloud(user, initialState, false, meta.id, meta);
}

export async function cloudDeleteProfileWorkspace(
  uidRaw: string,
  profileIdRaw: string
): Promise<void> {
  if (isDefaultProfile(profileIdRaw)) return;
  const uid = sanitizeId(uidRaw, 'user');
  const pid = sanitizeId(profileIdRaw, 'prof');
  const basePath = `users/${uid}/profiles/${pid}`;

  try {
    // 1. Delete shopping list subcollection items BEFORE deleting shoppingLists or profile
    const listsSnap = await getDocs(
      query(collection(db, 'users', uid, 'profiles', pid, 'shoppingLists'), where('ownerId', '==', uid))
    );
    const deleteRefs: DocumentReference<DocumentData>[] = [];

    for (const listDoc of listsSnap.docs) {
      const itemsSnap = await getDocs(
        query(
          collection(db, 'users', uid, 'profiles', pid, 'shoppingLists', listDoc.id, 'items'),
          where('ownerId', '==', uid)
        )
      );
      itemsSnap.docs.forEach((d) => deleteRefs.push(d.ref));
    }

    const subcols = [
      'shoppingLists',
      'wallets',
      'categories',
      'smartMemory',
      'quickTemplates',
      'monthBudgets',
      'transactions',
      'debts',
      'savingsGoals',
      'categoryBudgets',
      'recurringBills',
      'financialNotes',
      'dailyTasks',
      'vaultItems',
    ];
    const snaps = await Promise.all(
      subcols.map((colName) =>
        getDocs(query(collection(db, 'users', uid, 'profiles', pid, colName), where('ownerId', '==', uid)))
      )
    );
    snaps.forEach((s) => s.docs.forEach((d) => deleteRefs.push(d.ref)));

    const CHUNK = 350;
    for (let i = 0; i < deleteRefs.length; i += CHUNK) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'users', uid, 'profiles', pid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, basePath);
  }
}

export function subscribeToUserCloudData(
  user: User,
  onHydrate: (updater: (prev: CashTraceState) => CashTraceState) => void,
  onSyncActivity?: (syncing: boolean) => void,
  profileId: string = DEFAULT_PROFILE_ID
): () => void {
  const uid = sanitizeId(user.uid, 'user');
  const prefix = workspacePrefix(uid, profileId);
  const defaultMode = isDefaultProfile(profileId);
  const unsubscribers: Unsubscribe[] = [];
  const itemUnsubs = new Map<string, Unsubscribe>();
  const itemsByList = new Map<string, ShoppingItem[]>();
  let currentListMeta: Array<{id: string; title: string; createdAt: number}> = [];

  const flushShoppingLists = () => {
    const merged: ShoppingList[] = currentListMeta
      .map((meta) => ({
        id: meta.id,
        title: meta.title,
        createdAt: meta.createdAt,
        items: [...(itemsByList.get(meta.id) || [])].sort((a, b) => b.createdAt - a.createdAt),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    onHydrate((prev) => ({
      ...prev,
      shoppingLists: merged,
    }));
  };

  onSyncActivity?.(true);

  // 1. User / Profile Workspace Doc
  unsubscribers.push(
    onSnapshot(
      wsDocRef(uid, profileId),
      (snap) => {
        onSyncActivity?.(false);
        if (!snap.exists()) return;
        const data = snap.data();
        if (defaultMode) {
          onHydrate((prev) => ({
            ...prev,
            profile: {
              name: String(data.name || prev.profile.name),
              currency: String(data.currency || prev.profile.currency),
              baseCurrency: String(
                data.baseCurrency || data.currency || prev.profile.baseCurrency || prev.profile.currency
              ),
              pin: String(data.pin || ''),
              pinLock: Boolean(data.pinLock && String(data.pin || '').length === 4),
              darkMode: Boolean(data.darkMode),
              hideBalance: Boolean(data.hideBalance),
              language: data.language === 'en' ? 'en' : 'bn',
              themeConfig: data.themeConfig
                ? resolveEffectiveThemeConfig(data.themeConfig as Partial<ThemeConfig>, Boolean(data.darkMode))
                : prev.profile.themeConfig || resolveEffectiveThemeConfig(DEFAULT_THEME_CONFIG, Boolean(data.darkMode)),
            },
          }));
        } else {
          onHydrate((prev) => ({
            ...prev,
            profile: {
              ...prev.profile,
              name: String(data.name || prev.profile.name),
              currency: String(data.currency || prev.profile.currency),
              baseCurrency: String(
                data.baseCurrency || data.currency || prev.profile.baseCurrency || prev.profile.currency
              ),
              hideBalance: Boolean(data.hideBalance),
            },
          }));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, prefix);
      }
    )
  );

  // 2. Wallets
  const walletsPath = `${prefix}/wallets`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'wallets'), where('ownerId', '==', uid)),
      (snap) => {
        const wallets: WalletAccount[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            name: String(v.name || 'Wallet'),
            type: (v.type === 'mobile' || v.type === 'bank' ? v.type : 'cash') as WalletAccount['type'],
            initialBalance: Number(v.initialBalance) || 0,
            color: String(v.color || '#059669'),
          };
        });
        onHydrate((prev) => ({
          ...prev,
          wallets: wallets.length > 0 ? wallets : DEFAULT_WALLETS,
        }));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, walletsPath)
    )
  );

  // 3. Categories
  const catPath = `${prefix}/categories`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'categories'), where('ownerId', '==', uid)),
      (snap) => {
        const categories: CategoryItem[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            name: String(v.name || 'Other'),
            type: (v.type === 'income' ? 'income' : 'expense') as CategoryItem['type'],
            color: String(v.color || '#64748b'),
          };
        });
        onHydrate((prev) => ({
          ...prev,
          categories: categories.length > 0 ? categories : DEFAULT_CATEGORIES,
        }));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, catPath)
    )
  );

  // 4. Smart Memory
  const smPath = `${prefix}/smartMemory`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'smartMemory'), where('ownerId', '==', uid)),
      (snap) => {
        const smartMemory: SmartMemoryItem[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            title: String(v.title || ''),
            amount: Number(v.amount) || 0,
            category: String(v.category || ''),
            walletId: String(v.walletId || 'cash'),
          };
        });
        onHydrate((prev) => ({...prev, smartMemory}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, smPath)
    )
  );

  // 5. Quick Templates
  const qtPath = `${prefix}/quickTemplates`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'quickTemplates'), where('ownerId', '==', uid)),
      (snap) => {
        const quickTemplates: QuickTemplate[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            title: String(v.title || ''),
            amount: Number(v.amount) || 0,
            category: String(v.category || ''),
            type: (v.type === 'income' ? 'income' : 'expense') as QuickTemplate['type'],
            walletId: String(v.walletId || 'cash'),
          };
        });
        onHydrate((prev) => ({
          ...prev,
          quickTemplates: quickTemplates.length > 0 ? quickTemplates : DEFAULT_QUICK_TEMPLATES,
        }));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, qtPath)
    )
  );

  // 6 & 7. Month Budgets + Transactions
  let latestBudgets: Record<string, number> = {};
  let latestTxs: Transaction[] = [];

  const rebuildMonths = () => {
    const months: Record<string, MonthStore> = {};
    const curMonth = getLocalMonthKey();
    months[curMonth] = {budgetCap: latestBudgets[curMonth] || 0, transactions: []};

    Object.entries(latestBudgets).forEach(([mKey, cap]) => {
      months[mKey] = {
        budgetCap: cap,
        transactions: months[mKey]?.transactions || [],
      };
    });

    latestTxs.forEach((tx) => {
      const mKey = tx.date.slice(0, 7) || curMonth;
      if (!months[mKey]) {
        months[mKey] = {budgetCap: latestBudgets[mKey] || 0, transactions: []};
      }
      months[mKey].transactions.push(tx);
    });

    Object.values(months).forEach((m) => {
      m.transactions.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.createdAt - a.createdAt;
      });
    });

    onHydrate((prev) => ({...prev, months}));
  };

  const budgetsPath = `${prefix}/monthBudgets`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'monthBudgets'), where('ownerId', '==', uid)),
      (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((d) => {
          next[d.id] = Number(d.data().budgetCap) || 0;
        });
        latestBudgets = next;
        rebuildMonths();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, budgetsPath)
    )
  );

  const txPath = `${prefix}/transactions`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'transactions'), where('ownerId', '==', uid)),
      (snap) => {
        latestTxs = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            type: (v.type === 'income' || v.type === 'transfer' ? v.type : 'expense') as Transaction['type'],
            title: String(v.title || ''),
            amount: Number(v.amount) || 0,
            category: String(v.category || ''),
            subcategory: v.subcategory ? String(v.subcategory) : undefined,
            date: String(v.date || getLocalDateStr()),
            walletId: String(v.walletId || 'cash'),
            toWalletId: v.toWalletId ? String(v.toWalletId) : undefined,
            createdAt: Number(v.clientCreatedAt) || Date.now(),
          };
        });
        rebuildMonths();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, txPath)
    )
  );

  // 8. Debts
  const debtsPath = `${prefix}/debts`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'debts'), where('ownerId', '==', uid)),
      (snap) => {
        const debts: DebtRecord[] = snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              personName: String(v.personName || ''),
              type: (v.type === 'borrowed' ? 'borrowed' : 'lent') as DebtRecord['type'],
              amount: Number(v.amount) || 0,
              paidAmount: Number(v.paidAmount) || 0,
              date: String(v.date || getLocalDateStr()),
              dueDate: v.dueDate ? String(v.dueDate) : undefined,
              note: v.note ? String(v.note) : undefined,
              walletId: v.walletId ? String(v.walletId) : undefined,
              settled: Boolean(v.settled),
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date));
        onHydrate((prev) => ({...prev, debts}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, debtsPath)
    )
  );

  // 9. Savings Goals
  const goalsPath = `${prefix}/savingsGoals`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'savingsGoals'), where('ownerId', '==', uid)),
      (snap) => {
        const savingsGoals: SavingsGoal[] = snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: String(v.title || ''),
              target: Number(v.target) || 1,
              saved: Number(v.saved) || 0,
              createdAt: Number(v.clientCreatedAt) || Date.now(),
            };
          })
          .sort((a, b) => a.createdAt - b.createdAt);
        onHydrate((prev) => ({...prev, savingsGoals}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, goalsPath)
    )
  );

  // 10. Shopping Lists + Dynamic Subcollection Listeners
  const listsPath = `${prefix}/shoppingLists`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'shoppingLists'), where('ownerId', '==', uid)),
      (snap) => {
        const activeIds = new Set<string>();
        currentListMeta = snap.docs.map((d) => {
          activeIds.add(d.id);
          const v = d.data();
          return {
            id: d.id,
            title: String(v.title || 'বাজার লিস্ট'),
            createdAt: Number(v.clientCreatedAt) || Date.now(),
          };
        });

        for (const [listId, unsub] of itemUnsubs.entries()) {
          if (!activeIds.has(listId)) {
            unsub();
            itemUnsubs.delete(listId);
            itemsByList.delete(listId);
          }
        }

        currentListMeta.forEach((meta) => {
          if (!itemUnsubs.has(meta.id)) {
            const itemsPath = `${prefix}/shoppingLists/${meta.id}/items`;
            const unsub = onSnapshot(
              query(wsListItemCol(uid, profileId, meta.id), where('ownerId', '==', uid)),
              (itemSnap) => {
                const listItems: ShoppingItem[] = itemSnap.docs.map((idDoc) => {
                  const iv = idDoc.data();
                  return {
                    id: idDoc.id,
                    name: String(iv.name || ''),
                    quantity: iv.quantity ? String(iv.quantity) : undefined,
                    estimatedPrice:
                      typeof iv.estimatedPrice === 'number' ? iv.estimatedPrice : undefined,
                    checked: Boolean(iv.checked),
                    createdAt: Number(iv.clientCreatedAt) || Date.now(),
                  };
                });
                itemsByList.set(meta.id, listItems);
                flushShoppingLists();
              },
              (error) => handleFirestoreError(error, OperationType.LIST, itemsPath)
            );
            itemUnsubs.set(meta.id, unsub);
          }
        });

        flushShoppingLists();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, listsPath)
    )
  );

  // 11. Category Budgets
  const catBudgetsPath = `${prefix}/categoryBudgets`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'categoryBudgets'), where('ownerId', '==', uid)),
      (snap) => {
        const categoryBudgets: CategoryBudget[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            category: String(v.category || ''),
            limit: Number(v.limit) || 0,
          };
        });
        onHydrate((prev) => ({...prev, categoryBudgets}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, catBudgetsPath)
    )
  );

  // 12. Recurring Bills
  const billsPath = `${prefix}/recurringBills`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'recurringBills'), where('ownerId', '==', uid)),
      (snap) => {
        const recurringBills: RecurringBill[] = snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: String(v.title || ''),
              amount: Number(v.amount) || 0,
              category: String(v.category || '🏠 বাসা ভাড়া ও বিল'),
              walletId: String(v.walletId || 'cash'),
              dueDay: Number(v.dueDay) || 1,
              paidMonths: Array.isArray(v.paidMonths) ? v.paidMonths.map(String) : [],
              createdAt: Number(v.clientCreatedAt) || Date.now(),
            };
          })
          .sort((a, b) => a.dueDay - b.dueDay);
        onHydrate((prev) => ({...prev, recurringBills}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, billsPath)
    )
  );

  // 13. Financial Notes
  const notesPath = `${prefix}/financialNotes`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'financialNotes'), where('ownerId', '==', uid)),
      (snap) => {
        const financialNotes: FinancialNote[] = snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: String(v.title || ''),
              body: String(v.body || ''),
              pinned: Boolean(v.pinned),
              updatedAt: Number(v.clientUpdatedAt) || Date.now(),
            };
          })
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
        onHydrate((prev) => ({...prev, financialNotes}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, notesPath)
    )
  );

  // 14. Daily Planner Tasks
  const tasksPath = `${prefix}/dailyTasks`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'dailyTasks'), where('ownerId', '==', uid)),
      (snap) => {
        const dailyTasks: DailyTask[] = snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: String(v.title || ''),
              done: Boolean(v.done),
              priority: (v.priority === 'high' ? 'high' : 'normal') as DailyTask['priority'],
              dueTime: v.dueTime ? String(v.dueTime) : undefined,
              dailyRoutine: typeof v.dailyRoutine === 'boolean' ? v.dailyRoutine : undefined,
              createdAt: Number(v.clientCreatedAt) || Date.now(),
            };
          })
          .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
        onHydrate((prev) => ({...prev, dailyTasks}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, tasksPath)
    )
  );

  // 15. Pocket Vault Items
  const vaultPath = `${prefix}/vaultItems`;
  unsubscribers.push(
    onSnapshot(
      query(wsCol(uid, profileId, 'vaultItems'), where('ownerId', '==', uid)),
      (snap) => {
        const vaultItems: VaultItem[] = snap.docs
          .map((d) => {
            const v = d.data();
            const cat = VALID_VAULT_CATS.includes(v.category as VaultCategory)
              ? (v.category as VaultCategory)
              : 'other';
            return {
              id: d.id,
              label: String(v.label || ''),
              category: cat,
              value: String(v.value || ''),
              note: v.note ? String(v.note) : undefined,
              expiryDate: v.expiryDate ? String(v.expiryDate) : undefined,
              updatedAt: Number(v.clientUpdatedAt) || Date.now(),
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
        onHydrate((prev) => ({...prev, vaultItems}));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, vaultPath)
    )
  );

  return () => {
    unsubscribers.forEach((u) => u());
    itemUnsubs.forEach((u) => u());
    itemUnsubs.clear();
  };
}

// --- Granular Cloud Write Operations (Workspace-Aware & Blueprint-Sanitized) ---

export async function cloudUpdateProfile(user: User, nextProfile: UserProfile): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const pin = sanitizePin(nextProfile.pin);
  const currency = clampStr(nextProfile.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳');
  const baseCurrency = clampStr(nextProfile.baseCurrency || currency, BLUEPRINT_LIMITS.MAX_CURRENCY, currency);
  const themeConfig = buildThemeConfigPayload(nextProfile.themeConfig, nextProfile.darkMode);
  const isDark = themeConfig.surface === 'dark' || themeConfig.surface === 'amoled';
  try {
    await ensureUserRootDoc(user, nextProfile);
    await updateDoc(ref, {
      name: clampStr(nextProfile.name, BLUEPRINT_LIMITS.MAX_NAME, 'ইউজার'),
      currency,
      baseCurrency,
      pin,
      pinLock: Boolean(nextProfile.pinLock && pin.length === 4),
      darkMode: isDark,
      hideBalance: Boolean(nextProfile.hideBalance),
      language: nextProfile.language === 'en' ? 'en' : 'bn',
      themeConfig,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudUpdateProfileWorkspace(
  user: User,
  profileId: string,
  patch: Partial<{name: string; currency: string; baseCurrency: string; color: string; hideBalance: boolean}>,
  fallbackMeta?: ProfileMeta
): Promise<void> {
  if (isDefaultProfile(profileId)) return;
  const uid = sanitizeId(user.uid, 'user');
  const pid = sanitizeId(profileId, 'prof');
  const path = `users/${uid}/profiles/${pid}`;
  const ref = doc(db, 'users', uid, 'profiles', pid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...buildProfileWorkspacePayload(
          uid,
          {
            id: pid,
            name: patch.name || fallbackMeta?.name || 'Profile',
            currency: patch.currency || fallbackMeta?.currency || '৳',
            baseCurrency: patch.baseCurrency || fallbackMeta?.baseCurrency || patch.currency || '৳',
            color: patch.color || fallbackMeta?.color || PROFILE_COLORS[1],
            createdAt: fallbackMeta?.createdAt || Date.now(),
          },
          Boolean(patch.hideBalance)
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const updateData: Record<string, unknown> = {updatedAt: serverTimestamp()};
    if (patch.name !== undefined) {
      updateData.name = clampStr(patch.name, BLUEPRINT_LIMITS.MAX_NAME, 'Profile');
    }
    if (patch.currency !== undefined) {
      updateData.currency = clampStr(patch.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳');
    }
    if (patch.baseCurrency !== undefined) {
      updateData.baseCurrency = clampStr(patch.baseCurrency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳');
    }
    if (patch.color !== undefined) {
      updateData.color = sanitizeColor(patch.color, PROFILE_COLORS[1]);
    }
    if (patch.hideBalance !== undefined) {
      updateData.hideBalance = Boolean(patch.hideBalance);
    }
    await updateDoc(ref, updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudUpdateWalletInitial(
  uidRaw: string,
  wallet: WalletAccount,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  await cloudSaveWallet(uidRaw, wallet, false, profileId);
}

export async function cloudSaveWallet(
  uidRaw: string,
  wallet: WalletAccount,
  isNew: boolean,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const wid = sanitizeId(wallet.id, 'wallet');
  const path = `${workspacePrefix(uid, profileId)}/wallets/${wid}`;
  const ref = wsDoc(uid, profileId, 'wallets', wid);
  try {
    if (!isNew) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          name: clampStr(wallet.name, BLUEPRINT_LIMITS.MAX_NAME, 'Wallet'),
          type: (wallet.type === 'mobile' || wallet.type === 'bank' ? wallet.type : 'cash') as WalletAccount['type'],
          initialBalance: clampNum(wallet.initialBalance, -BLUEPRINT_LIMITS.MAX_NUM),
          color: sanitizeColor(wallet.color, '#059669'),
          updatedAt: serverTimestamp(),
        });
        return;
      }
    }
    await setDoc(ref, {
      ...buildWalletPayload(uid, wallet),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteWallet(
  uidRaw: string,
  walletIdRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const wid = sanitizeId(walletIdRaw, 'wallet');
  const path = `${workspacePrefix(uid, profileId)}/wallets/${wid}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'wallets', wid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveTransaction(
  uidRaw: string,
  tx: Transaction,
  isEdit: boolean,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const txId = sanitizeId(tx.id, 'tx');
  const path = `${workspacePrefix(uid, profileId)}/transactions/${txId}`;
  const ref = wsDoc(uid, profileId, 'transactions', txId);
  const payload = buildTransactionPayload(uid, tx);
  try {
    if (isEdit) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          ...payload,
          subcategory: 'subcategory' in payload ? payload.subcategory : deleteField(),
          toWalletId: 'toWalletId' in payload ? payload.toWalletId : deleteField(),
          updatedAt: serverTimestamp(),
        });
        return;
      }
    }
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudCreateTransactionsBatch(
  uidRaw: string,
  txs: Transaction[],
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const ops: BatchOp[] = txs.map((tx) => ({
    ref: wsDoc(uid, profileId, 'transactions', sanitizeId(tx.id, 'tx')),
    data: buildTransactionPayload(uid, tx),
  }));
  await commitBatchOps(ops, `${workspacePrefix(uid, profileId)}/transactions`);
}

export async function cloudDeleteTransaction(
  uidRaw: string,
  txIdRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const txId = sanitizeId(txIdRaw, 'tx');
  const path = `${workspacePrefix(uid, profileId)}/transactions/${txId}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveMonthBudget(
  uidRaw: string,
  monthKeyRaw: string,
  budgetCap: number,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const mKey = sanitizeMonthKey(monthKeyRaw);
  const path = `${workspacePrefix(uid, profileId)}/monthBudgets/${mKey}`;
  const ref = wsDoc(uid, profileId, 'monthBudgets', mKey);
  const safeCap = clampNum(budgetCap, 0);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        budgetCap: safeCap,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        monthKey: mKey,
        budgetCap: safeCap,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudAddDebt(
  uidRaw: string,
  debt: DebtRecord,
  optionalTx?: Transaction,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debt.id, 'debt');
  const path = `${workspacePrefix(uid, profileId)}/debts/${debtId}`;
  try {
    const batch = writeBatch(db);
    batch.set(wsDoc(uid, profileId, 'debts', debtId), {
      ...buildDebtPayload(uid, debt),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (optionalTx) {
      const txId = sanitizeId(optionalTx.id, 'tx');
      batch.set(wsDoc(uid, profileId, 'transactions', txId), {
        ...buildTransactionPayload(uid, optionalTx),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudUpdateDebt(
  uidRaw: string,
  debt: DebtRecord,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debt.id, 'debt');
  const path = `${workspacePrefix(uid, profileId)}/debts/${debtId}`;
  const ref = wsDoc(uid, profileId, 'debts', debtId);
  const payload = buildDebtPayload(uid, debt);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        personName: payload.personName,
        type: payload.type,
        amount: payload.amount,
        paidAmount: payload.paidAmount,
        date: payload.date,
        dueDate: 'dueDate' in payload ? payload.dueDate : deleteField(),
        note: 'note' in payload ? payload.note : deleteField(),
        walletId: 'walletId' in payload ? payload.walletId : deleteField(),
        settled: payload.settled,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudPayDebt(
  uidRaw: string,
  debtIdRaw: string,
  nextPaidAmount: number,
  nextSettled: boolean,
  optionalTx?: Transaction,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debtIdRaw, 'debt');
  const path = `${workspacePrefix(uid, profileId)}/debts/${debtId}`;
  try {
    const batch = writeBatch(db);
    batch.update(wsDoc(uid, profileId, 'debts', debtId), {
      paidAmount: clampNum(nextPaidAmount, 0),
      settled: Boolean(nextSettled),
      updatedAt: serverTimestamp(),
    });
    if (optionalTx) {
      const txId = sanitizeId(optionalTx.id, 'tx');
      batch.set(wsDoc(uid, profileId, 'transactions', txId), {
        ...buildTransactionPayload(uid, optionalTx),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudSettleAllPersonDebts(
  uidRaw: string,
  debtsToSettle: DebtRecord[],
  optionalTx?: Transaction,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  if (debtsToSettle.length === 0) return;
  const uid = sanitizeId(uidRaw, 'user');
  const path = `${workspacePrefix(uid, profileId)}/debts`;
  try {
    const batch = writeBatch(db);
    debtsToSettle.forEach((d) => {
      const debtId = sanitizeId(d.id, 'debt');
      batch.update(wsDoc(uid, profileId, 'debts', debtId), {
        paidAmount: clampNum(d.amount, 0.01),
        settled: true,
        updatedAt: serverTimestamp(),
      });
    });
    if (optionalTx) {
      const txId = sanitizeId(optionalTx.id, 'tx');
      batch.set(wsDoc(uid, profileId, 'transactions', txId), {
        ...buildTransactionPayload(uid, optionalTx),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudDeleteDebt(
  uidRaw: string,
  debtIdRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debtIdRaw, 'debt');
  const path = `${workspacePrefix(uid, profileId)}/debts/${debtId}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'debts', debtId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveSavingsGoal(
  uidRaw: string,
  goal: SavingsGoal,
  isNew: boolean,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const goalId = sanitizeId(goal.id, 'goal');
  const path = `${workspacePrefix(uid, profileId)}/savingsGoals/${goalId}`;
  const ref = wsDoc(uid, profileId, 'savingsGoals', goalId);
  try {
    if (!isNew) {
      await updateDoc(ref, {
        saved: clampNum(goal.saved, 0),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...buildSavingsGoalPayload(uid, goal),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteSavingsGoal(
  uidRaw: string,
  goalIdRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const goalId = sanitizeId(goalIdRaw, 'goal');
  const path = `${workspacePrefix(uid, profileId)}/savingsGoals/${goalId}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'savingsGoals', goalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudCreateShoppingList(
  uidRaw: string,
  list: ShoppingList,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(list.id, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'shoppingLists', listId), {
      ...buildShoppingListPayload(uid, list),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudUpdateShoppingListTitle(
  uidRaw: string,
  listIdRaw: string,
  title: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}`;
  try {
    await updateDoc(wsDoc(uid, profileId, 'shoppingLists', listId), {
      title: clampStr(title, BLUEPRINT_LIMITS.MAX_TITLE, 'Bazar List'),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudDuplicateShoppingList(
  uidRaw: string,
  newList: ShoppingList,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(newList.id, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'shoppingLists', listId), {
      ...buildShoppingListPayload(uid, newList),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (newList.items.length > 0) {
      const ops: BatchOp[] = newList.items.map((it) => ({
        ref: wsListItemDoc(uid, profileId, listId, sanitizeId(it.id, 'sitem')),
        data: buildShoppingItemPayload(uid, listId, it),
      }));
      await commitBatchOps(ops, `${path}/items`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteShoppingList(
  uidRaw: string,
  list: ShoppingList,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(list.id, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}`;
  try {
    if (list.items.length > 0) {
      const batch = writeBatch(db);
      list.items.forEach((it) => {
        batch.delete(wsListItemDoc(uid, profileId, listId, sanitizeId(it.id, 'sitem')));
      });
      await batch.commit();
    }
    await deleteDoc(wsDoc(uid, profileId, 'shoppingLists', listId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudCreateShoppingItem(
  uidRaw: string,
  listIdRaw: string,
  item: ShoppingItem,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(item.id, 'sitem');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}/items/${itemId}`;
  try {
    await setDoc(wsListItemDoc(uid, profileId, listId, itemId), {
      ...buildShoppingItemPayload(uid, listId, item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudUpdateShoppingItem(
  uidRaw: string,
  listIdRaw: string,
  item: ShoppingItem,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(item.id, 'sitem');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}/items/${itemId}`;
  const payload = buildShoppingItemPayload(uid, listId, item);
  try {
    const patch: Record<string, unknown> = {
      name: payload.name,
      checked: payload.checked,
      quantity: 'quantity' in payload ? payload.quantity : deleteField(),
      estimatedPrice: 'estimatedPrice' in payload ? payload.estimatedPrice : deleteField(),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(wsListItemDoc(uid, profileId, listId, itemId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudBulkToggleShoppingItems(
  uidRaw: string,
  listIdRaw: string,
  itemIds: string[],
  checked: boolean,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  if (itemIds.length === 0) return;
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}/items`;
  try {
    const batch = writeBatch(db);
    itemIds.forEach((id) => {
      batch.update(wsListItemDoc(uid, profileId, listId, sanitizeId(id, 'sitem')), {
        checked: Boolean(checked),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudDeleteShoppingItem(
  uidRaw: string,
  listIdRaw: string,
  itemIdRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(itemIdRaw, 'sitem');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}/items/${itemId}`;
  try {
    await deleteDoc(wsListItemDoc(uid, profileId, listId, itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudClearCheckedShoppingItems(
  uidRaw: string,
  listIdRaw: string,
  checkedItemIds: string[],
  expenseTx?: Transaction,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const path = `${workspacePrefix(uid, profileId)}/shoppingLists/${listId}/items`;
  try {
    const batch = writeBatch(db);
    checkedItemIds.forEach((id) => {
      batch.delete(wsListItemDoc(uid, profileId, listId, sanitizeId(id, 'sitem')));
    });
    if (expenseTx) {
      batch.set(wsDoc(uid, profileId, 'transactions', sanitizeId(expenseTx.id, 'tx')), {
        ...buildTransactionPayload(uid, expenseTx),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudAddSmartMemory(
  uidRaw: string,
  item: SmartMemoryItem,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(item.id, 'sm');
  const path = `${workspacePrefix(uid, profileId)}/smartMemory/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'smartMemory', id), {
      ...buildSmartMemoryPayload(uid, item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteSmartMemory(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'sm');
  const path = `${workspacePrefix(uid, profileId)}/smartMemory/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'smartMemory', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudAddCategory(
  uidRaw: string,
  cat: CategoryItem,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(cat.id, 'cat');
  const path = `${workspacePrefix(uid, profileId)}/categories/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'categories', id), {
      ...buildCategoryPayload(uid, cat),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteCategory(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'cat');
  const path = `${workspacePrefix(uid, profileId)}/categories/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'categories', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudAddQuickTemplate(
  uidRaw: string,
  tpl: QuickTemplate,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(tpl.id, 'qt');
  const path = `${workspacePrefix(uid, profileId)}/quickTemplates/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'quickTemplates', id), {
      ...buildQuickTemplatePayload(uid, tpl),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteQuickTemplate(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'qt');
  const path = `${workspacePrefix(uid, profileId)}/quickTemplates/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'quickTemplates', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveCategoryBudget(
  uidRaw: string,
  cb: CategoryBudget,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(cb.id, 'cb');
  const path = `${workspacePrefix(uid, profileId)}/categoryBudgets/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'categoryBudgets', id), {
      ...buildCategoryBudgetPayload(uid, cb),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteCategoryBudget(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'cb');
  const path = `${workspacePrefix(uid, profileId)}/categoryBudgets/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'categoryBudgets', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveRecurringBill(
  uidRaw: string,
  bill: RecurringBill,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(bill.id, 'bill');
  const path = `${workspacePrefix(uid, profileId)}/recurringBills/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'recurringBills', id), {
      ...buildRecurringBillPayload(uid, bill),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteRecurringBill(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'bill');
  const path = `${workspacePrefix(uid, profileId)}/recurringBills/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'recurringBills', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudPayRecurringBill(
  uidRaw: string,
  bill: RecurringBill,
  expenseTx: Transaction,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(bill.id, 'bill');
  const txId = sanitizeId(expenseTx.id, 'tx');
  const path = `${workspacePrefix(uid, profileId)}/recurringBills/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(wsDoc(uid, profileId, 'recurringBills', id), {
      ...buildRecurringBillPayload(uid, bill),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(wsDoc(uid, profileId, 'transactions', txId), {
      ...buildTransactionPayload(uid, expenseTx),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudSaveFinancialNote(
  uidRaw: string,
  note: FinancialNote,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(note.id, 'note');
  const path = `${workspacePrefix(uid, profileId)}/financialNotes/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'financialNotes', id), {
      ...buildFinancialNotePayload(uid, note),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteFinancialNote(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'note');
  const path = `${workspacePrefix(uid, profileId)}/financialNotes/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'financialNotes', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveDailyTask(
  uidRaw: string,
  task: DailyTask,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(task.id, 'task');
  const path = `${workspacePrefix(uid, profileId)}/dailyTasks/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'dailyTasks', id), {
      ...buildDailyTaskPayload(uid, task),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteDailyTask(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'task');
  const path = `${workspacePrefix(uid, profileId)}/dailyTasks/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'dailyTasks', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveVaultItem(
  uidRaw: string,
  item: VaultItem,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(item.id, 'vault');
  const path = `${workspacePrefix(uid, profileId)}/vaultItems/${id}`;
  try {
    await setDoc(wsDoc(uid, profileId, 'vaultItems', id), {
      ...buildVaultItemPayload(uid, item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudDeleteVaultItem(
  uidRaw: string,
  idRaw: string,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'vault');
  const path = `${workspacePrefix(uid, profileId)}/vaultItems/${id}`;
  try {
    await deleteDoc(wsDoc(uid, profileId, 'vaultItems', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function createEmptyCloudFallbackState(): CashTraceState {
  return createInitialState();
}
