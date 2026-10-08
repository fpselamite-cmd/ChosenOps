import { doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The family's radio channels, shown in the header. Each channel is its own doc so the security rules
 * can keep the main and heist channels away from associates:
 * - radio/associate: everyone signed in (associates only see this one)
 * - radio/main: blooded members (soldiers and up)
 * - radio/heist: blooded members, and only while `active`
 */
export type RadioId = 'associate' | 'main' | 'heist';
export interface Radio {
  id: RadioId;
  freq: string;
  password: string;
  /** The heist channel only shows while a heist is on. */
  active?: boolean;
  note?: string;
  byName?: string;
  at?: Timestamp;
}
export const RADIOS: { id: RadioId; label: string; tone: string }[] = [
  { id: 'associate', label: 'Associate radio', tone: '#38bdf8' },
  { id: 'main', label: 'Family radio', tone: '#d4af37' },
  { id: 'heist', label: 'Heist radio', tone: '#ef4444' },
];

export const saveRadio = (me: { name: string }, id: RadioId, r: Pick<Radio, 'freq' | 'password' | 'note'> & { active?: boolean }) =>
  setDoc(doc(db, 'radio', id), {
    freq: r.freq.trim().slice(0, 20),
    password: r.password.trim().slice(0, 40),
    note: (r.note ?? '').trim().slice(0, 100),
    ...(id === 'heist' ? { active: !!r.active } : {}),
    byName: me.name,
    at: serverTimestamp(),
  });
