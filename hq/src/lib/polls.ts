import { addDoc, arrayUnion, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Polls & votes. Leadership asks; the family votes. Every vote is a doc under the poll, pointed to by
 * the voter's private ballot (pollBallots/{poll}_{member}), so an anonymous vote carries no name at all.
 * Results open up live (once you've voted) or only when the poll closes, as the asker chose.
 */

type Me = { id: string; name: string };

export type PollKind = 'single' | 'multi' | 'yesno' | 'dates';
export const POLL_KINDS: { id: PollKind; label: string; hint: string }[] = [
  { id: 'single', label: 'Single choice', hint: 'Pick one' },
  { id: 'multi', label: 'Multiple choice', hint: 'Pick any' },
  { id: 'yesno', label: 'Yes / No / Abstain', hint: 'A motion' },
  { id: 'dates', label: 'Date & time', hint: 'Tick every time that works' },
];
export type PollAudience = 'all' | 'members' | 'table';
export const AUDIENCES: { id: PollAudience; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'members', label: 'Blooded members' },
  { id: 'table', label: 'High Table' },
];
export const YES_NO = ['Yes', 'No', 'Abstain'];

export interface PollOption {
  id: string;
  /** For a date poll, an ISO date-time. */
  label: string;
}
export interface Poll {
  id: string;
  question: string;
  note: string;
  kind: PollKind;
  options: PollOption[];
  /** The option ids again, so the rules can check picks. */
  ids: string[];
  audience: PollAudience;
  anonymous: boolean;
  /** live: you see the bars once you've voted. closed: nobody sees them till it ends. */
  reveal: 'live' | 'closed';
  /** A High Table motion: sealed, and its result goes in the Archives timeline. */
  official: boolean;
  closesAt: Timestamp | null;
  status: 'open' | 'closed';
  closedAt?: Timestamp | null;
  /** Who has voted (not what). */
  voters: string[];
  /** Set once an official result is written into the timeline. */
  logged?: boolean;
  by: string;
  byName: string;
  at?: Timestamp;
}
export interface Vote {
  id: string;
  picks: string[];
  /** Named polls only. */
  memberId?: string;
  name?: string;
  at?: Timestamp;
}
export interface Ballot {
  id: string;
  pollId: string;
  memberId: string;
  voteId: string;
}
export interface PollComment {
  id: string;
  by: string;
  name: string;
  text: string;
  at?: Timestamp;
}
export type PollDraft = Pick<Poll, 'question' | 'note' | 'kind' | 'audience' | 'anonymous' | 'reveal' | 'official'> & { options: string[]; closesAt: Date | null };
export interface PollTemplate extends Omit<PollDraft, 'closesAt'> {
  id: string;
  name: string;
  /** Hours from creation the poll runs for (0 = no deadline). */
  hours: number;
}

export const blankPoll = (): PollDraft => ({ question: '', note: '', kind: 'single', options: ['', ''], audience: 'members', anonymous: false, reveal: 'live', official: false, closesAt: null });

/** The built-in starting points. */
export const BUILT_IN: PollTemplate[] = [
  { id: 'night', name: 'Schedule a night', question: 'When should we run it?', note: 'Tick every time that works for you.', kind: 'dates', options: [], audience: 'members', anonymous: false, reveal: 'live', official: false, hours: 48 },
  { id: 'motion', name: 'Motion', question: 'Motion: ', note: '', kind: 'yesno', options: YES_NO, audience: 'members', anonymous: true, reveal: 'closed', official: true, hours: 72 },
];

export const pollOpen = (p: Pick<Poll, 'status' | 'closesAt'>, now = Date.now()) => p.status === 'open' && (!p.closesAt || p.closesAt.toMillis() > now);
export const canSeeResults = (p: Poll, me: string, now = Date.now()) => !pollOpen(p, now) || (p.reveal === 'live' && p.voters.includes(me));
export const maxPicks = (p: Pick<Poll, 'kind' | 'options'>) => (p.kind === 'single' || p.kind === 'yesno' ? 1 : p.options.length);

export const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const optionLabel = (p: Pick<Poll, 'kind'>, o: PollOption) => (p.kind === 'dates' ? fmtSlot(o.label) : o.label);

/** Counts per option, the leaders and the share of each. */
export function tally(p: Poll, votes: Vote[]) {
  const counts = new Map(p.options.map((o) => [o.id, 0]));
  const who = new Map<string, Vote[]>(p.options.map((o) => [o.id, []]));
  for (const v of votes)
    for (const id of v.picks)
      if (counts.has(id)) {
        counts.set(id, counts.get(id)! + 1);
        who.get(id)!.push(v);
      }
  const top = Math.max(0, ...counts.values());
  const winners = top ? p.options.filter((o) => counts.get(o.id) === top).map((o) => o.id) : [];
  return { counts, who, top, winners, total: votes.length };
}
/** A motion carries if Yes beats No. */
export const motionCarried = (p: Poll, t: ReturnType<typeof tally>) => (t.counts.get(p.ids[0]!) ?? 0) > (t.counts.get(p.ids[1]!) ?? 0);

/** One line for the record: "Carried 5-2" or "Thu, Oct 9 · 6 votes". */
export function resultLine(p: Poll, t: ReturnType<typeof tally>) {
  if (!t.total) return 'No votes';
  if (p.kind === 'yesno') {
    const [y, n] = [t.counts.get(p.ids[0]!) ?? 0, t.counts.get(p.ids[1]!) ?? 0];
    return `${motionCarried(p, t) ? 'Carried' : 'Failed'} ${y}–${n}`;
  }
  const names = t.winners.map((id) => optionLabel(p, p.options.find((o) => o.id === id)!));
  return `${names.join(' / ')} · ${t.top} of ${t.total}`;
}

// ---------- writes ----------

export function createPoll(me: Me, d: PollDraft) {
  const labels = (d.kind === 'yesno' ? YES_NO : d.options.map((o) => o.trim()).filter(Boolean)).slice(0, 12);
  const options = labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label: label.slice(0, 80) }));
  return addDoc(collection(db, 'polls'), {
    question: d.question.trim().slice(0, 140),
    note: d.note.trim().slice(0, 500),
    kind: d.kind,
    options,
    ids: options.map((o) => o.id),
    audience: d.audience,
    anonymous: d.anonymous,
    reveal: d.reveal,
    official: d.official,
    closesAt: d.closesAt ? Timestamp.fromDate(d.closesAt) : null,
    status: 'open',
    voters: [],
    logged: false,
    by: me.id,
    byName: me.name,
    at: serverTimestamp(),
  });
}

