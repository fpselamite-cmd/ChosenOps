import { collection, doc, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from './firebase';
import { ACHIEVEMENTS, TIERS, tierFor, type AchievementStats, type Cabinet, type Pedestal, type Tier, type TrophyDesign, type TrophyDoc } from './trophies';
import { useMoney } from './money';
import type { PettyCrime, RepTransfer } from './types';

/** A member's cabinet and trophies (anyone in the family can look). */
export function useCabinet(memberId: string) {
  const cabinet = useDoc<Cabinet>(`cabinets/${memberId}`);
  const q = useMemo(() => query(collection(db, 'trophies'), where('memberId', '==', memberId)), [memberId]);
  const trophies = (useCollection<TrophyDoc>(q) ?? []).sort((a, b) => b.tier - a.tier || (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const c: Cabinet = cabinet ?? { id: memberId, pedestals: 6, slots: {} };
  return {
    ready: cabinet !== undefined,
    cabinet: c,
    trophies,
    save: (next: Partial<Cabinet>) => setDoc(doc(db, 'cabinets', memberId), { pedestals: c.pedestals, slots: c.slots, ...next }),
    setSlot: (i: number, p: Pedestal | null) => {
      const slots = { ...c.slots };
      if (p) slots[String(i)] = p;
      else delete slots[String(i)];
      return setDoc(doc(db, 'cabinets', memberId), { pedestals: c.pedestals, slots });
    },
  };
}

/** Leadership hands out a trophy. */
export const awardTrophy = (memberId: string, by: { id: string; name: string }, t: { design: TrophyDesign; tier: Tier; title: string; note: string }) =>
  setDoc(doc(collection(db, 'trophies')), {
    kind: 'award',
    memberId,
    by: by.id,
    byName: by.name,
    design: t.design,
    tier: t.tier,
    title: t.title.trim().slice(0, 60),
    note: t.note.trim().slice(0, 140),
    at: serverTimestamp(),
  });

/** My numbers for every achievement. */
export function useMyAchievementStats(): AchievementStats | null {
  const { me } = useHub();
  const stats = useDoc<{ id: string; harvests?: number; pressed?: number; cooks?: number; runs?: number }>(`stats/${me.id}`);
  const pettyQ = useMemo(() => query(collection(db, 'pettyLog'), where('memberId', '==', me.id)), [me.id]);
  const repQ = useMemo(() => query(collection(db, 'repTransfers'), where('memberId', '==', me.id)), [me.id]);
  const petty = useCollection<PettyCrime>(pettyQ);
  const reps = useCollection<RepTransfer>(repQ);
  const m = useMoney();
  if (stats === undefined || !petty || !reps || !m.ready) return null;
  return {
    harvests: stats?.harvests ?? 0,
    pressed: stats?.pressed ?? 0,
    cooks: stats?.cooks ?? 0,
    runs: stats?.runs ?? 0,
    sold: m.mine.qty,
    washed: m.mine.washed,
    petty: petty.length,
    repSent: reps.filter((r) => r.status === 'confirmed').reduce((t, r) => t + r.amount, 0),
    days: me.joinedAt ? Math.floor((Date.now() - me.joinedAt.toMillis()) / 86400e3) : 0,
  };
}

/** Quietly awards me every achievement tier I've reached and don't have yet. */
export function AchievementWatcher() {
  const { me } = useHub();
  const stats = useMyAchievementStats();
  const { trophies } = useCabinet(me.id);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!stats) return;
    const have = new Set(trophies.filter((t) => t.kind === 'achievement').map((t) => `${t.achId}_${t.tier}`));
    for (const a of ACHIEVEMENTS) {
      const reached = tierFor(a, stats[a.stat]);
      for (let tier = 1; tier <= reached; tier++) {
        const key = `${a.id}_${tier}`;
        if (have.has(key) || tried.current.has(key)) continue;
        tried.current.add(key);
        setDoc(doc(db, 'trophies', `${me.id}_${key}`), {
          kind: 'achievement',
          memberId: me.id,
          by: 'achievement',
          achId: a.id,
          tier,
          design: a.design,
          title: `${a.name} ${TIERS[tier - 1]!.roman}`,
          note: `${a.at[tier - 1]!.toLocaleString('en-US')} ${a.unit}`,
          at: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }, [stats, trophies, me.id]);
  return null;
}
