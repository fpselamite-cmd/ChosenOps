import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { useHub } from '../hooks/useHub';
import { Crosshair, Flag, FlaskConical, Handshake, MapPin, Skull, Sprout, Store, Warehouse, type LucideIcon } from 'lucide-react';
import { useVisible, type Audience, type AudienceDraft } from './audience';
import { db } from './firebase';

export const PIN_TYPES: { id: string; label: string; color: string; icon: LucideIcon }[] = [
  { id: 'grow', label: 'Grow', color: '#22c55e', icon: Sprout },
  { id: 'stash', label: 'Stash house', color: '#d4af37', icon: Warehouse },
  { id: 'lab', label: 'Lab', color: '#22d3ee', icon: FlaskConical },
  { id: 'blacksite', label: 'Blacksite', color: '#ef4444', icon: Crosshair },
  { id: 'turf', label: 'Our turf', color: '#f5d77a', icon: Flag },
  { id: 'rival', label: 'Rivals', color: '#b91c1c', icon: Skull },
  { id: 'meet', label: 'Meet spot', color: '#a78bfa', icon: Handshake },
  { id: 'shop', label: 'Shop / plug', color: '#60a5fa', icon: Store },
  { id: 'other', label: 'Other', color: '#a1a1aa', icon: MapPin },
];
/** Pin types only Narco (and High Table) see: grows, stash houses and labs. */
export const NARCO_PINS = new Set(['grow', 'stash', 'lab']);
export const pinTypesFor = (narco: boolean) => (narco ? PIN_TYPES : PIN_TYPES.filter((t) => !NARCO_PINS.has(t.id)));
export const pinShows = (p: { type: string }, narco: boolean) => narco || !NARCO_PINS.has(p.type);
export const pinType = (id: string) => PIN_TYPES.find((t) => t.id === id) ?? PIN_TYPES[PIN_TYPES.length - 1]!;

export interface Pin extends Audience {
  id: string;
  name: string;
  type: string;
  note?: string;
  /** Position on the map image, 0–1 from the left and from the top. */
  x: number;
  y: number;
  /** In-city postal, typed by whoever drops it. */
  postal?: string;
  /** A screenshot of the spot (door, entrance). */
  photo?: string | null;
  /** Door codes, keys, who has access. Seen by the same people as the pin. */
  access?: string;
  /** The stash this place is (a Stash page location id). */
  stashId?: string | null;
  ownerName?: string;
  at?: Timestamp;
}

export type PinDraft = Pick<Pin, 'name' | 'type' | 'note' | 'x' | 'y' | 'postal' | 'photo' | 'access' | 'stashId'> & AudienceDraft;

/** Grows, stash houses and labs live in their own collection that only Narco (and High Table) can read. */
export const pinColl = (type: string) => (NARCO_PINS.has(type) ? 'narcoPins' : 'pins');

export const addPin = (me: { id: string; name: string }, p: PinDraft) =>
  addDoc(collection(db, pinColl(p.type)), { ...p, owner: me.id, ownerName: me.name, at: serverTimestamp() });
/** Saves a pin; changing it to or from a Narco type moves it to the other collection. */
export async function savePin(pin: Pin, p: Partial<PinDraft>) {
  const from = pinColl(pin.type);
  const to = pinColl(p.type ?? pin.type);
  if (from === to) return updateDoc(doc(db, from, pin.id), p);
  const { id, ...rest } = { ...pin, ...p };
  const b = writeBatch(db);
  b.set(doc(db, to, id), rest);
  b.delete(doc(db, from, id));
  return b.commit();
}
export const removePin = (pin: Pin) => deleteDoc(doc(db, pinColl(pin.type), pin.id));

/** Every pin I may see: the family's, plus the Narco ones if I'm Narco. */
export function usePins() {
  const { narco } = useHub();
  const plain = useVisible<Pin>('pins');
  const drugs = useVisible<Pin>('narcoPins', narco);
  return useMemo(() => (plain && (!narco || drugs) ? [...plain.filter((p) => !NARCO_PINS.has(p.type)), ...(narco ? drugs! : [])] : null), [plain, drugs, narco]);
}
/** Moves a pin sitting in the wrong collection (from before the split). Used once by Narco members. */
export const movePin = (from: 'pins' | 'narcoPins', p: Pin) => {
  const { id, ...rest } = p;
  return setDoc(doc(db, from === 'pins' ? 'narcoPins' : 'pins', id), rest).then(() => deleteDoc(doc(db, from, id)));
};
