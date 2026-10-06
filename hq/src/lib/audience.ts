import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from './firebase';
import type { Crew, Rank } from './types';

/**
 * Who can see a pin or an event:
 * - personal: only the person who made it
 * - gang: everyone in the family
 * - limited: ranks from `minRank` up (leadership always), plus anyone in the crews listed
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

export function audienceLabel(a: Pick<Audience, 'scope' | 'crewIds' | 'minRank'>, rankById: Map<string, Rank>, crewById: Map<string, Crew>) {
  if (a.scope === 'personal') return 'Only you';
  if (a.scope === 'gang') return 'Whole family';
  const parts = [a.minRank ? `${rankById.get(a.minRank)?.name ?? 'Rank'}+` : 'Leadership'];
  a.crewIds.forEach((c) => parts.push(crewById.get(c)?.name ?? 'crew'));
  return parts.join(' · ');
}

/** Everything in a collection I'm allowed to see: shared, mine, my rank's and my crews'. */
export function useVisible<T extends { id: string }>(coll: string) {
  const { me } = useHub();
  const crewKey = [...(me.crewIds ?? [])].sort().join(',');
  const qs = useMemo(() => {
    const c = collection(db, coll);
    return {
      gang: query(c, where('scope', '==', 'gang')),
      mine: query(c, where('owner', '==', me.id)),
      rank: me.rankId ? query(c, where('scope', '==', 'limited'), where('ranks', 'array-contains', me.rankId)) : null,
      crews: crewKey ? query(c, where('scope', '==', 'limited'), where('crewIds', 'array-contains-any', crewKey.split(','))) : null,
    };
  }, [coll, me.id, me.rankId, crewKey]);
  const gang = useCollection<T>(qs.gang);
  const mine = useCollection<T>(qs.mine);
  const rank = useCollection<T>(qs.rank ?? 'x', !!qs.rank);
  const crews = useCollection<T>(qs.crews ?? 'x', !!qs.crews);
  return useMemo(() => {
    if (!gang || !mine || (qs.rank && !rank) || (qs.crews && !crews)) return null;
    const all = new Map<string, T>();
    [gang, mine, rank ?? [], crews ?? []].forEach((l) => l.forEach((x) => all.set(x.id, x)));
    return [...all.values()];
  }, [gang, mine, rank, crews, qs.rank, qs.crews]);
}
