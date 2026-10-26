export interface LedgerPeriod {
  periodOpening: number;
  totalDebit: number;
  totalCredit: number;
  periodClosing: number;
}

export type BalanceType = 'dr' | 'cr' | 'settled';

export function balanceTypeOf(signed: number): BalanceType {
  if (Math.abs(signed) < 0.005) return 'settled';
  return signed > 0 ? 'dr' : 'cr';
}

// Convert opening balance to a signed number.
// Dr = positive (contact owes you), Cr = negative (you owe them).
export function signedBalance(amount: number, type: 'dr' | 'cr'): number {
  return type === 'dr' ? amount : -amount;
}

// Attach a running_balance to each transaction in chronological order.
// Input can be in any order; output is sorted date ASC, id ASC.
export function withRunningBalances<T extends { date: string; id: number; debit: number; credit: number }>(
  transactions: T[],
  openingBalance: number,
  openingType: 'dr' | 'cr',
): Array<T & { running_balance: number }> {
  const sorted = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
  );
  let bal = signedBalance(openingBalance, openingType);
  return sorted.map(t => {
    bal += t.debit - t.credit;
    return { ...t, running_balance: bal };
  });
}

// Compute period totals from the full transaction list (with running_balance set).
// allTxnsAsc must be sorted ascending — i.e. the direct output of withRunningBalances.
export function calcPeriod(
  allTxnsAsc: Array<{ date: string; running_balance?: number; debit: number; credit: number }>,
  openingBalance: number,
  openingType: 'dr' | 'cr',
  fromDate: string | null,
  toDate: string | null,
): LedgerPeriod {
  const opening = signedBalance(openingBalance, openingType);

  // Balance just before the period starts = running_balance of the last pre-period txn.
  let periodOpening = opening;
  if (fromDate) {
    for (const t of allTxnsAsc) {
      if (t.date < fromDate) periodOpening = t.running_balance ?? opening;
      else break;
    }
  }

  const periodTxns = allTxnsAsc.filter(t =>
    (!fromDate || t.date >= fromDate) && (!toDate || t.date <= toDate),
  );
  const totalDebit = periodTxns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = periodTxns.reduce((s, t) => s + t.credit, 0);

  return { periodOpening, totalDebit, totalCredit, periodClosing: periodOpening + totalDebit - totalCredit };
}
