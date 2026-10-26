import { getDB, type Khata } from './db';
import { saveOrShareFile } from './share';

// Same JSON format as the mobile app's {book}_hisab.json backups, so a book
// exported from the phone app can be imported here and vice versa.
const FORMAT_VERSION = 1;

function safeFileName(name: string): string {
  // Keep Urdu/Pashto chars too so the name stays readable
  return name.replace(/[^a-zA-Z0-9؀-ۿݐ-ݿ]/g, '_');
}

export async function exportKhata(khata: Khata): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const db = await getDB();
  const accounts = await db.getAllFromIndex('accounts', 'by_khata', khata.id);
  const accountsWithTxns = await Promise.all(accounts.map(async account => {
    const txns = await db.getAllFromIndex('transactions', 'by_account', account.id);
    txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    return { ...account, transactions: txns };
  }));

  const payload = {
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    khata,
    accounts: accountsWithTxns,
  };
  const fileName = `${safeFileName(khata.name || 'book')}_hisab.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  return saveOrShareFile(blob, fileName, `Hisab Kitab — ${khata.name} backup`);
}

export interface ImportStats { khatas: number; accounts: number; transactions: number }

/** Merge a backup into the local data: finds-or-creates the book and contacts by name, skips duplicate entries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mergeKhataJson(json: any): Promise<ImportStats> {
  if (!json?.khata?.name) throw new Error('Invalid backup file: missing khata data.');
  const db = await getDB();
  const stats: ImportStats = { khatas: 0, accounts: 0, transactions: 0 };
  const tx = db.transaction(['khata', 'accounts', 'transactions'], 'readwrite');
  const impK = json.khata;

  const existingK = (await tx.objectStore('khata').getAll()).find(k => k.name === impK.name);
  let khataId: number;
  if (existingK) {
    khataId = existingK.id;
  } else {
    khataId = await tx.objectStore('khata').add({
      name: impK.name,
      ...(impK.phone ? { phone: impK.phone } : {}),
      created_at: impK.created_at ?? new Date().toISOString(),
    } as Khata);
    stats.khatas++;
  }

  const existingAccounts = await tx.objectStore('accounts').index('by_khata').getAll(khataId);
  for (const impA of json.accounts ?? []) {
    if (!impA?.name || (impA.type !== 'customer' && impA.type !== 'supplier')) continue;
    let accountId: number;
    const found = existingAccounts.find(a => a.name === impA.name && a.type === impA.type);
    if (found) {
      accountId = found.id;
    } else {
      const acc = {
        khata_id: khataId,
        type: impA.type,
        name: impA.name,
        ...(impA.phone ? { phone: impA.phone } : {}),
        ...(impA.address ? { address: impA.address } : {}),
        ...(impA.notes ? { notes: impA.notes } : {}),
        opening_balance: Number(impA.opening_balance) || 0,
        opening_balance_type: impA.opening_balance_type === 'cr' ? 'cr' : 'dr',
        created_at: impA.created_at ?? new Date().toISOString(),
      } as const;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountId = await tx.objectStore('accounts').add(acc as any);
      existingAccounts.push({ ...acc, id: accountId });
      stats.accounts++;
    }

    const existingT = await tx.objectStore('transactions').index('by_account').getAll(accountId);
    for (const impT of impA.transactions ?? []) {
      if (!impT?.date) continue;
      const desc = impT.description ?? null;
      const debit = Number(impT.debit) || 0;
      const credit = Number(impT.credit) || 0;
      const dup = existingT.some(t =>
        t.date === impT.date && t.debit === debit && t.credit === credit && (t.description ?? null) === desc);
      if (dup) continue;
      const t = {
        account_id: accountId, date: impT.date, debit, credit,
        ...(desc ? { description: desc } : {}),
        ...(impT.due_date ? { due_date: impT.due_date } : {}),
        created_at: impT.created_at ?? new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = await tx.objectStore('transactions').add(t as any);
      existingT.push({ ...t, id });
      stats.transactions++;
    }
  }
  await tx.done;
  return stats;
}

export async function readBackupFile(file: File): Promise<ImportStats> {
  const raw = await file.text();
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error('This file is not a valid Hisab Kitab backup (.json).'); }
  return mergeKhataJson(json);
}
