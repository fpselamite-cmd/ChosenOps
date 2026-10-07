import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/** How we stand with a gang, worst to best. */
export const RELATIONS = [
  { id: 'war', label: 'War', color: '#dc2626' },
  { id: 'hostile', label: 'Hostile', color: '#f97316' },
  { id: 'tense', label: 'Tense', color: '#eab308' },
  { id: 'neutral', label: 'Neutral', color: '#94a3b8' },
  { id: 'truce', label: 'Truce', color: '#38bdf8' },
  { id: 'allied', label: 'Allied', color: '#22c55e' },
] as const;
export type Relation = (typeof RELATIONS)[number]['id'];
export const relationOf = (id?: string) => RELATIONS.find((r) => r.id === id) ?? RELATIONS[3];

/** A turf zone: a shape drawn on the city map (points are 0..1 across and down). */
export interface Zone {
  label: string;
  /** Objects, not pairs: Firestore can't hold an array inside an array. */
  points: { x: number; y: number }[];
}
export interface RivalCar {
  model: string;
  plate: string;
  color: string;
}
/** A gang's case file. */
export interface Rival {
  id: string;
  name: string;
  color: string;
  logo?: string | null;
  relation: Relation;
  relationLog?: { rel: Relation; note: string; by: string; at: number }[];
  zones?: Zone[];
  turfNote?: string;
  hangouts?: string;
  cars?: RivalCar[];
  size?: number;
  weapons?: string;
  /** 1 (soft) to 5 (very dangerous). */
  danger?: number;
  notes?: string;
  at?: Timestamp;
}
export type Threat = 'low' | 'medium' | 'high' | 'kos';
export const THREATS: { id: Threat; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#94a3b8' },
  { id: 'medium', label: 'Medium', color: '#eab308' },
  { id: 'high', label: 'High', color: '#f97316' },
  { id: 'kos', label: 'Kill on sight', color: '#dc2626' },
];
export interface RivalMember {
  id: string;
  name: string;
  role: string;
  photo?: string | null;
  threat: Threat;
  lastSeenAt?: Timestamp | null;
  lastSeenWhere?: string;
  notes?: string;
}
export type IncidentKind = 'fight' | 'robbery' | 'turf' | 'deal';
export const INCIDENT_KINDS: { id: IncidentKind; label: string }[] = [
  { id: 'fight', label: 'Shootout / fight' },
  { id: 'robbery', label: 'Robbery / stolen product' },
  { id: 'turf', label: 'Turf move' },
  { id: 'deal', label: 'Deal / sit-down' },
];
export interface Incident {
  id: string;
  gangId: string;
  kind: IncidentKind;
  title: string;
  notes: string;
  where: string;
  outcome: 'win' | 'loss' | 'draw' | null;
  by: string;
  byName: string;
  at?: Timestamp;
}
export interface RivalNote {
  id: string;
  gangId: string;
  text: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
/** Someone spotted a rival: shows on the Map for 6 hours if placed. */
export interface Sighting {
  id: string;
  gangId: string;
  memberIds: string[];
  postal: string;
  x: number | null;
  y: number | null;
  note: string;
  by: string;
  byName: string;
  at?: Timestamp;
}
export const SIGHTING_HOURS = 6;
export const freshSighting = (s: Sighting) => Date.now() - (s.at?.toMillis() ?? Date.now()) < SIGHTING_HOURS * 3600e3;

export interface Bounty {
  id: string;
  gangId: string;
  memberId: string;
  memberName: string;
  photo?: string | null;
  amount: number;
  cash: 'dirty' | 'clean';
  reason: string;
  status: 'open' | 'claimed' | 'paid' | 'cancelled';
  claimBy?: string | null;
  claimName?: string | null;
  claimProof?: string | null;
  claimAt?: Timestamp | null;
  by: string;
  at?: Timestamp;
}

/** The red-string board: rival members, gangs and notes pinned up, joined by colored strings. */
export interface BoardNode {
  id: string;
  kind: 'member' | 'gang' | 'note';
  /** gangId for a gang, `${gangId}/${memberId}` for a member, the text for a note. */
  ref: string;
  /** What the card shows, kept with it so the board draws without loading every gang. */
  label: string;
  photo?: string | null;
  color?: string;
  /** 0..1 across and down the board. */
  x: number;
  y: number;
}
export interface BoardLink {
  a: string;
  b: string;
  color: string;
  label?: string;
}
export interface Board {
  nodes: BoardNode[];
  links: BoardLink[];
  legend: { color: string; meaning: string }[];
}
export const DEFAULT_LEGEND = [
  { color: '#dc2626', meaning: 'Beef / enemies' },
  { color: '#22c55e', meaning: 'Allies / work together' },
  { color: '#eab308', meaning: 'Family / close' },
  { color: '#38bdf8', meaning: 'Business / deals' },
];

// ---------- writes ----------

const stamp = (me: { id: string; name: string }) => ({ by: me.id, byName: me.name, at: serverTimestamp() });

export const saveRival = (id: string | null, r: Omit<Rival, 'id' | 'at'>) =>
  id ? setDoc(doc(db, 'rivals', id), r, { merge: true }) : addDoc(collection(db, 'rivals'), { ...r, at: serverTimestamp() });
export const removeRival = (id: string) => deleteDoc(doc(db, 'rivals', id));
export function setRelation(me: { id: string; name: string }, r: Rival, rel: Relation, note: string) {
  const log = [{ rel, note: note.slice(0, 120), by: me.name, at: Date.now() }, ...(r.relationLog ?? [])].slice(0, 40);
  return updateDoc(doc(db, 'rivals', r.id), { relation: rel, relationLog: log });
}
export const saveZones = (id: string, zones: Zone[]) => updateDoc(doc(db, 'rivals', id), { zones });

export const saveMember = (gangId: string, id: string | null, m: Omit<RivalMember, 'id'>) =>
  id ? setDoc(doc(db, 'rivals', gangId, 'members', id), m, { merge: true }) : addDoc(collection(db, 'rivals', gangId, 'members'), m);
export const removeMember = (gangId: string, id: string) => deleteDoc(doc(db, 'rivals', gangId, 'members', id));

export const addIncident = (me: { id: string; name: string }, i: Omit<Incident, 'id' | 'by' | 'byName' | 'at'>) => addDoc(collection(db, 'rivalIncidents'), { ...i, ...stamp(me) });
export const removeIncident = (id: string) => deleteDoc(doc(db, 'rivalIncidents', id));
export const addNote = (me: { id: string; name: string }, gangId: string, text: string) => addDoc(collection(db, 'rivalNotes'), { gangId, text: text.slice(0, 500), ...stamp(me) });
export const removeNote = (id: string) => deleteDoc(doc(db, 'rivalNotes', id));

/** Spotted: logs it, and marks each member as last seen there. */
export async function spot(me: { id: string; name: string }, s: Omit<Sighting, 'id' | 'by' | 'byName' | 'at'>) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'sightings')), { ...s, note: s.note.slice(0, 140), ...stamp(me) });
  await b.commit();
  // Last seen is on the member files (leadership's to edit), so it's best effort.
  await Promise.all(s.memberIds.map((m) => updateDoc(doc(db, 'rivals', s.gangId, 'members', m), { lastSeenAt: serverTimestamp(), lastSeenWhere: s.postal ? `postal ${s.postal}` : s.note.slice(0, 40) }).catch(() => {})));
}
export const removeSighting = (id: string) => deleteDoc(doc(db, 'sightings', id));

