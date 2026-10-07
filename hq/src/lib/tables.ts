import { addDoc, collection, deleteDoc, deleteField, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { Card } from './casino';
import { db } from './firebase';

/**
 * Live tables: one shared table per document. The host's browser deals (it runs the game
 * engine); players only write their own seat, bets and moves. If the host goes quiet, any
 * seated player can take over dealing.
 */

export type LiveGame = 'roulette' | 'blackjack' | 'slots' | 'poker';
export const LIVE_GAMES: { id: LiveGame; name: string; seats: number }[] = [
  { id: 'roulette', name: 'Roulette', seats: 8 },
  { id: 'blackjack', name: 'Blackjack', seats: 5 },
  { id: 'slots', name: 'Slot hall', seats: 8 },
  { id: 'poker', name: '5-card draw poker', seats: 6 },
];

export interface Seat {
  name: string;
  at: number;
}
/** A player's move, numbered so the host handles each once. */
export interface Act {
  a: string;
  /** Round it belongs to. */
  n: number;
  /** Counter within the round. */
  k: number;
  amt?: number;
  idx?: number[];
}
export interface LiveTable<R = unknown> {
  id: string;
  game: LiveGame;
  name: string;
  host: string;
  hostName: string;
  status: 'open' | 'closed';
  maxSeats: number;
  /** The minimum bet (the ante at poker). */
  minBet: number;
  seats: Record<string, Seat>;
  /** Each player's bets for the current round. */
  bets: Record<string, { n: number; total: number; spots?: Record<string, number> }>;
  actions: Record<string, Act>;
  /** The round each player last settled their chips for. */
  done: Record<string, number>;
  /** Slot hall: each player's latest spin. */
  last: Record<string, { line: number[]; mult: number; bet: number; at: number }>;
  round: R;
  /** The host's heartbeat. */
  beat?: Timestamp;
  at?: Timestamp;
}

const tref = (id: string) => doc(db, 'casinoTables', id);

export function openTable(me: { id: string; name: string }, game: LiveGame, name: string, minBet: number) {
  const g = LIVE_GAMES.find((x) => x.id === game)!;
  return addDoc(collection(db, 'casinoTables'), {
    game,
    name: name.trim().slice(0, 40) || `${me.name}'s ${g.name}`,
    host: me.id,
    hostName: me.name,
    status: 'open',
    maxSeats: g.seats,
    minBet,
    seats: { [me.id]: { name: me.name, at: Date.now() } },
    bets: {},
    actions: {},
    done: {},
    last: {},
    round: { n: 0, phase: 'idle' },
    beat: serverTimestamp(),
    at: serverTimestamp(),
  });
}
export const sit = (t: LiveTable, me: { id: string; name: string }) => updateDoc(tref(t.id), { [`seats.${me.id}`]: { name: me.name, at: Date.now() } });
/** Leave: if you're the host, hand the deal to someone still seated (or close an empty table). */
export function stand(t: LiveTable, me: string) {
  const rest = Object.keys(t.seats).filter((id) => id !== me);
  if (t.host === me) {
    if (!rest.length) return deleteDoc(tref(t.id));
    const next = rest[0]!;
    return updateDoc(tref(t.id), { [`seats.${me}`]: deleteField(), host: next, hostName: t.seats[next]!.name, beat: serverTimestamp() });
  }
  return updateDoc(tref(t.id), { [`seats.${me}`]: deleteField() });
}
export const takeOver = (t: LiveTable, me: { id: string; name: string }) => updateDoc(tref(t.id), { host: me.id, hostName: me.name, beat: serverTimestamp() });
export const heartbeat = (id: string) => updateDoc(tref(id), { beat: serverTimestamp() });
export const closeTable = (id: string) => deleteDoc(tref(id));

export const placeBets = (t: LiveTable, me: string, n: number, total: number, spots?: Record<string, number>) =>
  updateDoc(tref(t.id), { [`bets.${me}`]: { n, total, ...(spots ? { spots } : {}) } });
export const act = (t: LiveTable, me: string, a: Omit<Act, 'k'>) => updateDoc(tref(t.id), { [`actions.${me}`]: { ...a, k: (t.actions[me]?.n === a.n ? t.actions[me]!.k : 0) + 1 } });
export const markDone = (t: LiveTable, me: string, n: number) => updateDoc(tref(t.id), { [`done.${me}`]: n });
export const postSpin = (t: LiveTable, me: string, line: number[], mult: number, bet: number) => updateDoc(tref(t.id), { [`last.${me}`]: { line, mult, bet, at: Date.now() } });

/** Host only: write the round (the whole game state). */
export const setRound = (id: string, round: unknown) => updateDoc(tref(id), { round, beat: serverTimestamp() });

/** Poker hands are private: only the player (and the dealer, who dealt them) can read them. */
export const dealHand = (tableId: string, memberId: string, cards: Card[], n: number) => setDoc(doc(db, 'casinoTables', tableId, 'hands', memberId), { cards, n });
