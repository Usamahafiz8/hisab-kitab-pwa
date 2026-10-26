import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// IndexedDB port of the app's SQLite schema (khata / accounts / transactions /
// settings). The service worker (public/sw.js) opens the same database to fire
// reminders in the background, so DB_NAME / DB_VERSION / store names must stay
// in sync with it.
export const DB_NAME = 'hisab_kitab';
export const DB_VERSION = 1;

export interface Khata {
  id: number;
  name: string;
  name_ur?: string;
  phone?: string;
  address?: string;
  logo_uri?: string;
  created_at: string;
}

export interface Account {
  id: number;
  khata_id: number;
  type: 'customer' | 'supplier';
  name: string;
  phone?: string;
  address?: string;
  opening_balance: number;
  opening_balance_type: 'dr' | 'cr';
  notes?: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string; // YYYY-MM-DD (local)
  description?: string;
  debit: number;
  credit: number;
  due_date?: string;
  created_at: string; // ISO timestamp — carries the entry's time of day
  running_balance?: number;
}

export interface Reminder {
  id: string;
  fire_at: number; // epoch ms
  title: string;
  body: string;
  fired: boolean;
}

interface HisabDB extends DBSchema {
  khata: { key: number; value: Khata };
  accounts: { key: number; value: Account; indexes: { by_khata: number } };
  transactions: { key: number; value: Transaction; indexes: { by_account: number } };
  settings: { key: string; value: { key: string; value: string } };
  reminders: { key: string; value: Reminder };
}

export type DB = IDBPDatabase<HisabDB>;

let dbPromise: Promise<DB> | null = null;

export function getDB(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDB<HisabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('khata', { keyPath: 'id', autoIncrement: true });
        const a = db.createObjectStore('accounts', { keyPath: 'id', autoIncrement: true });
        a.createIndex('by_khata', 'khata_id');
        const t = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        t.createIndex('by_account', 'account_id');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('reminders', { keyPath: 'id' });
      },
    }).then(async db => {
      await seedIfEmpty(db);
      return db;
    });
  }
  return dbPromise;
}

// Same demo book the mobile app ships with on first launch.
async function seedIfEmpty(db: DB) {
  if ((await db.count('khata')) > 0) return;
  if ((await db.get('settings', 'seeded'))?.value === '1') return;
  const now = new Date().toISOString();
  const tx = db.transaction(['khata', 'accounts', 'transactions', 'settings'], 'readwrite');
  const khataId = await tx.objectStore('khata').add({ name: 'Rana General Store', phone: '0300-1234567', created_at: now } as Khata);
  const accounts = tx.objectStore('accounts');
  const acct1 = await accounts.add({
    khata_id: khataId, type: 'customer', name: 'Ahmad Khan', phone: '0311-9876543',
    opening_balance: 5000, opening_balance_type: 'dr', created_at: now,
  } as Account);
  await accounts.add({
    khata_id: khataId, type: 'customer', name: 'Bilal Ahmed', phone: '0321-1111222',
    opening_balance: 0, opening_balance_type: 'dr', created_at: now,
  } as Account);
  await accounts.add({
    khata_id: khataId, type: 'supplier', name: 'Al-Noor Traders', phone: '0333-4445556',
    opening_balance: 12000, opening_balance_type: 'cr', created_at: now,
  } as Account);
  const txns = tx.objectStore('transactions');
  await txns.add({
    account_id: acct1, date: '2026-06-01', description: 'Maal di sale', debit: 3500, credit: 0,
    due_date: '2026-06-20', created_at: '2026-06-01T05:00:00.000Z',
  } as Transaction);
  await txns.add({
    account_id: acct1, date: '2026-06-10', description: 'Partial payment received', debit: 0, credit: 1500,
    created_at: '2026-06-10T05:00:00.000Z',
  } as Transaction);
  // Remember that seeding happened, so deleting every book doesn't bring the demo back.
  await tx.objectStore('settings').put({ key: 'seeded', value: '1' });
  await tx.done;
}

/** Drop undefined fields so updates don't write `undefined` over real values unintentionally. */
export function clean<T extends object>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k];
  return out;
}
