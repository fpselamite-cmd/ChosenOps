import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { news } from './members';

/**
 * The welcome center: associates work through a checklist toward being blooded in, and the Welcome
 * Committee (their handlers) confirm steps, keep notes and recommend them to High Table.
 */

/** A task on the stamp card. Rules, the character sheet and the rep goal are built-in milestones. */
export interface WStep {
  id: string;
  title: string;
  detail?: string;
}
export interface WSection {
  title: string;
  body: string;
}
export interface WelcomeSettings {
  steps: WStep[];
  /** Petty rep needed before they can be recommended (0 = no rep goal). */
  repTarget: number;
  /** Bumped when the rules change enough that associates must accept them again. */
  rulesVersion: number;
  sections: WSection[];
}
export const DEFAULT_WELCOME: WelcomeSettings = {
  steps: [
    { id: 't1', title: 'Ride along on a run', detail: 'Placeholder until the real list is in.' },
    { id: 't2', title: 'Show up to a blacksite' },
    { id: 't3', title: 'Sit at a family dinner' },
  ],
  repTarget: 300,
  rulesVersion: 1,
  sections: [{ title: 'The rules', body: 'The rules go here. High Table or the Welcome Committee can paste them in from Setup.' }],
};
/** Turn pasted lines into steps ("Title — detail" or "Title: detail" splits off the detail). */
export function stepsFromText(text: string, keep: WStep[] = []): WStep[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 40)
    .map((l, i) => {
      const [title, ...rest] = l.split(/\s+[—–-]\s+|:\s+/);
      const t = (title ?? l).slice(0, 80);
      return { id: keep.find((k) => k.title === t)?.id ?? `t${Date.now().toString(36)}${i}`, title: t, ...(rest.length ? { detail: rest.join(' ').slice(0, 200) } : {}) };
    });
}

/** Each associate's file. Their own to accept the rules; handlers recommend; High Table promotes. */
export interface Onboarding {
  id: string;
  rulesAccepted?: number;
  rulesAt?: Timestamp;
  recommended?: { by: string; byName: string; note: string; at: Timestamp } | null;
  graduatedAt?: Timestamp | null;
  /** They've seen their blooded-in moment. */
  patchSeen?: boolean;
}
/** A stamp on the card: the associate marks it (pending), a handler confirms it (done). */
export interface Stamp {
  id: string;
  memberId: string;
  stepId: string;
  status: 'pending' | 'done';
  by: string;
  byName: string;
  confirmedBy?: string | null;
  at?: Timestamp;
}
export interface HandlerNote {
  id: string;
  memberId: string;
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export interface Vouch {
  id: string;
  memberId: string;
  kind: 'vouch' | 'flag';
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export interface WelcomeNote {
  id: string;
  to: string;
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export interface Graduation {
  id: string;
  name: string;
  rankName: string;
  at?: Timestamp;
}

type Me = { id: string; name: string };
const stamp = (me: Me) => ({ by: me.id, byName: me.name, at: serverTimestamp() });

export const saveWelcome = (s: WelcomeSettings) => setDoc(doc(db, 'settings', 'welcome'), s);
export const acceptRules = (me: Me, version: number) => setDoc(doc(db, 'onboarding', me.id), { rulesAccepted: version, rulesAt: serverTimestamp() }, { merge: true });

export const stampId = (memberId: string, stepId: string) => `${memberId}_${stepId}`;
export const markStep = (me: Me, stepId: string) => setDoc(doc(db, 'welcomeStamps', stampId(me.id, stepId)), { memberId: me.id, stepId, status: 'pending', confirmedBy: null, ...stamp(me) });
export const unmarkStep = (memberId: string, stepId: string) => deleteDoc(doc(db, 'welcomeStamps', stampId(memberId, stepId)));
/** A handler confirms a step (or stamps it outright for them). */
export const confirmStep = (me: Me, memberId: string, stepId: string) =>
  setDoc(doc(db, 'welcomeStamps', stampId(memberId, stepId)), { memberId, stepId, status: 'done', confirmedBy: me.id, ...stamp(me) });

export const addHandlerNote = (me: Me, memberId: string, text: string) => addDoc(collection(db, 'handlerNotes'), { memberId, text: text.slice(0, 500), ...stamp(me) });
export const removeHandlerNote = (id: string) => deleteDoc(doc(db, 'handlerNotes', id));
export const vouch = (me: Me, memberId: string, kind: Vouch['kind'], text: string) => addDoc(collection(db, 'vouches'), { memberId, kind, text: text.slice(0, 200), ...stamp(me) });
export const removeVouch = (id: string) => deleteDoc(doc(db, 'vouches', id));
export const sendNote = (me: Me, to: string, text: string) => addDoc(collection(db, 'welcomeNotes'), { to, text: text.slice(0, 300), ...stamp(me) });
export const removeNote = (id: string) => deleteDoc(doc(db, 'welcomeNotes', id));

export const recommend = (me: Me, memberId: string, note: string) =>
  setDoc(doc(db, 'onboarding', memberId), { recommended: { by: me.id, byName: me.name, note: note.slice(0, 300), at: serverTimestamp() } }, { merge: true });
export const withdraw = (memberId: string) => setDoc(doc(db, 'onboarding', memberId), { recommended: null }, { merge: true });
/** High Table bloods them in: new rank, the family hears about it, and they get their moment. */
export function promote(m: Me, rankId: string, rankName: string) {
  const b = writeBatch(db);
  b.update(doc(db, 'members', m.id), { rankId });
  b.set(doc(db, 'onboarding', m.id), { graduatedAt: serverTimestamp(), patchSeen: false, recommended: null }, { merge: true });
  b.set(doc(db, 'graduations', m.id), { name: m.name, rankName, at: serverTimestamp() });
  return b.commit().then(() => news('promoted', m.id, rankId));
}
export const seePatch = (memberId: string) => updateDoc(doc(db, 'onboarding', memberId), { patchSeen: true });
