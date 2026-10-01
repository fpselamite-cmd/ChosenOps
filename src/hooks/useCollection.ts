import { collection, query, type QueryConstraint } from 'firebase/firestore';
import { liveQuery } from '../lib/live';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

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