/** First vote: the vote, my ballot pointing at it and my name on the voters list, together. */
export function castVote(me: Me, p: Poll, picks: string[]) {
  const b = writeBatch(db);
  const vote = p.anonymous ? doc(collection(db, 'polls', p.id, 'votes')) : doc(db, 'polls', p.id, 'votes', me.id);
  b.set(vote, p.anonymous ? { picks, at: serverTimestamp() } : { picks, memberId: me.id, name: me.name, at: serverTimestamp() });
  b.set(doc(db, 'pollBallots', `${p.id}_${me.id}`), { pollId: p.id, memberId: me.id, voteId: vote.id, at: serverTimestamp() });
  b.update(doc(db, 'polls', p.id), { voters: arrayUnion(me.id) });
  return b.commit();
}
export const changeVote = (pollId: string, voteId: string, picks: string[]) => updateDoc(doc(db, 'polls', pollId, 'votes', voteId), { picks, at: serverTimestamp() });

export const closePoll = (id: string) => updateDoc(doc(db, 'polls', id), { status: 'closed', closedAt: serverTimestamp() });
export const reopenPoll = (id: string, closesAt: Date | null) => updateDoc(doc(db, 'polls', id), { status: 'open', closedAt: null, closesAt: closesAt ? Timestamp.fromDate(closesAt) : null });

/** Close it first so its votes can be read, then clear them out with the comments. */
export async function deletePoll(p: Poll) {
  if (pollOpen(p)) await closePoll(p.id);
  const [votes, comments] = await Promise.all([getDocs(collection(db, 'polls', p.id, 'votes')), getDocs(collection(db, 'polls', p.id, 'comments'))]);
  const b = writeBatch(db);
  votes.docs.forEach((d) => b.delete(d.ref));
  comments.docs.forEach((d) => b.delete(d.ref));
  b.delete(doc(db, 'polls', p.id));
  return b.commit();
}

export const addComment = (me: Me, pollId: string, text: string) =>
  addDoc(collection(db, 'polls', pollId, 'comments'), { by: me.id, name: me.name, text: text.trim().slice(0, 280), at: serverTimestamp() });
export const removeComment = (pollId: string, id: string) => deleteDoc(doc(db, 'polls', pollId, 'comments', id));

/** An official result goes into the Archives timeline once. */
export function logResult(me: Me, p: Poll, votes: Vote[]) {
  const t = tally(p, votes);
  const when = (p.closedAt ?? p.closesAt ?? Timestamp.now()).toDate();
  const date = when.toISOString().slice(0, 10);
  const b = writeBatch(db);
  b.set(doc(collection(db, 'timeline')), {
    date,
    title: `Family vote: ${p.question}`.slice(0, 80),
    note: `${resultLine(p, t)}${t.total ? ` · ${t.total} voted` : ''}.`.slice(0, 300),
    by: me.id,
    at: serverTimestamp(),
  });
  b.update(doc(db, 'polls', p.id), { logged: true });
  return b.commit();
}

export function saveTemplate(t: Omit<PollTemplate, 'id'>, id?: string) {
  const data = { ...t, name: t.name.slice(0, 40), question: t.question.slice(0, 140), note: t.note.slice(0, 500), options: t.options.slice(0, 12) };
  return id ? setDoc(doc(db, 'pollTemplates', id), data) : addDoc(collection(db, 'pollTemplates'), data);
}
export const removeTemplate = (id: string) => deleteDoc(doc(db, 'pollTemplates', id));
