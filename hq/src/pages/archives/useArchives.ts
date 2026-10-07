import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { DinnerNote, Lore, React, TimelineEvent } from '../../lib/archives';
import { db } from '../../lib/firebase';
import { useWelcomeAccess } from '../welcome/useWelcome';

/** Members read the Archives (not associates); the Archivist role and High Table write. */
export function useArchiveAccess() {
  const { me, isLead, rolesOf } = useHub();
  const { assocRank } = useWelcomeAccess();
  const blooded = !(assocRank && me.rankId === assocRank.id);
  const isArchivist = isLead || rolesOf(me.id).some((r) => r.id === 'archivist');
  return { blooded, isArchivist };
}

const newest = <T extends { at?: { toMillis(): number } }>(a: T, b: T) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now());

export function useArchives() {
  const { me } = useHub();
  const { blooded, isArchivist } = useArchiveAccess();
  const on = blooded;
  // The Archivist sees drafts and submissions too; everyone else only what's published (and their own stories).
  const notesQ = useMemo(() => (isArchivist ? collection(db, 'dinnerNotes') : query(collection(db, 'dinnerNotes'), where('status', '==', 'published'))), [isArchivist]);
  const loreQ = useMemo(() => (isArchivist ? collection(db, 'lore') : query(collection(db, 'lore'), where('status', '==', 'published'))), [isArchivist]);
  const mineQ = useMemo(() => query(collection(db, 'lore'), where('by', '==', me.id)), [me.id]);
  const notes = (useCollection<DinnerNote>(notesQ, on) ?? []).sort((a, b) => b.date.localeCompare(a.date));
  const lore = useCollection<Lore>(loreQ, on) ?? [];
  const mine = useCollection<Lore>(mineQ, on && !isArchivist) ?? [];
  const allLore = [...lore, ...mine.filter((m) => !lore.some((l) => l.id === m.id))].sort(newest);
  const timeline = (useCollection<TimelineEvent>('timeline', on) ?? []).sort((a, b) => b.date.localeCompare(a.date));
  const reacts = useCollection<React>('archiveReacts', on) ?? [];
  return { notes, lore: allLore, timeline, reacts };
}
export type ArchiveData = ReturnType<typeof useArchives>;

/** Chapters in book order, then by when they were written. */
export const byChapter = (a: Lore, b: Lore) => (a.order || 999) - (b.order || 999) || (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0);

export const roman = (n: number) => {
  const r: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of r) while (n >= v) (out += s), (n -= v);
  return out;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nth = (d: number) => (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
/** "Sunday, the 5th of October 2026" for a YYYY-MM-DD. */
export function oldDate(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${wd}, the ${d}${nth(d)} of ${MONTHS[m - 1]} ${y}`;
}
export const shortDate = (day: string) => {
  const [, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]!.slice(0, 3)} ${d}`;
};
