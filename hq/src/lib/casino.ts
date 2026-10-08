import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { ownedId } from './honors';

/**
 * The casino runs on play chips only: a weekly allowance, a daily bonus, chips for activity and
 * for unlocking honors, gifts between members and grants from High Table. Nothing real is at stake,
 * so games are dealt in the player's own browser.
 */

export interface Chips {
  id: string;
  balance: number;
  /** Week (YYYY-MM-DD of its Monday) and day the allowance and daily bonus were last paid. */
  lastWeekly?: string;
  lastDaily?: string;
  /** Activity already paid out for, so only new runs/fights/dinners pay. */
  paidFor?: Record<string, number>;
  /** Honors already paid out for. */
  honorsPaid?: string[];
  /** Parties the house already sent a gift for. */
  partiesPaid?: string[];
  hands?: number;
  chipsWon?: number;
  biggestWin?: number;
  blackjacks?: number;
  jackpots?: number;
  /** Net result this week, for the weekly board. */
  week?: string;
  weekNet?: number;
}
export interface CasinoSettings {
  weekly: number;
  daily: number;
  min: number;
  max: number;
  /** Max bet on event nights. */
  eventMax: number;
  perRun: number;
  perFight: number;
  perDinner: number;
  /** Chips for voting in a poll. */
  perVote: number;
  /** An event night: bigger max bets, and a banner on the floor. */
  eventUntil?: Timestamp | null;
  eventName?: string;
  /** Extra % on winnings during an event night. */
  eventBonus: number;
}
export const DEFAULT_CASINO: CasinoSettings = { weekly: 1000, daily: 50, min: 10, max: 500, eventMax: 2000, eventBonus: 10, perRun: 5, perFight: 25, perDinner: 50, perVote: 10, eventUntil: null, eventName: '' };

export const weekKey = (t = Date.now()) => {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
};
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const chipsFmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** A fair random integer in [0, n). */
export function rand(n: number) {
  const a = new Uint32Array(1);
  const lim = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(a);
  while (a[0]! >= lim);
  return a[0]! % n;
}

// ---------- cards ----------

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export interface Card {
  r: (typeof RANKS)[number];
  s: (typeof SUITS)[number];
}
export function deck(decks = 1): Card[] {
  const d: Card[] = [];
  for (let k = 0; k < decks; k++) for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}
export const isRed = (c: Card) => c.s === '♥' || c.s === '♦';

// ---------- the money side ----------

const ref = (id: string) => doc(db, 'chips', id);

/** Take the stake when a hand starts (so leaving mid-hand loses it, like a real table). */
export const stake = (me: string, bet: number) => updateDoc(ref(me), { balance: increment(-bet) });

// ---------- this sitting ----------
// How this session is going (since the page was opened), shown in the bet bar.

export interface Session {
  hands: number;
  wins: number;
  losses: number;
  net: number;
  best: number;
}
let session: Session = { hands: 0, wins: 0, losses: 0, net: 0, best: 0 };
const listeners = new Set<(s: Session) => void>();
export const getSession = () => session;
export const onSession = (f: (s: Session) => void) => (listeners.add(f), () => void listeners.delete(f));
function recordSession(net: number) {
  session = { hands: session.hands + 1, wins: session.wins + (net > 0 ? 1 : 0), losses: session.losses + (net < 0 ? 1 : 0), net: session.net + net, best: Math.max(session.best, net) };
  listeners.forEach((f) => f(session));
}

export type CasinoGame = 'blackjack' | 'roulette' | 'slots' | 'poker';
export const GAME_NAMES: Record<CasinoGame, string> = { blackjack: 'Blackjack', roulette: 'Roulette', slots: 'Golden Reels', poker: 'Video Poker' };
/** A win this big goes on the floor's big-wins ticker. */
export const BIG_WIN = 500;
export interface BigWin {
  id: string;
  by: string;
  name: string;
  game: CasinoGame;
  amount: number;
  note: string;
  at?: Timestamp;
}

/** Pay out a finished round and keep the stats. `paid` is what comes back (stake included); `bet` what went in. */
export async function settle(
  me: string,
  bet: number,
  paid0: number,
  extra: { blackjack?: boolean; jackpot?: boolean; bonus?: number; game?: CasinoGame; name?: string; note?: string } = {},
) {
  // Event nights pay a bonus on winnings.
  const paid = paid0 > bet && extra.bonus ? paid0 + Math.floor(((paid0 - bet) * extra.bonus) / 100) : paid0;
  const net = paid - bet;
  recordSession(net);
  if (extra.game && extra.name && net >= BIG_WIN)
    void addDoc(collection(db, 'casinoWins'), { by: me, name: extra.name.slice(0, 40), game: extra.game, amount: Math.round(net), note: (extra.note ?? '').slice(0, 60), at: serverTimestamp() }).catch(() => {});
  const snap = await getDoc(ref(me));
  const c = (snap.data() ?? {}) as Partial<Chips>;
  const wk = weekKey();
  await updateDoc(ref(me), {
    balance: increment(paid),
    hands: increment(1),
    ...(net > 0 ? { chipsWon: increment(net) } : {}),
    ...(net > (c.biggestWin ?? 0) ? { biggestWin: net } : {}),
    ...(extra.blackjack ? { blackjacks: increment(1) } : {}),
    ...(extra.jackpot ? { jackpots: increment(1) } : {}),
    ...(c.week === wk ? { weekNet: increment(net) } : { week: wk, weekNet: net }),
  });
}

/** Chips sent to someone: they land when the receiver next opens the HQ. */
export interface ChipGift {
  id: string;
  to: string;
  from: string;
  fromName: string;
  amount: number;
  reason: string;
  /** A High Table grant (doesn't come out of anyone's stack). */
  grant: boolean;
  claimed: boolean;
  at?: Timestamp;
}
/** Send chips from my stack. */
export function sendChips(me: { id: string; name: string }, to: string, amount: number, reason: string) {
  const b = writeBatch(db);
  b.update(ref(me.id), { balance: increment(-amount) });
  b.set(doc(collection(db, 'chipGifts')), { to, from: me.id, fromName: me.name, amount, reason: reason.slice(0, 80), grant: false, claimed: false, at: serverTimestamp() });
  return b.commit();
}
/** High Table hands out chips (prizes). */
export const grantChips = (me: { id: string; name: string }, to: string, amount: number, reason: string) =>
  addDoc(collection(db, 'chipGifts'), { to, from: me.id, fromName: me.name, amount, reason: reason.slice(0, 80), grant: true, claimed: false, at: serverTimestamp() });
export function claimGift(me: string, g: ChipGift) {
  const b = writeBatch(db);
  b.update(doc(db, 'chipGifts', g.id), { claimed: true });
  b.update(ref(me), { balance: increment(g.amount) });
  return b.commit();
}

/** Buy an honor from the chip shop. */
export function buyHonor(me: { id: string; name: string }, honorId: string, price: number) {
  const b = writeBatch(db);
  b.update(ref(me.id), { balance: increment(-price) });
  b.set(doc(db, 'honorsOwned', ownedId(me.id, honorId)), { memberId: me.id, honorId, by: 'shop', byName: 'The chip shop', note: '', seen: false, at: serverTimestamp() });
  return b.commit();
}

export const saveCasino = (s: CasinoSettings) => setDoc(doc(db, 'settings', 'casino'), s);
export const openChips = (me: string, start: number) => setDoc(ref(me), { balance: start, lastWeekly: weekKey(), lastDaily: dayKey(), paidFor: {}, honorsPaid: [] }, { merge: true });
