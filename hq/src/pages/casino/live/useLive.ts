import { useEffect, useRef } from 'react';
import { useDoc } from '../../../hooks/useCollection';
import { useHub } from '../../../hooks/useHub';
import { settle } from '../../../lib/casino';
import { heartbeat, markDone, type LiveTable } from '../../../lib/tables';
import { useChips } from '../common';

export const now = () => Date.now();

export function useTable<R>(id: string) {
  const { me } = useHub();
  const t = useDoc<LiveTable<R>>(`casinoTables/${id}`);
  const seated = !!t && !!t.seats[me.id];
  const isHost = !!t && t.host === me.id;
  const quiet = !!t?.beat && Date.now() - t.beat.toMillis() > 45_000;
  return { t, seated, isHost, quiet };
}

/**
 * The dealer's loop: runs only in the host's browser, once a second, on the latest table.
 * `step` decides what (if anything) to write next.
 */
export function useHostLoop<R>(t: LiveTable<R> | null | undefined, isHost: boolean, step: (t: LiveTable<R>) => void | Promise<void>) {
  const latest = useRef(t);
  latest.current = t;
  const stepRef = useRef(step);
  stepRef.current = step;
  const busy = useRef(false);
  useEffect(() => {
    if (!isHost || !t?.id) return;
    const id = t.id;
    const tick = setInterval(async () => {
      const cur = latest.current;
      if (!cur || busy.current) return;
      busy.current = true;
      try {
        await stepRef.current(cur);
      } catch {
        // A write raced another; the next tick tries again.
      } finally {
        busy.current = false;
      }
    }, 1000);
    const beat = setInterval(() => void heartbeat(id).catch(() => {}), 15_000);
    return () => (clearInterval(tick), clearInterval(beat));
  }, [isHost, t?.id]);
}

/** When a round I played in pays out, settle my own chips once. */
export function useSettle<R extends { n: number; phase: string }>(t: LiveTable<R> | null | undefined, stakeOf: (t: LiveTable<R>) => number | null, paidOf: (t: LiveTable<R>) => number, extra: (t: LiveTable<R>) => { blackjack?: boolean } = () => ({})) {
  const { me, preview } = useHub();
  const { bonus } = useChips();
  const doing = useRef(-1);
  useEffect(() => {
    if (!t || preview || t.round.phase !== 'paid') return;
    const n = t.round.n;
    if (t.done[me.id] === n || doing.current === n) return;
    const stake = stakeOf(t);
    if (stake === null) return;
    doing.current = n;
    void settle(me.id, stake, paidOf(t), { ...extra(t), bonus })
      .then(() => markDone(t, me.id, n))
      .catch(() => (doing.current = -1));
  }, [t, me.id, preview, bonus, stakeOf, paidOf, extra]);
}
