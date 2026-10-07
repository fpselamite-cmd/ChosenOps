import { addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import type { Audience, AudienceDraft } from './audience';
import { db } from './firebase';
import { TZ } from './format';

/** Calendar days are Eastern time days, like the city clock. */
export interface ETParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  /** 0 = Sunday */
  wd: number;
}
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' });
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function et(t: Date | number): ETParts {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour! % 24, mi: +p.minute!, wd: WD.indexOf(p.weekday!) };
}
/** The moment an Eastern wall-clock time happens. Day overflow is fine (day 32 rolls into next month). */
export function fromET(y: number, m: number, d: number, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = et(guess);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  const first = guess - (asUTC - guess);
  // Second pass settles DST edges.
  const q = et(first);
  return new Date(first - (Date.UTC(q.y, q.m - 1, q.d, q.h, q.mi) - guess));
}
export const dayKey = (p: Pick<ETParts, 'y' | 'm' | 'd'>) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
export const keyOf = (t: Date | number) => dayKey(et(t));
export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
};
export const addDays = (k: string, n: number) => {
  const { y, m, d } = parseKey(k);
  return keyOf(fromET(y, m, d + n, 12));
};
export const timeLabel = (t: Date) => t.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export type Repeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'none', label: 'Once' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Every month' },
];

export const EVENT_KINDS: { id: string; label: string; color: string }[] = [
  { id: 'meeting', label: 'Meeting', color: '#d4af37' },
  { id: 'blacksite', label: 'Blacksite', color: '#ef4444' },
  { id: 'heist', label: 'Heist / job', color: '#f97316' },
  { id: 'op', label: 'Op', color: '#22c55e' },
  { id: 'party', label: 'Party', color: '#a78bfa' },
  { id: 'other', label: 'Other', color: '#a1a1aa' },
];
export const eventKind = (id: string) => EVENT_KINDS.find((k) => k.id === id) ?? EVENT_KINDS[EVENT_KINDS.length - 1]!;

export type Rsvp = 'yes' | 'maybe' | 'no';
export interface CalEvent extends Audience {
  id: string;
  title: string;
  kind: string;
  start: Timestamp;
  mins: number;
  repeat: Repeat;
  place?: string;
  /** Where on the map: a pin id, or `spot:<id>` for a blacksite location. */
  pinId?: string | null;
  note?: string;
  rsvp: Record<string, Rsvp>;
  ownerName?: string;
}
export type EventDraft = Pick<CalEvent, 'title' | 'kind' | 'mins' | 'repeat' | 'place' | 'pinId' | 'note'> & { start: Date } & AudienceDraft;

/** One thing on one day: a posted event (or one repeat of it), an ops timer, a birthday… */
export interface Occurrence {
  key: string;
  day: string;
  at: Date;
  /** All-day things (birthdays) have no time. */
  allDay?: boolean;
  title: string;
  color: string;
  kind: 'event' | 'grow' | 'cook' | 'run' | 'birthday' | 'anniversary' | 'fight';
  sub?: string;
  /** Where tapping it goes (e.g. a blacksite fight). */
  href?: string;
  event?: CalEvent;
  memberId?: string;
}

/** Every time an event happens between two days (inclusive), following its repeat in Eastern time. */
export function occurrences(e: CalEvent, from: string, to: string): Occurrence[] {
  const s = et(e.start.toDate());
  const out: Occurrence[] = [];
  const end = fromET(...(Object.values(parseKey(to)) as [number, number, number]), 23, 59).getTime();
  const startFrom = fromET(...(Object.values(parseKey(from)) as [number, number, number])).getTime();
  const step = (i: number) => {
    if (e.repeat === 'monthly') return fromET(s.y, s.m + i, s.d, s.h, s.mi);
    const days = e.repeat === 'daily' ? 1 : e.repeat === 'weekly' ? 7 : 14;
    return fromET(s.y, s.m, s.d + i * days, s.h, s.mi);
  };
  if (e.repeat === 'none') {
    const t = e.start.toDate();
    if (t.getTime() >= startFrom && t.getTime() <= end) out.push(occ(e, t));
    return out;
  }
  // Skip ahead close to the window, then walk it.
  const per = e.repeat === 'daily' ? 1 : e.repeat === 'weekly' ? 7 : e.repeat === 'biweekly' ? 14 : 28;
  let i = Math.max(0, Math.floor((startFrom - e.start.toMillis()) / (per * 86400e3)) - 2);
  for (let n = 0; n < 400; n++, i++) {
    const t = step(i);
    if (t.getTime() > end) break;
    if (t.getTime() >= startFrom) out.push(occ(e, t));
  }
  return out;
}
const occ = (e: CalEvent, t: Date): Occurrence => ({
  key: `${e.id}@${t.getTime()}`,
  day: keyOf(t),
  at: t,
  title: e.title,
  color: eventKind(e.kind).color,
  kind: 'event',
  sub: e.place,
  event: e,
});

export const addEvent = (me: { id: string; name: string }, e: EventDraft) =>
  addDoc(collection(db, 'events'), { ...e, start: Timestamp.fromDate(e.start), owner: me.id, ownerName: me.name, rsvp: { [me.id]: 'yes' }, at: serverTimestamp() });
export const saveEvent = (id: string, e: EventDraft) => updateDoc(doc(db, 'events', id), { ...e, start: Timestamp.fromDate(e.start) });
export const removeEvent = (id: string) => deleteDoc(doc(db, 'events', id));
export const rsvp = (id: string, me: string, v: Rsvp) => updateDoc(doc(db, 'events', id), { [`rsvp.${me}`]: v });
