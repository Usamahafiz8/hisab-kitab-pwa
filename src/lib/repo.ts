import { getDB, clean, type Account, type Khata, type Transaction, type Reminder } from './db';
import { signedBalance, withRunningBalances } from './ledgerMath';

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  return (await db.get('settings', key))?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}

// ── Khata (books) ───────────────────────────────────────────────────────────

export async function getAllKhatas(): Promise<Khata[]> {
  const db = await getDB();
  const all = await db.getAll('khata');
  return all.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
}

export async function createKhata(data: Omit<Khata, 'id' | 'created_at'>): Promise<number> {
  const db = await getDB();
  return db.add('khata', clean({ ...data, created_at: new Date().toISOString() }) as Khata);
}

export async function updateKhata(id: number, data: Partial<Omit<Khata, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('khata', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) {
    const next = { ...cur, ...data };
    // An emptied optional field is removed rather than stored as undefined
    for (const k of Object.keys(data) as (keyof typeof data)[]) if (data[k] === undefined) delete next[k];
    await tx.store.put(next);
  }
  await tx.done;
}

export async function deleteKhata(id: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['khata', 'accounts', 'transactions'], 'readwrite');
  const accounts = await tx.objectStore('accounts').index('by_khata').getAllKeys(id);
  const txIndex = tx.objectStore('transactions').index('by_account');
  for (const accId of accounts) {
    for (const tId of await txIndex.getAllKeys(accId)) await tx.objectStore('transactions').delete(tId);
    await tx.objectStore('accounts').delete(accId);
  }
  await tx.objectStore('khata').delete(id);
  await tx.done;
}

export interface KhataSummary {
  khata_id: number;
  contacts: number;
  net: number; // sum of every contact's signed balance
}

export async function getKhataSummaries(): Promise<Record<number, KhataSummary>> {
  const db = await getDB();
  const [accounts, txns] = await Promise.all([db.getAll('accounts'), db.getAll('transactions')]);
  const netByAccount = new Map<number, number>();
  for (const t of txns) netByAccount.set(t.account_id, (netByAccount.get(t.account_id) ?? 0) + t.debit - t.credit);
  const map: Record<number, KhataSummary> = {};
  for (const a of accounts) {
    const s = (map[a.khata_id] ??= { khata_id: a.khata_id, contacts: 0, net: 0 });
    s.contacts++;
    s.net += signedBalance(a.opening_balance, a.opening_balance_type) + (netByAccount.get(a.id) ?? 0);
  }
  return map;
}

// ── Accounts (contacts) ─────────────────────────────────────────────────────

export async function getAccountById(id: number): Promise<Account | null> {
  const db = await getDB();
  return (await db.get('accounts', id)) ?? null;
}

export type AccountInput = Omit<Account, 'id' | 'created_at'>;

export async function createAccount(data: AccountInput): Promise<number> {
  const db = await getDB();
  return db.add('accounts', clean({ ...data, created_at: new Date().toISOString() }) as Account);
}

export async function updateAccount(id: number, data: Partial<AccountInput>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('accounts', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) {
    const next = { ...cur, ...data };
    for (const k of Object.keys(data) as (keyof typeof data)[]) if (data[k] === undefined) delete next[k];
    await tx.store.put(next);
  }
  await tx.done;
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['accounts', 'transactions'], 'readwrite');
  for (const tId of await tx.objectStore('transactions').index('by_account').getAllKeys(id)) {
    await tx.objectStore('transactions').delete(tId);
  }
  await tx.objectStore('accounts').delete(id);
  await tx.done;
}

export interface AccountPeriodSummary {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  type: 'customer' | 'supplier';
  opening_balance: number;
  opening_balance_type: 'dr' | 'cr';
  created_at: string;
  period_opening: number; // signed: + = Dr (you receive)
  period_dr: number;
  period_cr: number;
  period_closing: number; // signed
  last_txn_date?: string;
  last_txn_at?: string;
}

export async function getAccountsWithPeriodBalance(
  khataId: number,
  type: 'customer' | 'supplier' | null,
  fromDate: string | null,
  toDate: string | null,
): Promise<AccountPeriodSummary[]> {
  const db = await getDB();
  const from = fromDate ?? '0000-01-01';
  const to = toDate ?? '9999-12-31';
  const tx = db.transaction(['accounts', 'transactions'], 'readonly');
  let accounts = await tx.objectStore('accounts').index('by_khata').getAll(khataId);
  if (type) accounts = accounts.filter(a => a.type === type);
  const txIndex = tx.objectStore('transactions').index('by_account');

  const rows = await Promise.all(accounts.map(async a => {
    const txns = await txIndex.getAll(a.id);
    let preNet = 0, dr = 0, cr = 0;
    let lastDate: string | undefined, lastAt: string | undefined;
    for (const t of txns) {
      if (t.date < from) preNet += t.debit - t.credit;
      else if (t.date <= to) { dr += t.debit; cr += t.credit; }
      if (!lastDate || t.date > lastDate) lastDate = t.date;
      if (!lastAt || t.created_at > lastAt) lastAt = t.created_at;
    }
    const period_opening = signedBalance(a.opening_balance ?? 0, a.opening_balance_type ?? 'dr') + preNet;
    return {
      id: a.id, name: a.name, phone: a.phone, address: a.address, type: a.type,
      opening_balance: a.opening_balance ?? 0, opening_balance_type: a.opening_balance_type ?? 'dr',
      created_at: a.created_at,
      period_opening, period_dr: dr, period_cr: cr, period_closing: period_opening + dr - cr,
      last_txn_date: lastDate, last_txn_at: lastAt,
    } satisfies AccountPeriodSummary;
  }));

  // Most recently active first; contacts with no entries go last, newest first.
  return rows.sort((a, b) => {
    if (a.last_txn_at && b.last_txn_at) return a.last_txn_at < b.last_txn_at ? 1 : a.last_txn_at > b.last_txn_at ? -1 : 0;
    if (a.last_txn_at) return -1;
    if (b.last_txn_at) return 1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id;
  });
}

// ── Transactions ────────────────────────────────────────────────────────────

// Always works on ALL of the account's transactions so running balances are
// computed on the complete chronological sequence; date filtering is UI-side.
export async function getTransactionsWithRunningBalance(
  accountId: number,
  openingBalance: number,
  openingType: 'dr' | 'cr',
): Promise<Transaction[]> {
  const db = await getDB();
  const txns = await db.getAllFromIndex('transactions', 'by_account', accountId);
  return withRunningBalances(txns, openingBalance, openingType);
}

export type TransactionInput = Omit<Transaction, 'id' | 'running_balance'>;

export async function addTransaction(data: TransactionInput): Promise<number> {
  const db = await getDB();
  return db.add('transactions', clean({ ...data, debit: data.debit ?? 0, credit: data.credit ?? 0 }) as Transaction);
}

export async function updateTransaction(id: number, data: Partial<TransactionInput>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('transactions', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) {
    const next = { ...cur, ...data };
    delete next.running_balance;
    for (const k of Object.keys(data) as (keyof typeof data)[]) if (data[k] === undefined) delete next[k];
    await tx.store.put(next);
  }
  await tx.done;
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
  await db.delete('reminders', `due_${id}`);
}

// ── Reminders (fired by the service worker) ─────────────────────────────────

export async function putReminder(r: Reminder): Promise<void> {
  const db = await getDB();
  await db.put('reminders', r);
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('reminders', id);
}
