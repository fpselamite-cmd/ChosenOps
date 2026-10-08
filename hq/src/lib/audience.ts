import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from './firebase';
import type { Rank } from './types';

/**
 * Who can see a pin or an event:
 * - personal: only the person who made it
 * - gang: everyone in the family
 * - limited: ranks from `minRank` up (leadership always)
 * (`crewIds` stays as an empty list: the rules still expect the field.)
 * The security rules check the same fields, so hidden things never reach the wrong phone.
 */
export type Scope = 'personal' | 'gang' | 'limited';
export interface Audience {
  owner: string;
  scope: Scope;
  ranks: string[];
  crewIds: string[];
  minRank?: string | null;
}
export type AudienceDraft = Pick<Audience, 'scope' | 'ranks' | 'crewIds' | 'minRank'>;

export const GANG: AudienceDraft = { scope: 'gang', ranks: [], crewIds: [], minRank: null };

/** The ranks that see a limited item: minRank and everything above it, plus leadership. */
export function ranksFrom(ranks: Rank[], minRank: string | null | undefined) {
  const min = ranks.find((r) => r.id === minRank);
  return ranks.filter((r) => r.order === 0 || r.leadership || (min && r.order <= min.order)).map((r) => r.id);
}

export function audienceLabel(a: Pick<Audience, 'scope' | 'minRank'>, rankById: Map<string, Rank>) {
  if (a.scope === 'personal') return 'Only you';
  if (a.scope === 'gang') return 'Whole family';
  return a.minRank ? `${rankById.get(a.minRank)?.name ?? 'Rank'}+` : 'Leadership';
}

/** Everything in a collection I'm allowed to see: shared, mine and my rank's. */
export function useVisible<T extends { id: string }>(coll: string, enabled = true) {
  const { me } = useHub();
  const qs = useMemo(() => {
    const c = collection(db, coll);
    return {
      gang: query(c, where('scope', '==', 'gang')),
      mine: query(c, where('owner', '==', me.id)),
      rank: me.rankId ? query(c, where('scope', '==', 'limited'), where('ranks', 'array-contains', me.rankId)) : null,
    };
  }, [coll, me.id, me.rankId]);
  const gang = useCollection<T>(qs.gang, enabled);
  const mine = useCollection<T>(qs.mine, enabled);
  const rank = useCollection<T>(qs.rank ?? 'x', enabled && !!qs.rank);
  return useMemo(() => {
    if (!gang || !mine || (qs.rank && !rank)) return null;
    const all = new Map<string, T>();
    [gang, mine, rank ?? []].forEach((l) => l.forEach((x) => all.set(x.id, x)));
    return [...all.values()];
  }, [gang, mine, rank, qs.rank]);
}
