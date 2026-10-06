import { BRICK_SIZE, METH_COOK_MAX_H, STRAINS, etDayKey, etTime, toCount, type Cook, type OpsLocation, type Run } from './data';
import type { Yield } from './store';

export const durationHours = (l: OpsLocation) => (Number(l.durationHours) > 0 ? Number(l.durationHours) : 36);
export const durationSecs = (l: OpsLocation) => Math.max(1, Math.round(durationHours(l) * 60)) * 60;

export type GrowStatus = 'idle' | 'running' | 'ready';
export function timerState(l: OpsLocation, now: number) {
  const totalSecs = durationSecs(l);
  const start = l.startTime?.toMillis();
  if (!start) return { status: 'idle' as GrowStatus, totalSecs, remainingSecs: totalSecs, pct: 0, readyAt: 0 };
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const remainingSecs = Math.max(0, totalSecs - elapsed);
  return {
    status: (remainingSecs === 0 ? 'ready' : 'running') as GrowStatus,
    totalSecs,
    remainingSecs,
    pct: Math.min(100, (elapsed / totalSecs) * 100),
    readyAt: start + totalSecs * 1000,
  };
}

/** "Ready ~ 06:30 PM ET", "… tomorrow" or "Ready ~ Thu 09:15 AM ET" */
export function readyAtLabel(l: OpsLocation, now: number) {
  const at = timerState(l, now).readyAt;
  const time = etTime(at, { hour: '2-digit', minute: '2-digit' });
  const day = etDayKey(at);
  if (day === etDayKey(now)) return `Ready ~ ${time}`;
  if (day === etDayKey(now + 86400_000)) return `Ready ~ ${time} tomorrow`;
  return `Ready ~ ${new Date(at).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${time}`;
}

/** The leaf grows from small to full size as the timer runs. */
export function growScale(st: ReturnType<typeof timerState>) {
  if (st.status === 'ready') return 1.15;
  if (st.status === 'idle') return 0.6;
  return 0.6 + (st.pct / 100) * 0.55;
}

export const plannedPots = (l: OpsLocation) => STRAINS.reduce((s, x) => s + toCount(l.strainPots?.[x.id]), 0);

export function planEstimate(l: OpsLocation, strainYield: (id: (typeof STRAINS)[number]['id']) => Yield) {
  let buds = 0;
  let min = 0;
  let max = 0;
  for (const s of STRAINS) {
    const pots = toCount(l.strainPots?.[s.id]);
    if (!pots) continue;
    const y = strainYield(s.id);
    buds += pots * y.avg;
    min += pots * y.min;
    max += pots * y.max;
  }
  return { buds, min, max, bricks: buds / BRICK_SIZE };
}

export function allocState(l: OpsLocation) {
  const total = Math.max(1, toCount(l.pots) || 10);
  const planned = plannedPots(l);
  return { total, planned, cls: planned > total ? 'over' : planned < total ? 'under' : 'ok' };
}

// ---------- meth cooks and coke runs ----------

export const cookMins = (c: Cook) => (c.mins >= 1 && c.mins <= 7 * 1440 ? c.mins : METH_COOK_MAX_H * 60);
/** "Might be ready" once 75% of its time has passed, "Ready" when the time is up. */
export function cookState(c: Cook, now: number) {
  const start = c.at?.toMillis() ?? now;
  const total = cookMins(c) * 60000;
  const pct = Math.max(0, Math.min(1, (now - start) / total));
  const left = Math.max(0, Math.ceil((start + total - now) / 1000));
  if (now - start >= total) return { cls: 'ready', text: 'Ready', ready: true, pct, left, start, readyAt: start + total };
  if (pct >= 0.75) return { cls: 'maybe', text: 'Might be ready', ready: false, pct, left, start, readyAt: start + total };
  return { cls: 'cooking', text: 'Cooking', ready: false, pct, left, start, readyAt: start + total };
}

export const runMins = (r: Run) => (r.mins >= 1 && r.mins <= 7 * 1440 ? r.mins : (r.size === 'large' ? 4 : 2) * 60 * Math.max(1, r.n || 1));
export function runState(r: Run, now: number) {
  const start = r.at?.toMillis() ?? now;
  const total = runMins(r) * 60000;
  const pct = Math.max(0, Math.min(1, (now - start) / total));
  const left = Math.max(0, Math.ceil((start + total - now) / 1000));
  return now - start >= total
    ? { cls: 'ready', text: 'Done', ready: true, pct, left, start, readyAt: start + total }
    : { cls: 'cooking', text: 'Running', ready: false, pct, left, start, readyAt: start + total };
}
export const runLabel = (r: Run) => `${r.n} ${r.size} brick${r.n === 1 ? '' : 's'}`;
export const cookTimeLabel = (ms: number) => etTime(ms, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
