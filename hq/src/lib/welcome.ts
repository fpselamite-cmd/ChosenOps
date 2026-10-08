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
  /** The last line (Ready for Oath): opens once every other topic is signed off by both sides. */
  final?: boolean;
}

/** The associate checklist the family uses: each topic is signed off by the associate, then a WC. */
export const ASSOCIATE_CHECKLIST: WStep[] = [
  { id: 'presentation', title: 'Presentation Given' },
  { id: 'starter', title: 'Starter Package' },
  { id: 'petty', title: 'Petty Crime' },
  { id: 'chopping', title: 'Chopping Cars' },
  { id: 'atm', title: 'ATM Robberies' },
  { id: 'stores', title: 'Store Robberies' },
  { id: 'radio', title: 'Radio Etiquette' },
  { id: 'resources', title: 'Resource Obtaining' },
  { id: 'bylaws', title: 'Bylaws Knowledge' },
  { id: 'family', title: 'Family Knowledge' },
  { id: 'narco', title: 'Narco Knowledge' },
  { id: 'etiquette', title: 'General Etiquette' },
  { id: 'oath', title: 'Ready for Oath', final: true },
];
/** Bumped when the standard checklist changes, so the live list gets the new one once. */
export const CHECKLIST_VERSION = 2;

/** Discipline on an associate's card: a verbal warning, then strikes. */
export const STRIKES = [
  { n: 1, label: 'Verbal Warning', color: '#fde68a' },
  { n: 2, label: 'Strike 1', color: '#fcd34d' },
  { n: 3, label: 'Strike 2', color: '#fdba74' },
  { n: 4, label: 'Strike 3', color: '#fca5a5' },
];
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
  /** A Canva design shown on the Guide tab: its view-only embed link. Canva keeps it current. */
  canva?: string;
  /** What associates sign under at the end of the Guide. */
  pledge?: string;
  /** Which version of the standard checklist the list was last set from. */
  checklistV?: number;
}

/**
 * Turns whatever Canva link was pasted into its view-only embed link, or null if it isn't one.
 * Edit links are refused: they'd let anyone who saw the page edit the design.
 */
export function canvaEmbed(raw: string): string | null | 'edit' {
  const m = raw.trim().match(/^https:\/\/(?:www\.)?canva\.com\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(view|watch|edit)/);
  if (!m) return null;
  if (m[3] === 'edit') return 'edit';
  return `https://www.canva.com/design/${m[1]}/${m[2]}/view?embed`;
}
export const DEFAULT_WELCOME: WelcomeSettings = {
  steps: ASSOCIATE_CHECKLIST,
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

export interface GuideSig {
  name: string;
  img: string;
  pledge: string;
  at: Timestamp;
}
export const DEFAULT_PLEDGE = "I've gone through the guide, and I'll be held to the family's rules.";
/** Did they put their signature on the guide (or accept the current rules the old way)? */
export const guideDone = (ob: Pick<Onboarding, 'guideSig' | 'rulesAccepted'> | null | undefined, rulesVersion: number) => !!ob?.guideSig || (ob?.rulesAccepted ?? 0) >= rulesVersion;

/** Each associate's file. Their own to accept the rules; handlers recommend; High Table promotes. */
export interface Onboarding {
  id: string;
  rulesAccepted?: number;
  rulesAt?: Timestamp;
  /** Signed at the end of the Guide: typed name plus a drawn signature (a small PNG). Counts as accepting the rules, for good. */
  guideSig?: GuideSig | null;
  recommended?: { by: string; byName: string; note: string; at: Timestamp } | null;
  graduatedAt?: Timestamp | null;
  /** They've seen their blooded-in moment. */
  patchSeen?: boolean;
  /** 0 clean, 1 verbal warning, 2–4 strike 1–3. Set by the Welcome Committee. */
  strikes?: number;
  strikesBy?: string;
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
  /** The WC who signed it off, and when. The associate's own sign-off stays in by/at. */
  confirmedName?: string | null;
  confirmedAt?: Timestamp | null;
  at?: Timestamp;
}
/** The WC name for a stamp (older stamps kept the WC in by/byName). */
export const wcName = (s: Stamp | undefined) => (s?.status === 'done' ? (s.confirmedName ?? (s.by !== s.memberId ? s.byName : '')) : '');
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
/** Signing the Guide ticks "Go through the guide and accept the rules". It can't be redone; a WC clears it. */
export const signGuide = (me: Me, version: number, name: string, img: string, pledge: string) =>
  setDoc(doc(db, 'onboarding', me.id), { guideSig: { name: name.trim().slice(0, 60), img, pledge: pledge.slice(0, 300), at: serverTimestamp() }, rulesAccepted: version, rulesAt: serverTimestamp() }, { merge: true });
export const clearGuideSig = (memberId: string) => setDoc(doc(db, 'onboarding', memberId), { guideSig: null, rulesAccepted: 0 }, { merge: true });
export const acceptRules = (me: Me, version: number) => setDoc(doc(db, 'onboarding', me.id), { rulesAccepted: version, rulesAt: serverTimestamp() }, { merge: true });

export const stampId = (memberId: string, stepId: string) => `${memberId}_${stepId}`;
export const markStep = (me: Me, stepId: string) => setDoc(doc(db, 'welcomeStamps', stampId(me.id, stepId)), { memberId: me.id, stepId, status: 'pending', confirmedBy: null, ...stamp(me) });
export const unmarkStep = (memberId: string, stepId: string) => deleteDoc(doc(db, 'welcomeStamps', stampId(memberId, stepId)));
/** A WC signs off a topic the associate has signed. The associate's own sign-off is kept. */
export const confirmStep = (me: Me, memberId: string, stepId: string) =>
  setDoc(doc(db, 'welcomeStamps', stampId(memberId, stepId)), { memberId, stepId, status: 'done', confirmedBy: me.id, confirmedName: me.name, confirmedAt: serverTimestamp() }, { merge: true });
/** A WC takes their sign-off back; the associate's stays. */
export const unconfirmStep = (memberId: string, stepId: string) =>
  setDoc(doc(db, 'welcomeStamps', stampId(memberId, stepId)), { memberId, stepId, status: 'pending', confirmedBy: null, confirmedName: null, confirmedAt: null }, { merge: true });
/** The WC sets an associate's warnings and strikes. */
export const setStrikes = (me: Me, memberId: string, strikes: number) =>
  setDoc(doc(db, 'onboarding', memberId), { strikes: Math.max(0, Math.min(4, strikes)), strikesBy: me.name }, { merge: true });

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
