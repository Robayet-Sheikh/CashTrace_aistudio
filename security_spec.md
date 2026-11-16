# CashTrace Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}`, `/users/{userId}/profiles/{profileId}`, and their subcollections (`wallets`, `categories`, `smartMemory`, `quickTemplates`, `monthBudgets`, `transactions`, `debts`, `savingsGoals`, `shoppingLists`, `shoppingLists/{listId}/items`) must contain `ownerId == request.auth.uid`, and `userId` in the path must equal `request.auth.uid`.
2. **Verified Identity**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Master Gate Relational Sync**: Every subcollection operation (`get`, `create`, `update`, `delete`) validates that the parent `/users/{userId}` (and `/profiles/{profileId}` for secondary workspaces) document exists and its `ownerId == request.auth.uid`. Every shopping item operation also verifies the parent `shoppingLists/{listId}` exists and belongs to the user, and `incoming().listId == listId`.
4. **PII Isolation**: `/users/{userId}` contains `email`; `allow list` is explicitly `false` on `/users`, and `allow get` is strictly limited to the verified owner.
5. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` cannot be modified after creation. `createdAt` must equal `request.time` on creation; `updatedAt` must equal `request.time` on creation and update.
6. **Debt Numeric Invariants**: `DebtRecordDoc` updates allow editing details and reopening settled records while strictly enforcing `amount > 0`, `paidAmount >= 0 && paidAmount <= amount`, immutable `ownerId`/`createdAt`, and `affectedKeys().hasOnly(...)`.
7. **Zero Shadow Fields & Bounded Strings**: Every entity enforces `keys().hasAll(...) && keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, strict primitive types, numeric range bounds, regex patterns, and `.size()` limits on every string and document ID.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Profile Create** (`/users/victimUid` by `attackerUid`):
   ```json
   { "ownerId": "victimUid", "email": "attacker@gmail.com", "name": "Attacker", "currency": "৳", "pin": "", "pinLock": false, "darkMode": false, "hideBalance": false, "language": "bn" }
   ```
   Expected: `PERMISSION_DENIED` (path `userId != request.auth.uid` and `ownerId != request.auth.uid`).

2. **Unverified Email Spoofing** (`email_verified: false` creating `/users/{uid}`):
   ```json
   { "ownerId": "user1", "email": "spoof@gmail.com", "name": "Spoof", "currency": "৳", "pin": "", "pinLock": false, "darkMode": false, "hideBalance": false, "language": "bn" }
   ```
   Expected: `PERMISSION_DENIED` (`request.auth.token.email_verified == true` fails).

3. **Shadow / Ghost Field Injection** (`/users/{uid}/transactions/tx_1` with `isAdmin: true`):
   ```json
   { "ownerId": "user1", "type": "expense", "title": "Lunch", "amount": 120, "category": "Food", "date": "2026-11-15", "walletId": "cash", "clientCreatedAt": 1731600000000, "isAdmin": true }
   ```
   Expected: `PERMISSION_DENIED` (`keys().hasOnly(...)` rejects `isAdmin`).

4. **Owner Reassignment Update** (`/users/{uid}/wallets/cash` changing `ownerId`):
   ```json
   { "ownerId": "otherUser", "updatedAt": "<SERVER_TIME>" }
   ```
   Expected: `PERMISSION_DENIED` (`incoming().ownerId == existing().ownerId` and `affectedKeys().hasOnly(...)` reject `ownerId`).

5. **Client-Forged Timestamp** (`/users/{uid}/savingsGoals/goal_1` with backdated `createdAt`):
   ```json
   { "ownerId": "user1", "title": "Laptop", "target": 50000, "saved": 0, "clientCreatedAt": 1731600000000, "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "2020-01-01T00:00:00Z" }
   ```
   Expected: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

6. **ID Poisoning Attack** (`/users/{uid}/transactions/invalid$id*with/../../junk` or >128 chars):
   ```json
   { "ownerId": "user1", "type": "expense", "title": "Test", "amount": 10, "category": "Other", "date": "2026-11-15", "walletId": "cash", "clientCreatedAt": 1731600000000 }
   ```
   Expected: `PERMISSION_DENIED` (`isValidId(txId)` rejects non-`[a-zA-Z0-9_-]` or `>128` chars).

7. **1MB Resource Poisoning String** (`/users/{uid}/debts/debt_1` with 2000-char `note`):
   ```json
   { "ownerId": "user1", "personName": "Karim", "type": "lent", "amount": 500, "paidAmount": 0, "date": "2026-11-15", "note": "<2000_chars>", "settled": false }
   ```
   Expected: `PERMISSION_DENIED` (`note.size() <= 300` fails).

8. **Value / Type Poisoning on Update** (`/users/{uid}/transactions/tx_1` setting `amount: -9999` or `"NaN"`):
   ```json
   { "amount": -9999, "updatedAt": "<SERVER_TIME>" }
   ```
   Expected: `PERMISSION_DENIED` (`isValidTransaction(incoming())` enforces `amount > 0`).

9. **Terminal State Violation on Settled Debt** (updating `/users/{uid}/debts/debt_settled` after `settled == true`):
   ```json
   { "paidAmount": 0, "settled": false, "updatedAt": "<SERVER_TIME>" }
   ```
   Expected: `PERMISSION_DENIED` (`existing().settled == false` blocks post-settlement mutation).

10. **Orphaned Shopping Item Write** (`/users/{uid}/shoppingLists/nonexistent/items/item_1` or mismatched `listId`):
    ```json
    { "ownerId": "user1", "listId": "other_list", "name": "Rice", "checked": false, "clientCreatedAt": 1731600000000 }
    ```
    Expected: `PERMISSION_DENIED` (`exists()` parent list check + `incoming().listId == listId` fail).

11. **PII Blanket Read / List Scraping** (`list` query on `/users` or `get` on `/users/otherUid`):
    Expected: `PERMISSION_DENIED` (`allow list: if false` on `/users`, `allow get` requires `isOwner(userId)`).

12. **Unbounded Budget Cap / Invalid Date Format** (`/users/{uid}/monthBudgets/2026-11` with `monthKey: "bad"` or `budgetCap: -50`):
    ```json
    { "ownerId": "user1", "monthKey": "bad", "budgetCap": -50 }
    ```
    Expected: `PERMISSION_DENIED` (`isValidMonthKey` and `budgetCap >= 0` fail).
