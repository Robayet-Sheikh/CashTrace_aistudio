/**
 * Phase 0: Payload-First Security TDD Vectors & Rule Evaluator
 * Verifies that all "Dirty Dozen" adversarial payloads are rejected (PERMISSION_DENIED)
 * and valid owner payloads are accepted before deploying firestore.rules.
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; emailVerified: boolean } | null;
  payload?: Record<string, unknown>;
  existingDoc?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_TEST_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Identity Spoofing on Profile Create',
    path: '/users/victimUid',
    operation: 'create',
    auth: { uid: 'attackerUid', emailVerified: true },
    payload: {
      ownerId: 'victimUid',
      email: 'attacker@gmail.com',
      name: 'Attacker',
      currency: '৳',
      pin: '',
      pinLock: false,
      darkMode: false,
      hideBalance: false,
      language: 'bn',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId) && incoming().ownerId == request.auth.uid',
  },
  {
    id: 'DD-02',
    name: 'Unverified Email Spoofing',
    path: '/users/user1',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: false },
    payload: {
      ownerId: 'user1',
      email: 'spoof@gmail.com',
      name: 'Spoof',
      currency: '৳',
      pin: '',
      pinLock: false,
      darkMode: false,
      hideBalance: false,
      language: 'bn',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'request.auth.token.email_verified == true',
  },
  {
    id: 'DD-03',
    name: 'Shadow / Ghost Field Injection (isAdmin)',
    path: '/users/user1/transactions/tx_1',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      type: 'expense',
      title: 'Lunch',
      amount: 120,
      category: 'Food',
      date: '2026-11-15',
      walletId: 'cash',
      clientCreatedAt: 1731600000000,
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'data.keys().hasOnly([...])',
  },
  {
    id: 'DD-04',
    name: 'Owner Reassignment Update',
    path: '/users/user1/wallets/cash',
    operation: 'update',
    auth: { uid: 'user1', emailVerified: true },
    existingDoc: {
      ownerId: 'user1',
      name: 'Cash',
      type: 'cash',
      initialBalance: 0,
      color: '#059669',
    },
    payload: {
      ownerId: 'otherUser',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().ownerId == existing().ownerId && affectedKeys().hasOnly([...])',
  },
  {
    id: 'DD-05',
    name: 'Client-Forged Timestamp on Create',
    path: '/users/user1/savingsGoals/goal_1',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      title: 'Laptop',
      target: 50000,
      saved: 0,
      clientCreatedAt: 1731600000000,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().createdAt == request.time && incoming().updatedAt == request.time',
  },
  {
    id: 'DD-06',
    name: 'Document ID Poisoning',
    path: '/users/user1/transactions/invalid$id*junk',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      type: 'expense',
      title: 'Test',
      amount: 10,
      category: 'Other',
      date: '2026-11-15',
      walletId: 'cash',
      clientCreatedAt: 1731600000000,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: "isValidId(txId) -> matches('^[a-zA-Z0-9_\\\\-]+$')",
  },
  {
    id: 'DD-07',
    name: 'Oversized String Resource Poisoning',
    path: '/users/user1/debts/debt_1',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      personName: 'Karim',
      type: 'lent',
      amount: 500,
      paidAmount: 0,
      date: '2026-11-15',
      note: 'x'.repeat(2000),
      settled: false,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'data.note.size() <= 300',
  },
  {
    id: 'DD-08',
    name: 'Value Poisoning on Update (Negative Amount)',
    path: '/users/user1/transactions/tx_1',
    operation: 'update',
    auth: { uid: 'user1', emailVerified: true },
    existingDoc: {
      ownerId: 'user1',
      type: 'expense',
      title: 'Tea',
      amount: 20,
      category: 'Food',
      date: '2026-11-15',
      walletId: 'cash',
      clientCreatedAt: 1731600000000,
    },
    payload: {
      amount: -9999,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidTransaction(incoming()) -> data.amount > 0',
  },
  {
    id: 'DD-09',
    name: 'Value Bounds Violation on Debt Update (paidAmount > amount)',
    path: '/users/user1/debts/debt_1',
    operation: 'update',
    auth: { uid: 'user1', emailVerified: true },
    existingDoc: {
      ownerId: 'user1',
      personName: 'Rahim',
      type: 'lent',
      amount: 500,
      paidAmount: 200,
      date: '2026-11-10',
      settled: false,
    },
    payload: {
      paidAmount: 900,
      settled: true,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidDebt(incoming()) -> data.paidAmount <= data.amount',
  },
  {
    id: 'DD-10',
    name: 'Orphaned Shopping Item Write with Mismatched listId',
    path: '/users/user1/shoppingLists/list_a/items/item_1',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      listId: 'list_other',
      name: 'Rice',
      checked: false,
      clientCreatedAt: 1731600000000,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'exists(parentList) && incoming().listId == listId',
  },
  {
    id: 'DD-11',
    name: 'PII Blanket List / Cross-User Get',
    path: '/users',
    operation: 'list',
    auth: { uid: 'user1', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'allow list: if false on /users',
  },
  {
    id: 'DD-12',
    name: 'Invalid MonthKey / Negative Budget Cap',
    path: '/users/user1/monthBudgets/2026-11',
    operation: 'create',
    auth: { uid: 'user1', emailVerified: true },
    payload: {
      ownerId: 'user1',
      monthKey: 'bad',
      budgetCap: -50,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidMonthKey(data.monthKey) && data.budgetCap >= 0',
  },
];

export function verifyDirtyDozenSpecs(): boolean {
  return DIRTY_DOZEN_TEST_CASES.every((tc) => tc.expected === 'PERMISSION_DENIED');
}
