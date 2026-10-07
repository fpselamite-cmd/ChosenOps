import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import type { Sheet } from '../../lib/sheet';
import type { Member } from '../../lib/types';
import { DEFAULT_WELCOME, type Onboarding, type Stamp, type WelcomeSettings } from '../../lib/welcome';

/** Who's on which side of the welcome center. */
export function useWelcomeAccess() {
  const { me, ranks, rolesOf, isLead, can } = useHub();
  const assocRank = ranks.find((r) => r.id === 'associate') ?? [...ranks].sort((a, b) => b.order - a.order)[0];
  const isAssoc = !!assocRank && me.rankId === assocRank.id;
  const isHandler = isLead || rolesOf(me.id).some((r) => r.id === 'welcome');
  const canDoor = can('approveMembers');
  return { assocRank, isAssoc, isHandler, canDoor, open: isAssoc || isHandler || canDoor };
}

export function useWelcomeSettings(): WelcomeSettings {
  const s = useDoc<WelcomeSettings>('settings/welcome');
  return s ? { ...DEFAULT_WELCOME, ...s } : DEFAULT_WELCOME;
}

export const sheetDone = (s?: Sheet | null) =>
  !!s && [...Object.values(s.basics ?? {}), ...Object.values(s.story ?? {})].filter((v) => typeof v === 'string' && v.trim()).length >= 3;

export interface Progress {
  rules: boolean;
  sheet: boolean;
  rep: number;
  repDone: boolean;
  stamps: Map<string, Stamp>;
  tasksDone: number;
  pending: number;
  /** Everything but the recommendation. */
  ready: boolean;
  done: number;
  total: number;
  pct: number;
}
export function progressOf(w: WelcomeSettings, ob: Onboarding | null | undefined, sheet: Sheet | null | undefined, rep: number, stamps: Stamp[]): Progress {
  const map = new Map(stamps.filter((s) => w.steps.some((t) => t.id === s.stepId)).map((s) => [s.stepId, s]));
  const rules = (ob?.rulesAccepted ?? 0) >= w.rulesVersion;
  const sh = sheetDone(sheet);
  const repDone = !w.repTarget || rep >= w.repTarget;
  const tasksDone = [...map.values()].filter((s) => s.status === 'done').length;
  const pending = [...map.values()].filter((s) => s.status === 'pending').length;
  const total = 2 + w.steps.length + (w.repTarget ? 1 : 0);
  const done = +rules + +sh + tasksDone + (w.repTarget ? +repDone : 0);
  return { rules, sheet: sh, rep, repDone, stamps: map, tasksDone, pending, ready: done >= total, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** One associate's whole file: onboarding, sheet, petty rep and stamps. */
export function useAssociate(memberId: string) {
  const w = useWelcomeSettings();
  const ob = useDoc<Onboarding>(`onboarding/${memberId}`);
  const sheet = useDoc<Sheet>(`sheets/${memberId}`);
  const petty = useDoc<{ rep?: number }>(`petty/${memberId}`);
  const q = useMemo(() => query(collection(db, 'welcomeStamps'), where('memberId', '==', memberId)), [memberId]);
  const stamps = useCollection<Stamp>(q) ?? [];
  return { w, ob, p: progressOf(w, ob, sheet, petty?.rep ?? 0, stamps) };
}

/** Everyone still an associate. */
export function useAssociates(): Member[] {
  const { roster } = useHub();
  const { assocRank } = useWelcomeAccess();
  return roster.filter((m) => assocRank && m.rankId === assocRank.id).sort((a, b) => (a.joinedAt?.toMillis() ?? 0) - (b.joinedAt?.toMillis() ?? 0));
}

/** What's waiting on the Welcome Committee: steps to confirm, newcomers at the door, and (for High Table) recommendations. */
export function useWelcomeAttention() {
  const { members, isLead } = useHub();
  const { isHandler, canDoor } = useWelcomeAccess();
  const q = useMemo(() => query(collection(db, 'welcomeStamps'), where('status', '==', 'pending')), []);
  const stamps = useCollection<Stamp>(q, isHandler) ?? [];
  const recQ = useMemo(() => query(collection(db, 'onboarding'), where('recommended', '!=', null)), []);
  const recs = useCollection<Onboarding>(recQ, isLead) ?? [];
  const door = canDoor ? members.filter((m) => m.status === 'pending').length : 0;
  return { stamps: stamps.length, recs: recs.length, door, total: stamps.length + recs.length };
}
