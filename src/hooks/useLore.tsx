import { collection, limit, orderBy, query, type Query } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../lib/firebase';
import { liveQuery } from '../lib/live';
import type { ChronicleEvent, JournalEntry, LoreEntry, Member, Relationship } from '../lib/types';
import { useHub } from './useHub';

interface LoreState {
  lore: LoreEntry[];
  loreById: Map<string, LoreEntry>;
  /** Lower-cased title → entry, for [[Title]] links. */
  loreByTitle: Map<string, LoreEntry>;
  chronicle: ChronicleEvent[];
  journals: JournalEntry[];
  relationships: Relationship[];
  /** Lower-cased username → member, for @mentions. */
  memberByUsername: Map<string, Member>;
  tiesOf: (memberId: string) => Relationship[];
  ready: boolean;
}

const LoreContext = createContext<LoreState | null>(null);

function useLive<T>(build: () => Query) {
  const [docs, setDocs] = useState<T[] | null>(null);
  useEffect(
    () => liveQuery(build(), (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return docs;
}

/** Live lore, chronicle, journals and ties shared by every page. Mounted inside HubProvider. */
export function LoreProvider({ children }: { children: ReactNode }) {
  const { members } = useHub();
  const lore = useLive<LoreEntry>(() => query(collection(db, 'lore'), orderBy('updatedAt', 'desc')));
  const chronicle = useLive<ChronicleEvent>(() => query(collection(db, 'chronicle'), orderBy('when')));
  const journals = useLive<JournalEntry>(() => query(collection(db, 'journals'), orderBy('createdAt', 'desc'), limit(300)));
  const relationships = useLive<Relationship>(() => query(collection(db, 'relationships')));

  const value = useMemo<LoreState>(() => {
    const ties = relationships ?? [];
    return {
      lore: lore ?? [],
      loreById: new Map((lore ?? []).map((l) => [l.id, l])),
      loreByTitle: new Map((lore ?? []).map((l) => [l.title.trim().toLowerCase(), l])),
      chronicle: chronicle ?? [],
      journals: journals ?? [],
      relationships: ties,
      memberByUsername: new Map(members.map((m) => [m.usernameLower, m])),
      tiesOf: (id) => ties.filter((t) => t.a === id || t.b === id),
      ready: lore !== null && chronicle !== null && journals !== null && relationships !== null,
    };
  }, [lore, chronicle, journals, relationships, members]);

  return <LoreContext.Provider value={value}>{children}</LoreContext.Provider>;
}

export function useLore() {
  const ctx = useContext(LoreContext);
  if (!ctx) throw new Error('useLore must be used inside LoreProvider');
  return ctx;
}
