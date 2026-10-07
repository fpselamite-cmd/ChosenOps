import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { weekStart } from '../lib/petty';
import type { PettyCrime } from '../lib/types';

/** My weekly petty rep goal as a ring, for the Dashboard header. Hidden until I set a goal. */
export function PettyRing() {
  const { me } = useHub();
  const goal = useDoc<{ weekly?: number }>(`pettyGoals/${me.id}`);
  const q = useMemo(() => query(collection(db, 'pettyLog'), where('memberId', '==', me.id)), [me.id]);
  const rows = useCollection<PettyCrime>(q);
  const target = goal?.weekly ?? 0;
  if (!target || !rows) return null;
  const since = weekStart();
  const week = rows.filter((c) => (c.at?.toMillis() ?? Date.now()) >= since).reduce((s, c) => s + c.rep, 0);
  const pct = Math.min(1, week / target);
  const r = 20;
  const len = 2 * Math.PI * r;
  return (
    <Link to="/petty-crime" className="hud flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02]" title={`${week.toLocaleString()} / ${target.toLocaleString()} petty rep this week`}>
      <svg viewBox="0 0 50 50" className="size-12 -rotate-90">
        <circle cx="25" cy="25" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-raised" />
        <circle
          cx="25"
          cy="25"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke={pct >= 1 ? '#4ade80' : '#d4af37'}
          strokeDasharray={`${len * pct} ${len}`}
          style={{ filter: `drop-shadow(0 0 4px ${pct >= 1 ? '#4ade80' : '#d4af37'})`, transition: 'stroke-dasharray 0.8s' }}
        />
      </svg>
      <span>
        <span className="block font-mono text-lg leading-none text-gold-100">{Math.round(pct * 100)}%</span>
        <span className="label text-[9px]">Weekly rep</span>
      </span>
    </Link>
  );
}
