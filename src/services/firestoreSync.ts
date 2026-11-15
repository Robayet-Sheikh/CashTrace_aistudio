import {User} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
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
  CategoryItem,
  DebtRecord,
  MonthStore,
  QuickTemplate,
  SavingsGoal,
  ShoppingItem,
  ShoppingList,
  SmartMemoryItem,
  Transaction,
  UserProfile,
  WalletAccount,
} from '../types';
import {getLocalDateStr, getLocalMonthKey} from '../utils/formatters';
import {
  createInitialState,
  DEFAULT_CATEGORIES,
  DEFAULT_QUICK_TEMPLATES,
  DEFAULT_WALLETS,
} from '../utils/storage';

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

function buildProfilePayload(uid: string, email: string, profile: UserProfile) {
  const pin = sanitizePin(profile.pin);
  return {
    ownerId: uid,
    email: clampStr(email || 'user@cashtrace.app', BLUEPRINT_LIMITS.MAX_EMAIL, 'user@cashtrace.app'),
    name: clampStr(profile.name, BLUEPRINT_LIMITS.MAX_NAME, 'ইউজার'),
    currency: clampStr(profile.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳'),
    pin,
    pinLock: Boolean(profile.pinLock && pin.length === 4),
    darkMode: Boolean(profile.darkMode),
    hideBalance: Boolean(profile.hideBalance),
    language: (profile.language === 'en' ? 'en' : 'bn') as 'bn' | 'en',
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

type BatchOp = {
  ref: ReturnType<typeof doc>;
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

export async function uploadFullStateToCloud(
  user: User,
  state: CashTraceState,
  onlyMissing = false
): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  await ensureUserRootDoc(user, state.profile);

  let existingTxIds = new Set<string>();
  let existingDebtIds = new Set<string>();
  let existingGoalIds = new Set<string>();
  let existingListIds = new Set<string>();
  let existingWalletIds = new Set<string>();
  let existingCategoryIds = new Set<string>();
  let existingBudgetKeys = new Set<string>();

  if (onlyMissing) {
    try {
      const [txS, debtS, goalS, listS, walS, catS, budS] = await Promise.all([
        getDocs(query(collection(db, 'users', uid, 'transactions'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'debts'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'savingsGoals'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'shoppingLists'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'wallets'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'categories'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'users', uid, 'monthBudgets'), where('ownerId', '==', uid))),
      ]);
      existingTxIds = new Set(txS.docs.map((d) => d.id));
      existingDebtIds = new Set(debtS.docs.map((d) => d.id));
      existingGoalIds = new Set(goalS.docs.map((d) => d.id));
      existingListIds = new Set(listS.docs.map((d) => d.id));
      existingWalletIds = new Set(walS.docs.map((d) => d.id));
      existingCategoryIds = new Set(catS.docs.map((d) => d.id));
      existingBudgetKeys = new Set(budS.docs.map((d) => d.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users/${uid}`);
    }
  }

  const level1Ops: BatchOp[] = [];
  const listItemOps: BatchOp[] = [];

  state.wallets.forEach((w) => {
    const id = sanitizeId(w.id, 'wallet');
    if (!onlyMissing || !existingWalletIds.has(id)) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'wallets', id),
        data: buildWalletPayload(uid, w),
      });
    }
  });

  state.categories.forEach((c) => {
    const id = sanitizeId(c.id, 'cat');
    if (!onlyMissing || !existingCategoryIds.has(id)) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'categories', id),
        data: buildCategoryPayload(uid, c),
      });
    }
  });

  if (!onlyMissing) {
    state.smartMemory.forEach((sm) => {
      const id = sanitizeId(sm.id, 'sm');
      level1Ops.push({
        ref: doc(db, 'users', uid, 'smartMemory', id),
        data: buildSmartMemoryPayload(uid, sm),
      });
    });

    state.quickTemplates.forEach((qt) => {
      const id = sanitizeId(qt.id, 'qt');
      level1Ops.push({
        ref: doc(db, 'users', uid, 'quickTemplates', id),
        data: buildQuickTemplatePayload(uid, qt),
      });
    });
  }

  Object.entries(state.months).forEach(([mKeyRaw, mStore]) => {
    const mKey = sanitizeMonthKey(mKeyRaw);
    if ((mStore.budgetCap || 0) > 0 && (!onlyMissing || !existingBudgetKeys.has(mKey))) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'monthBudgets', mKey),
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
          ref: doc(db, 'users', uid, 'transactions', id),
          data: buildTransactionPayload(uid, tx),
        });
      }
    });
  });

  state.debts.forEach((d) => {
    const id = sanitizeId(d.id, 'debt');
    if (!onlyMissing || !existingDebtIds.has(id)) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'debts', id),
        data: buildDebtPayload(uid, d),
      });
    }
  });

  state.savingsGoals.forEach((g) => {
    const id = sanitizeId(g.id, 'goal');
    if (!onlyMissing || !existingGoalIds.has(id)) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'savingsGoals', id),
        data: buildSavingsGoalPayload(uid, g),
      });
    }
  });

  state.shoppingLists.forEach((lst) => {
    const listId = sanitizeId(lst.id, 'list');
    if (!onlyMissing || !existingListIds.has(listId)) {
      level1Ops.push({
        ref: doc(db, 'users', uid, 'shoppingLists', listId),
        data: buildShoppingListPayload(uid, lst),
      });
      lst.items.forEach((it) => {
        const itemId = sanitizeId(it.id, 'sitem');
        listItemOps.push({
          ref: doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId),
          data: buildShoppingItemPayload(uid, listId, it),
        });
      });
    }
  });

  if (level1Ops.length > 0) {
    await commitBatchOps(level1Ops, `users/${uid}`);
  }
  if (listItemOps.length > 0) {
    await commitBatchOps(listItemOps, `users/${uid}/shoppingLists/items`);
  }
}

export interface CloudSyncHandles {
  knownBudgetKeys: Set<string>;
}

export function subscribeToUserCloudData(
  user: User,
  onHydrate: (updater: (prev: CashTraceState) => CashTraceState) => void,
  onSyncActivity?: (syncing: boolean) => void
): () => void {
  const uid = sanitizeId(user.uid, 'user');
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

  // 1. User Profile Doc
  const userPath = `users/${uid}`;
  unsubscribers.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        onSyncActivity?.(false);
        if (!snap.exists()) return;
        const data = snap.data();
        onHydrate((prev) => ({
          ...prev,
          profile: {
            name: String(data.name || prev.profile.name),
            currency: String(data.currency || prev.profile.currency),
            pin: String(data.pin || ''),
            pinLock: Boolean(data.pinLock && String(data.pin || '').length === 4),
            darkMode: Boolean(data.darkMode),
            hideBalance: Boolean(data.hideBalance),
            language: data.language === 'en' ? 'en' : 'bn',
          },
        }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    )
  );

  // 2. Wallets
  const walletsPath = `users/${uid}/wallets`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'wallets'), where('ownerId', '==', uid)),
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
  const catPath = `users/${uid}/categories`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'categories'), where('ownerId', '==', uid)),
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
  const smPath = `users/${uid}/smartMemory`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'smartMemory'), where('ownerId', '==', uid)),
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
  const qtPath = `users/${uid}/quickTemplates`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'quickTemplates'), where('ownerId', '==', uid)),
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

  // 6 & 7. Month Budgets + Transactions (combined cleanly into state.months)
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

  const budgetsPath = `users/${uid}/monthBudgets`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'monthBudgets'), where('ownerId', '==', uid)),
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

  const txPath = `users/${uid}/transactions`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'transactions'), where('ownerId', '==', uid)),
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
  const debtsPath = `users/${uid}/debts`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'debts'), where('ownerId', '==', uid)),
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
  const goalsPath = `users/${uid}/savingsGoals`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'savingsGoals'), where('ownerId', '==', uid)),
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
  const listsPath = `users/${uid}/shoppingLists`;
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'shoppingLists'), where('ownerId', '==', uid)),
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

        // Clean up removed list item listeners
        for (const [listId, unsub] of itemUnsubs.entries()) {
          if (!activeIds.has(listId)) {
            unsub();
            itemUnsubs.delete(listId);
            itemsByList.delete(listId);
          }
        }

        // Attach listener for newly discovered lists
        currentListMeta.forEach((meta) => {
          if (!itemUnsubs.has(meta.id)) {
            const itemsPath = `users/${uid}/shoppingLists/${meta.id}/items`;
            const unsub = onSnapshot(
              query(
                collection(db, 'users', uid, 'shoppingLists', meta.id, 'items'),
                where('ownerId', '==', uid)
              ),
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

  return () => {
    unsubscribers.forEach((u) => u());
    itemUnsubs.forEach((u) => u());
    itemUnsubs.clear();
  };
}

// --- Granular Cloud Write Operations (Blueprint-Sanitized) ---

export async function cloudUpdateProfile(user: User, nextProfile: UserProfile): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const pin = sanitizePin(nextProfile.pin);
  try {
    await ensureUserRootDoc(user, nextProfile);
    await updateDoc(ref, {
      name: clampStr(nextProfile.name, BLUEPRINT_LIMITS.MAX_NAME, 'ইউজার'),
      currency: clampStr(nextProfile.currency, BLUEPRINT_LIMITS.MAX_CURRENCY, '৳'),
      pin,
      pinLock: Boolean(nextProfile.pinLock && pin.length === 4),
      darkMode: Boolean(nextProfile.darkMode),
      hideBalance: Boolean(nextProfile.hideBalance),
      language: nextProfile.language === 'en' ? 'en' : 'bn',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudUpdateWalletInitial(uidRaw: string, wallet: WalletAccount): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const wid = sanitizeId(wallet.id, 'wallet');
  const path = `users/${uid}/wallets/${wid}`;
  const ref = doc(db, 'users', uid, 'wallets', wid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        initialBalance: clampNum(wallet.initialBalance, -BLUEPRINT_LIMITS.MAX_NUM),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...buildWalletPayload(uid, wallet),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function cloudSaveTransaction(
  uidRaw: string,
  tx: Transaction,
  isEdit: boolean
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const txId = sanitizeId(tx.id, 'tx');
  const path = `users/${uid}/transactions/${txId}`;
  const ref = doc(db, 'users', uid, 'transactions', txId);
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

export async function cloudCreateTransactionsBatch(uidRaw: string, txs: Transaction[]): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const ops: BatchOp[] = txs.map((tx) => ({
    ref: doc(db, 'users', uid, 'transactions', sanitizeId(tx.id, 'tx')),
    data: buildTransactionPayload(uid, tx),
  }));
  await commitBatchOps(ops, `users/${uid}/transactions`);
}

export async function cloudDeleteTransaction(uidRaw: string, txIdRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const txId = sanitizeId(txIdRaw, 'tx');
  const path = `users/${uid}/transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveMonthBudget(
  uidRaw: string,
  monthKeyRaw: string,
  budgetCap: number
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const mKey = sanitizeMonthKey(monthKeyRaw);
  const path = `users/${uid}/monthBudgets/${mKey}`;
  const ref = doc(db, 'users', uid, 'monthBudgets', mKey);
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
  optionalTx?: Transaction
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debt.id, 'debt');
  const path = `users/${uid}/debts/${debtId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'debts', debtId), {
      ...buildDebtPayload(uid, debt),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (optionalTx) {
      const txId = sanitizeId(optionalTx.id, 'tx');
      batch.set(doc(db, 'users', uid, 'transactions', txId), {
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

export async function cloudPayDebt(
  uidRaw: string,
  debtIdRaw: string,
  nextPaidAmount: number,
  nextSettled: boolean,
  optionalTx?: Transaction
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debtIdRaw, 'debt');
  const path = `users/${uid}/debts/${debtId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'debts', debtId), {
      paidAmount: clampNum(nextPaidAmount, 0),
      settled: Boolean(nextSettled),
      updatedAt: serverTimestamp(),
    });
    if (optionalTx) {
      const txId = sanitizeId(optionalTx.id, 'tx');
      batch.set(doc(db, 'users', uid, 'transactions', txId), {
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

export async function cloudDeleteDebt(uidRaw: string, debtIdRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const debtId = sanitizeId(debtIdRaw, 'debt');
  const path = `users/${uid}/debts/${debtId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'debts', debtId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudSaveSavingsGoal(
  uidRaw: string,
  goal: SavingsGoal,
  isNew: boolean
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const goalId = sanitizeId(goal.id, 'goal');
  const path = `users/${uid}/savingsGoals/${goalId}`;
  const ref = doc(db, 'users', uid, 'savingsGoals', goalId);
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

export async function cloudDeleteSavingsGoal(uidRaw: string, goalIdRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const goalId = sanitizeId(goalIdRaw, 'goal');
  const path = `users/${uid}/savingsGoals/${goalId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'savingsGoals', goalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudCreateShoppingList(uidRaw: string, list: ShoppingList): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(list.id, 'list');
  const path = `users/${uid}/shoppingLists/${listId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'shoppingLists', listId), {
      ...buildShoppingListPayload(uid, list),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteShoppingList(uidRaw: string, list: ShoppingList): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(list.id, 'list');
  const path = `users/${uid}/shoppingLists/${listId}`;
  try {
    // Delete child items BEFORE deleting parent list so isParentListOwner succeeds
    if (list.items.length > 0) {
      const batch = writeBatch(db);
      list.items.forEach((it) => {
        batch.delete(
          doc(db, 'users', uid, 'shoppingLists', listId, 'items', sanitizeId(it.id, 'sitem'))
        );
      });
      await batch.commit();
    }
    await deleteDoc(doc(db, 'users', uid, 'shoppingLists', listId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudCreateShoppingItem(
  uidRaw: string,
  listIdRaw: string,
  item: ShoppingItem
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(item.id, 'sitem');
  const path = `users/${uid}/shoppingLists/${listId}/items/${itemId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId), {
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
  item: ShoppingItem
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(item.id, 'sitem');
  const path = `users/${uid}/shoppingLists/${listId}/items/${itemId}`;
  const payload = buildShoppingItemPayload(uid, listId, item);
  try {
    const patch: Record<string, unknown> = {
      name: payload.name,
      checked: payload.checked,
      quantity: 'quantity' in payload ? payload.quantity : deleteField(),
      estimatedPrice: 'estimatedPrice' in payload ? payload.estimatedPrice : deleteField(),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cloudDeleteShoppingItem(
  uidRaw: string,
  listIdRaw: string,
  itemIdRaw: string
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const itemId = sanitizeId(itemIdRaw, 'sitem');
  const path = `users/${uid}/shoppingLists/${listId}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudClearCheckedShoppingItems(
  uidRaw: string,
  listIdRaw: string,
  checkedItemIds: string[],
  expenseTx?: Transaction
): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const listId = sanitizeId(listIdRaw, 'list');
  const path = `users/${uid}/shoppingLists/${listId}/items`;
  try {
    const batch = writeBatch(db);
    checkedItemIds.forEach((id) => {
      batch.delete(doc(db, 'users', uid, 'shoppingLists', listId, 'items', sanitizeId(id, 'sitem')));
    });
    if (expenseTx) {
      batch.set(doc(db, 'users', uid, 'transactions', sanitizeId(expenseTx.id, 'tx')), {
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

export async function cloudAddSmartMemory(uidRaw: string, item: SmartMemoryItem): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(item.id, 'sm');
  const path = `users/${uid}/smartMemory/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'smartMemory', id), {
      ...buildSmartMemoryPayload(uid, item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteSmartMemory(uidRaw: string, idRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'sm');
  const path = `users/${uid}/smartMemory/${id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'smartMemory', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudAddCategory(uidRaw: string, cat: CategoryItem): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(cat.id, 'cat');
  const path = `users/${uid}/categories/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'categories', id), {
      ...buildCategoryPayload(uid, cat),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteCategory(uidRaw: string, idRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'cat');
  const path = `users/${uid}/categories/${id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'categories', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function cloudAddQuickTemplate(uidRaw: string, tpl: QuickTemplate): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(tpl.id, 'qt');
  const path = `users/${uid}/quickTemplates/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'quickTemplates', id), {
      ...buildQuickTemplatePayload(uid, tpl),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cloudDeleteQuickTemplate(uidRaw: string, idRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw, 'user');
  const id = sanitizeId(idRaw, 'qt');
  const path = `users/${uid}/quickTemplates/${id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'quickTemplates', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function createEmptyCloudFallbackState(): CashTraceState {
  return createInitialState();
}
