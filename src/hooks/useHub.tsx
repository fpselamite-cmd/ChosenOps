import { collection, doc, orderBy, query } from 'firebase/firestore';
import { liveQuery } from '../lib/live';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../lib/firebase';
import { hasPermission } from '../lib/permissions';
import {
  DEFAULT_INVENTORY_CATEGORIES,
  DEFAULT_TRANSACTION_CATEGORIES,
  type FamilySettings,
  type Member,
  type Permission,
  type Rank,
} from '../lib/types';
import { useAuth } from './useAuth';

interface HubState {
  ranks: Rank[];
  rankById: Map<string, Rank>;
  members: Member[];
  memberById: Map<string, Member>;
  settings: FamilySettings;
  myRank: Rank | null;
  can: (p: Permission) => boolean;
  /** True when the signed-in member sits strictly above the given rank. */
  outranks: (rankId: string | null | undefined) => boolean;
  ready: boolean;
}

const HubContext = createContext<HubState | null>(null);

const DEFAULT_SETTINGS: FamilySettings = {
  inventoryCategories: DEFAULT_INVENTORY_CATEGORIES,
  transactionCategories: DEFAULT_TRANSACTION_CATEGORIES,
};

/** Live family-wide data shared by every page. Mounted only for active members. */
export function HubProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [ranks, setRanks] = useState<Rank[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [settings, setSettings] = useState<FamilySettings>(DEFAULT_SETTINGS);

  useEffect(
    () =>
      liveQuery(query(collection(db, 'ranks'), orderBy('order')), (snap) =>
        setRanks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Rank))),
    [],
  );
  useEffect(
    () =>
      liveQuery(collection(db, 'users'), (snap) => setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Member))),
    [],
  );
  useEffect(
    () =>
      liveQuery(doc(db, 'settings', 'family'), (snap) => {
        if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as FamilySettings) });
      }),
    [],
  );

  const value = useMemo<HubState>(() => {
    const rankById = new Map((ranks ?? []).map((r) => [r.id, r]));
    const memberById = new Map((members ?? []).map((m) => [m.id, m]));
    const myRank = me?.rankId ? (rankById.get(me.rankId) ?? null) : null;
    return {
      ranks: ranks ?? [],
      rankById,
      members: members ?? [],
      memberById,
      settings,
      myRank,
      can: (p) => me?.status === 'active' && hasPermission(myRank, p),
      outranks: (rankId) => {
        if (!myRank) return false;
        if (!rankId) return true;
        const r = rankById.get(rankId);
        return !!r && myRank.order < r.order;
      },
      ready: ranks !== null && members !== null,
    };
  }, [ranks, members, settings, me]);

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside HubProvider');
  return ctx;
}
