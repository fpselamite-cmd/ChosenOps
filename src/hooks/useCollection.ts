import { collection, orderBy, query, type QueryConstraint } from 'firebase/firestore';
import { liveQuery } from '../lib/live';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import type { Currency, InventoryItem, Transaction } from '../lib/types';

/** Live list of documents in a collection; `null` while loading. Pass enabled=false to skip (e.g. no permission). */
export function useCollection<T>(name: string, constraints: QueryConstraint[] = [], enabled = true) {
  const [docs, setDocs] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return liveQuery(
      query(collection(db, name), ...constraints),
      (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (err) => setError(err.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled]);
  return { docs, error };
}

export function useLedger(enabled = true) {
  const { docs, error } = useCollection<Transaction>('transactions', [orderBy('createdAt', 'desc')], enabled);
  const totals: Record<Currency, number> = { clean: 0, dirty: 0, rep: 0 };
  for (const t of docs ?? []) totals[t.type] += Number(t.amount) || 0;
  return { transactions: docs, totals, error };
}

export const useInventory = () => {
  const { docs, error } = useCollection<InventoryItem>('inventory', [orderBy('name')]);
  return { items: docs, error };
};
