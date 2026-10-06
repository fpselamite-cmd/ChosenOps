import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import { Crosshair, Flag, FlaskConical, Handshake, MapPin, Skull, Sprout, Store, Warehouse, type LucideIcon } from 'lucide-react';
import type { Audience, AudienceDraft } from './audience';
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
export const pinType = (id: string) => PIN_TYPES.find((t) => t.id === id) ?? PIN_TYPES[PIN_TYPES.length - 1]!;

export interface Pin extends Audience {
  id: string;
  name: string;
  type: string;
  note?: string;
  /** Position on the map image, 0–1 from the left and from the top. */
  x: number;
  y: number;
  ownerName?: string;
  at?: Timestamp;
}

export type PinDraft = Pick<Pin, 'name' | 'type' | 'note' | 'x' | 'y'> & AudienceDraft;

export const addPin = (me: { id: string; name: string }, p: PinDraft) =>
  addDoc(collection(db, 'pins'), { ...p, owner: me.id, ownerName: me.name, at: serverTimestamp() });
export const savePin = (id: string, p: Partial<PinDraft>) => updateDoc(doc(db, 'pins', id), p);
export const removePin = (id: string) => deleteDoc(doc(db, 'pins', id));
