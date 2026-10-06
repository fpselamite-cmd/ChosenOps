import { collection, doc, onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

/** Live list of a collection or query. `null` until the first snapshot arrives. Memoize queries. */
export function useCollection<T>(path: string | Query, enabled = true): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ref = typeof path === 'string' ? collection(db, path) : path;
    return onSnapshot(
      ref,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      () => setRows([]),
    );
  }, [path, enabled]);
  return rows;
}

/** Live single document. `undefined` while loading, `null` if missing. */
export function useDoc<T>(path: string, enabled = true): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, path),
      (snap) => setValue(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null),
      () => setValue(null),
    );
  }, [path, enabled]);
  return value;
}
