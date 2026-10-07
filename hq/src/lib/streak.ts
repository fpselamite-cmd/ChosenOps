import { doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { addDays, keyOf } from './calendar';
import { db } from './firebase';

/**
 * Daily login streak: open HQ once per day (Eastern time) to keep it going.
 * Two missed days a month are covered by freezes, and an admin can put a member on
 * leave (LOA) so the days they're away don't count against them.
 */
export interface Streak {
  id: string;
  current: number;
  best: number;
  /** Last day counted, YYYY-MM-DD in Eastern time. */
  last: string;
  /** Freezes used per month: { '2026-10': 1 } */
  freezes?: Record<string, number>;
  /** Leave of absence set by an admin, inclusive days. */
  loaFrom?: string | null;
  loaUntil?: string | null;
  at?: Timestamp;
}

export const FREEZES_PER_MONTH = 2;
export const MILESTONES = [7, 30, 100, 365];

/** The next streak after visiting on `today`. Returns null when today is already counted. */
export function nextStreak(s: Streak | null, today: string): Omit<Streak, 'id' | 'at'> | null {
  // No streak yet (or only a leave an admin set before their first visit): start one.
  if (!s?.last) return { current: 1, best: Math.max(1, s?.best ?? 0), last: today, freezes: {} };
  if (s.last >= today) return null;
  const freezes = { ...(s.freezes ?? {}) };
  let ok = true;
  for (let d = addDays(s.last, 1); d < today; d = addDays(d, 1)) {
    if (s.loaFrom && s.loaUntil && d >= s.loaFrom && d <= s.loaUntil) continue;
    const month = d.slice(0, 7);
    if ((freezes[month] ?? 0) < FREEZES_PER_MONTH) freezes[month] = (freezes[month] ?? 0) + 1;
    else {
      ok = false;
      break;
    }
  }
  const current = ok ? s.current + 1 : 1;
  // Keep only this month and last month's freeze counts.
  const keep = new Set([today.slice(0, 7), addDays(today.slice(0, 7) + '-01', -1).slice(0, 7)]);
  Object.keys(freezes).forEach((k) => !keep.has(k) && delete freezes[k]);
  return { current, best: Math.max(s.best, current), last: today, freezes: ok ? freezes : Object.fromEntries(Object.entries(freezes).filter(([k]) => k === today.slice(0, 7))) };
}

export const freezesLeft = (s: Streak | null | undefined, today = keyOf(Date.now())) => FREEZES_PER_MONTH - (s?.freezes?.[today.slice(0, 7)] ?? 0);
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? null;

export const useStreak = (memberId: string) => useDoc<Streak>(`streaks/${memberId}`);

/** Counts today for me (once), and says whether it just went up so the header can celebrate. */
export function useMyStreak() {
  const { me } = useHub();
  const s = useDoc<Streak>(`streaks/${me.id}`);
  const [bumped, setBumped] = useState(false);
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (s === undefined) return;
    const today = keyOf(Date.now());
    if (done.current === today) return;
    const next = nextStreak(s, today);
    done.current = today;
    if (!next) return;
    setDoc(doc(db, 'streaks', me.id), { ...next, loaFrom: s?.loaFrom ?? null, loaUntil: s?.loaUntil ?? null, at: serverTimestamp() })
      .then(() => setBumped(true))
      .catch(() => {});
  }, [s, me.id]);
  return { streak: s ?? null, bumped, clearBump: () => setBumped(false) };
}

/** Admin: put a member on leave so missed days in that range don't break their streak. */
export const setLoa = (memberId: string, from: string | null, until: string | null) =>
  updateDoc(doc(db, 'streaks', memberId), { loaFrom: from, loaUntil: until }).catch(() =>
    setDoc(doc(db, 'streaks', memberId), { loaFrom: from, loaUntil: until }, { merge: true }),
  );
