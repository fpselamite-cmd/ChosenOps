import { doc, increment, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { useEffect, useMemo, useRef } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { keyOf } from './calendar';
import { db } from './firebase';
import { TZ } from './format';
import type { Tier, TrophyDesign } from './trophies';

/**
 * Monthly leaderboards. One doc per month (Eastern time), e.g. boards/2026-10:
 * `sales` is dirty money brought in per seller, `bricks` is bricks pressed per member.
 * Docs are never wiped, so every past month stays in the Hall of Fame.
 */
export type BoardId = 'sales' | 'bricks';
export interface BoardDoc {
  id: string;
  sales?: Record<string, number>;
  bricks?: Record<string, number>;
  awarded?: boolean;
}

export const BOARDS: { id: BoardId; name: string; title: string; unit: (v: number) => string; design: TrophyDesign }[] = [
  { id: 'sales', name: 'Top Sellers', title: 'Top Seller', unit: (v) => `$${Math.round(v).toLocaleString('en-US')}`, design: 'moneybag' },
  { id: 'bricks', name: 'Brick Press', title: 'Top Presser', unit: (v) => `${v.toLocaleString('en-US')} ${v === 1 ? 'brick' : 'bricks'}`, design: 'brick' },
];

/** "2026-10" for a moment, in Eastern time. */
export function monthKey(at: Date | Timestamp | number = new Date()) {
  const d = typeof at === 'number' ? new Date(at) : at instanceof Date ? at : at.toDate();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}
export const monthName = (ym: string, short = false) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });

/** A board's rows, best first. */
export const ranked = (d: BoardDoc | undefined, b: BoardId) =>
  Object.entries(d?.[b] ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([memberId, value], i) => ({ memberId, value, place: i + 1 }));

/** Counts bricks I pressed (or un-pressed, on undo) this month. */
export const countBricks = (me: string, n: number) =>
  n ? setDoc(doc(db, 'boards', monthKey()), { bricks: { [me]: increment(n) } }, { merge: true }).catch(() => {}) : Promise.resolve();

/** Counts a sale's dirty money for its seller, in the month it happened. */
export const countSale = (sign: { _by: string; _via: string | null }, sellerId: string, amount: number, at?: Timestamp | Date) =>
  amount
    ? Promise.all([
        setDoc(doc(db, 'boards', monthKey(at ?? new Date())), { sales: { [sellerId]: increment(amount) }, ...sign }, { merge: true }).catch(() => {}),
        // …and per day, for the Dashboard's briefing.
        setDoc(doc(db, 'daily', keyOf(at ? (at instanceof Date ? at : at.toDate()) : new Date())), { sales: { [sellerId]: increment(amount) }, ...sign }, { merge: true }).catch(() => {}),
      ])
    : Promise.resolve();

export function useBoards() {
  const rows = useCollection<BoardDoc>('boards');
  return useMemo(() => {
    const list = [...(rows ?? [])].sort((a, b) => b.id.localeCompare(a.id));
    const allTime = (b: BoardId) => {
      const t: Record<string, number> = {};
      list.forEach((m) => Object.entries(m[b] ?? {}).forEach(([k, v]) => (t[k] = (t[k] ?? 0) + v)));
      return ranked({ id: 'all', [b]: t }, b);
    };
    return { ready: !!rows, months: list, byId: new Map(list.map((m) => [m.id, m])), allTime };
  }, [rows]);
}

/**
 * When a month is over, its top 3 on each board get a trophy (Gold, Silver, Bronze).
 * Whoever opens HQ first hands them out; ids are fixed so it only happens once.
 */
export function MonthlyAwarder() {
  const { me } = useHub();
  const { months } = useBoards();
  const done = useRef(new Set<string>());
  useEffect(() => {
    const now = monthKey();
    for (const m of months) {
      if (m.id >= now || m.awarded || done.current.has(m.id)) continue;
      done.current.add(m.id);
      const writes: Promise<unknown>[] = [];
      for (const b of BOARDS)
        ranked(m, b.id)
          .slice(0, 3)
          .forEach((r) =>
            writes.push(
              setDoc(doc(db, 'trophies', `${r.memberId}_top_${b.id}_${m.id}`), {
                kind: 'monthly',
                by: 'leaderboard',
                board: b.id,
                month: m.id,
                place: r.place,
                tier: (4 - r.place) as Tier,
                memberId: r.memberId,
                design: b.design,
                title: `${b.title} #${r.place} · ${monthName(m.id, true)}`,
                note: b.unit(r.value),
                at: serverTimestamp(),
              }).catch(() => {}),
            ),
          );
      Promise.all(writes).then(() => updateDoc(doc(db, 'boards', m.id), { awarded: true }).catch(() => {}));
    }
  }, [months, me.id]);
  return null;
}
