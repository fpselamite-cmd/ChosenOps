import { arrayUnion, deleteDoc, doc, increment, serverTimestamp, setDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { et, keyOf } from './calendar';
import { db } from './firebase';
import type { Member } from './types';

/**
 * Parties: birthdays (from the character sheet) and family anniversaries (from the join date, every
 * year plus 1, 3 and 6 months). On the day, everyone sees a banner, signs a card and can send chips;
 * the house sends a gift of its own.
 */

export type PartyKind = 'birthday' | 'anniversary';
export interface Party {
  /** birthday_{member}_{year} or anniversary_{member}_{date}. */
  id: string;
  kind: PartyKind;
  member: Member;
  /** "Birthday", "2 years in the family", "3 months in the family". */
  label: string;
  /** Whole years for a yearly anniversary; 0 for months and birthdays. */
  years: number;
  months: number;
}
export interface PartyNote {
  id: string;
  party: string;
  /** Who the card is for. */
  for: string;
  kind: PartyKind;
  label: string;
  by: string;
  name: string;
  text: string;
  at?: Timestamp;
}

export const MONTH_MILESTONES = [1, 3, 6];
/** The house's gift: a birthday, each year in the family, or a month milestone. */
export const HOUSE_GIFT = { birthday: 1000, perYear: 1000, perMonth: 250 };
export const giftFor = (p: Pick<Party, 'kind' | 'years' | 'months'>) =>
  p.kind === 'birthday' ? HOUSE_GIFT.birthday : p.years ? p.years * HOUSE_GIFT.perYear : p.months * HOUSE_GIFT.perMonth;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Everyone celebrating on a day (Eastern time). */
export function partiesOn(roster: Member[], t = Date.now()): Party[] {
  const today = et(t);
  const mmdd = `${String(today.m).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;
  const out: Party[] = [];
  for (const m of roster) {
    if (m.birthday === mmdd) out.push({ id: `birthday_${m.id}_${today.y}`, kind: 'birthday', member: m, label: 'Birthday', years: 0, months: 0 });
    if (!m.joinedAt) continue;
    const j = et(m.joinedAt.toDate());
    if (j.d !== today.d) continue;
    const months = (today.y - j.y) * 12 + (today.m - j.m);
    if (months <= 0) continue;
    const years = months % 12 === 0 ? months / 12 : 0;
    if (!years && !MONTH_MILESTONES.includes(months)) continue;
    out.push({ id: `anniversary_${m.id}_${keyOf(t)}`, kind: 'anniversary', member: m, label: `${years ? plural(years, 'year') : plural(months, 'month')} in the family`, years, months: years ? 0 : months });
  }
  return out;
}

export const signCard = (me: { id: string; name: string }, p: Party, text: string) =>
  setDoc(doc(db, 'partyNotes', `${p.id}_${me.id}`), { party: p.id, for: p.member.id, kind: p.kind, label: p.label, by: me.id, name: me.name, text: text.trim().slice(0, 200), at: serverTimestamp() });
export const unsignCard = (id: string) => deleteDoc(doc(db, 'partyNotes', id));

/** The honoree collects the house's gift once per party. */
export function collectGift(memberId: string, p: Party) {
  const b = writeBatch(db);
  b.update(doc(db, 'chips', memberId), { balance: increment(giftFor(p)), partiesPaid: arrayUnion(p.id) });
  return b.commit();
}