export const postBounty = (me: { id: string }, b: Pick<Bounty, 'gangId' | 'memberId' | 'memberName' | 'photo' | 'amount' | 'cash' | 'reason'>) =>
  addDoc(collection(db, 'bounties'), { ...b, amount: Math.round(b.amount), status: 'open', claimBy: null, claimName: null, claimProof: null, claimAt: null, by: me.id, at: serverTimestamp() });
export const claimBounty = (me: { id: string; name: string }, b: Bounty, proof: string) =>
  updateDoc(doc(db, 'bounties', b.id), { status: 'claimed', claimBy: me.id, claimName: me.name, claimProof: proof.slice(0, 300), claimAt: serverTimestamp() });
/** Confirming a claim owes the claimer the bounty from the gang bank (Money → payouts). */
export function payBounty(me: { id: string }, b: Bounty) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bounties', b.id), { status: 'paid' });
  batch.set(doc(collection(db, 'payouts')), { memberId: b.claimBy, memberName: b.claimName, cash: b.cash, amount: b.amount, reason: `Bounty: ${b.memberName}`.slice(0, 80), status: 'owed', by: me.id, at: serverTimestamp() });
  return batch.commit();
}
export const rejectClaim = (b: Bounty) => updateDoc(doc(db, 'bounties', b.id), { status: 'open', claimBy: null, claimName: null, claimProof: null, claimAt: null });
export const cancelBounty = (b: Bounty) => updateDoc(doc(db, 'bounties', b.id), { status: 'cancelled' });

export const saveBoard = (b: Board) => setDoc(doc(db, 'rivalBoard', 'main'), b);

export const ts = (ms: number) => Timestamp.fromMillis(ms);
