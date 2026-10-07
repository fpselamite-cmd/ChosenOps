import { deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Honors: badges, titles, portrait frames, color hues and name effects members unlock by hitting
 * milestones (automatic), or that High Table hands out. Each has a rarity with its own color, points
 * and animation. Members equip what they own as a loadout shown on their character page.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: { id: Rarity; label: string; color: string; points: number }[] = [
  { id: 'common', label: 'Common', color: '#a1a1aa', points: 1 },
  { id: 'uncommon', label: 'Uncommon', color: '#22c55e', points: 3 },
  { id: 'rare', label: 'Rare', color: '#3b82f6', points: 8 },
  { id: 'epic', label: 'Epic', color: '#a855f7', points: 20 },
  { id: 'legendary', label: 'Legendary', color: '#f5b931', points: 50 },
  { id: 'mythic', label: 'Mythic', color: '#e11d2e', points: 120 },
];
export const rarityOf = (r?: string) => RARITIES.find((x) => x.id === r) ?? RARITIES[0]!;
/** Epic and up keep how they're earned a secret until you have one. */
export const HIGH_TIER: Rarity[] = ['epic', 'legendary', 'mythic'];

export type HonorKind = 'badge' | 'title' | 'frame' | 'hue' | 'effect';
export const KINDS: { id: HonorKind; label: string; plural: string }[] = [
  { id: 'badge', label: 'Badge', plural: 'Badges' },
  { id: 'title', label: 'Title', plural: 'Titles' },
  { id: 'frame', label: 'Portrait frame', plural: 'Frames' },
  { id: 'hue', label: 'Color hue', plural: 'Hues' },
  { id: 'effect', label: 'Name effect', plural: 'Name effects' },
];

export const FRAME_THEMES = ['iron', 'barbed', 'roses', 'skulls', 'money', 'crown', 'flames', 'chips', 'cards'] as const;
export type FrameTheme = (typeof FRAME_THEMES)[number];
export const EFFECTS = ['shimmer', 'flames', 'glitch', 'starlight', 'blood'] as const;
export type NameEffect = (typeof EFFECTS)[number];
/** Badge icons, by lucide name (see HonorArt). */
export const BADGE_ICONS = ['Skull', 'Crown', 'Swords', 'Crosshair', 'Flag', 'Star', 'Package', 'Car', 'Sprout', 'FlaskConical', 'Box', 'Gem', 'WashingMachine', 'HandCoins', 'Utensils', 'CalendarDays', 'Flame', 'Landmark', 'Coins', 'Feather', 'Eye', 'Target', 'MessageCircle', 'Shield', 'Heart', 'Moon', 'Rose', 'Zap', 'Trophy', 'Ghost', 'Spade', 'Club', 'Diamond', 'Dices', 'Cherry'] as const;
export const BADGE_SHAPES = ['gem', 'shield', 'hex'] as const;

/** What a milestone counts. */
export const STATS = [
  { id: 'runs', label: 'Runs', group: 'Work & sales' },
  { id: 'harvests', label: 'Harvests', group: 'Work & sales' },
  { id: 'cooks', label: 'Cooks', group: 'Work & sales' },
  { id: 'pressed', label: 'Bricks pressed', group: 'Work & sales' },
  { id: 'sold', label: 'Product sold', group: 'Work & sales' },
  { id: 'washed', label: 'Money washed ($)', group: 'Work & sales' },
  { id: 'petty', label: 'Petty crimes', group: 'Work & sales' },
  { id: 'fights', label: 'Blacksites fought', group: 'Fights' },
  { id: 'wins', label: 'Blacksites won', group: 'Fights' },
  { id: 'mvps', label: 'Blacksite MVPs', group: 'Fights' },
  { id: 'kills', label: 'Blacksite kills', group: 'Fights' },
  { id: 'dinners', label: 'Dinners at the table', group: 'Family life' },
  { id: 'duesPaid', label: 'Dues payments', group: 'Family life' },
  { id: 'days', label: 'Days in the family', group: 'Family life' },
  { id: 'streak', label: 'Best login streak', group: 'Family life' },
  { id: 'repSent', label: 'Rep given to the family', group: 'Family life' },
  { id: 'stories', label: 'Stories in the Archives', group: 'Fun & lore' },
  { id: 'sightings', label: 'Rival sightings reported', group: 'Fun & lore' },
  { id: 'bounties', label: 'Bounties collected', group: 'Fun & lore' },
  { id: 'reactions', label: 'Reactions in the Archives', group: 'Fun & lore' },
  { id: 'hands', label: 'Casino games played', group: 'Casino' },
  { id: 'chipsWon', label: 'Chips won (lifetime)', group: 'Casino' },
  { id: 'biggestWin', label: 'Biggest single win', group: 'Casino' },
  { id: 'blackjacks', label: 'Blackjacks dealt', group: 'Casino' },
  { id: 'jackpots', label: 'Slot jackpots', group: 'Casino' },
] as const;
export type StatId = (typeof STATS)[number]['id'];
export type HonorStats = Record<StatId, number>;

export interface Honor {
  id: string;
  kind: HonorKind;
  name: string;
  /** Shown once unlocked (or for low tiers, as the goal). */
  description: string;
  rarity: Rarity;
  /** milestone: unlocks itself when `stat` reaches `goal`. honor: High Table gives it. */
  source: 'milestone' | 'honor';
  stat?: StatId | null;
  goal?: number;
  /** Hidden ("???") until earned. */
  secret?: boolean;
  /** Seasonal: only earnable in this window, labelled with the season forever. */
  season?: string | null;
  startsAt?: Timestamp | null;
  endsAt?: Timestamp | null;
  // Looks, by kind:
  /** For sale in the casino's chip shop at this price (0 = not for sale). */
  price?: number;
  /** Chips paid out when unlocked (defaults by rarity). */
  chips?: number;
  icon?: string;
  shape?: (typeof BADGE_SHAPES)[number];
  theme?: FrameTheme;
  color?: string;
  effect?: NameEffect;
  /** proposed (by the Archivist) → active; retired ones stay owned but can't be earned. */
  status: 'active' | 'proposed' | 'retired';
  by?: string;
  at?: Timestamp;
}

export interface Owned {
  id: string;
  memberId: string;
  honorId: string;
  /** 'milestone' if earned, else who gave it. */
  by: string;
  byName: string;
  note: string;
  seen: boolean;
  at?: Timestamp;
}
export const ownedId = (memberId: string, honorId: string) => `${memberId}_${honorId}`;

/** What someone has on: shown on their character page and the Vault. */
export interface Loadout {
  id: string;
  title?: string | null;
  frame?: string | null;
  effect?: string | null;
  nameHue?: string | null;
  accentHue?: string | null;
  trimHue?: string | null;
  backdropHue?: string | null;
  showcase?: string[];
}
export const HUE_SLOTS: { id: keyof Loadout; label: string; hint: string }[] = [
  { id: 'nameHue', label: 'Name color', hint: 'Everyone sees it' },
  { id: 'backdropHue', label: 'Profile backdrop', hint: 'Everyone sees it' },
  { id: 'accentHue', label: 'App accent', hint: 'Buttons and glow, just for you' },
  { id: 'trimHue', label: 'Panel trim', hint: 'Borders and corners, just for you' },
];

/** The starting catalog: High Table can edit, retire or add to it. */
const m = (id: string, kind: HonorKind, name: string, rarity: Rarity, stat: StatId, goal: number, description: string, look: Partial<Honor> = {}): Omit<Honor, 'at'> => ({
  id, kind, name, rarity, source: 'milestone', stat, goal, description, status: 'active', secret: false, season: null, startsAt: null, endsAt: null, ...look,
});
const h = (id: string, kind: HonorKind, name: string, rarity: Rarity, description: string, look: Partial<Honor> = {}): Omit<Honor, 'at'> => ({
  id, kind, name, rarity, source: 'honor', stat: null, goal: 0, description, status: 'active', secret: false, season: null, startsAt: null, endsAt: null, ...look,
});
export const DEFAULT_HONORS: Omit<Honor, 'at'>[] = [
  // Badges · fights
  m('first-blood', 'badge', 'First Blood', 'common', 'fights', 1, 'Fought your first blacksite.', { icon: 'Swords', shape: 'shield' }),
  m('took-ground', 'badge', 'Taker of Ground', 'uncommon', 'wins', 5, 'Won five blacksites.', { icon: 'Flag', shape: 'shield' }),
  m('regular', 'badge', 'Blacksite Regular', 'rare', 'fights', 25, 'Fought twenty-five blacksites.', { icon: 'Crosshair', shape: 'hex' }),
  m('mvp', 'badge', 'Most Valuable', 'rare', 'mvps', 1, 'Voted MVP of a blacksite.', { icon: 'Star', shape: 'gem' }),
  m('body-count', 'badge', 'Body Count', 'epic', 'kills', 100, 'A hundred kills at the blacksites.', { icon: 'Skull', shape: 'hex' }),
  m('warlord', 'badge', 'Warlord', 'legendary', 'fights', 100, 'A hundred blacksites. They know the name.', { icon: 'Crown', shape: 'shield' }),
  // Badges · work
  m('delivery', 'badge', 'Delivery Boy', 'common', 'runs', 25, 'Twenty-five runs done.', { icon: 'Package', shape: 'gem' }),
  m('green-thumb', 'badge', 'Green Thumb', 'uncommon', 'harvests', 50, 'Fifty harvests.', { icon: 'Sprout', shape: 'gem' }),
  m('petty-thief', 'badge', 'Petty Thief', 'uncommon', 'petty', 100, 'A hundred petty crimes.', { icon: 'HandCoins', shape: 'gem' }),
  m('cook', 'badge', 'The Cook', 'rare', 'cooks', 50, 'Fifty cooks in the lab.', { icon: 'FlaskConical', shape: 'hex' }),
  m('bricklayer', 'badge', 'Brick Layer', 'rare', 'pressed', 100, 'A hundred bricks pressed.', { icon: 'Box', shape: 'hex' }),
  m('kingpin-badge', 'badge', 'Moving Weight', 'epic', 'sold', 1000, 'A thousand units sold.', { icon: 'Gem', shape: 'gem' }),
  m('laundromat', 'badge', 'The Laundromat', 'legendary', 'washed', 1000000, 'A million dollars washed clean.', { icon: 'WashingMachine', shape: 'gem' }),
  // Badges · family
  m('seat', 'badge', 'A Seat at the Table', 'common', 'dinners', 1, 'Your first family dinner.', { icon: 'Utensils', shape: 'shield' }),
  m('one-month', 'badge', 'One Month In', 'common', 'days', 30, 'A month in the family.', { icon: 'CalendarDays', shape: 'shield' }),
  m('dues', 'badge', 'Pays His Dues', 'uncommon', 'duesPaid', 20, 'Twenty dues payments.', { icon: 'Coins', shape: 'gem' }),
  m('regular-table', 'badge', 'Regular at the Table', 'rare', 'dinners', 25, 'Twenty-five dinners.', { icon: 'Utensils', shape: 'hex' }),
  m('never-misses', 'badge', 'Never Misses', 'rare', 'streak', 30, 'Thirty days in a row.', { icon: 'Flame', shape: 'gem' }),
  m('pillar', 'badge', 'Pillar of the Family', 'epic', 'repSent', 5000, '5,000 rep given to the family.', { icon: 'Landmark', shape: 'shield' }),
  m('year-blood', 'badge', 'A Year in Blood', 'epic', 'days', 365, 'A full year in the family.', { icon: 'Heart', shape: 'shield' }),
  m('head-table', 'badge', 'Head of the Table', 'legendary', 'dinners', 100, 'A hundred family dinners.', { icon: 'Crown', shape: 'hex' }),
  // Badges · fun & lore
  m('heckler', 'badge', 'Heckler', 'common', 'reactions', 50, 'Fifty reactions in the Archives.', { icon: 'MessageCircle', shape: 'gem' }),
  m('storyteller', 'badge', 'Storyteller', 'uncommon', 'stories', 1, 'A story of yours made it into the Archives.', { icon: 'Feather', shape: 'shield' }),
  m('eyes', 'badge', 'Eyes on the Street', 'uncommon', 'sightings', 10, 'Reported ten rival sightings.', { icon: 'Eye', shape: 'hex' }),
  m('bounty-hunter', 'badge', 'Bounty Hunter', 'epic', 'bounties', 1, 'Collected on a bounty.', { icon: 'Target', shape: 'hex' }),
  m('untouchable', 'badge', 'Untouchable', 'legendary', 'mvps', 15, 'Fifteen MVPs. Nobody touches you.', { icon: 'Ghost', shape: 'shield', secret: true }),
  // Titles
  m('t-made', 'title', 'Made Man', 'rare', 'days', 90, 'Ninety days in the family.'),
  m('t-wheelman', 'title', 'The Wheelman', 'epic', 'runs', 250, 'Two hundred and fifty runs.'),
  m('t-kingpin', 'title', 'Kingpin', 'legendary', 'sold', 5000, 'Five thousand units sold.'),
  m('t-oldblood', 'title', 'Old Blood', 'legendary', 'days', 730, 'Two years in the family.'),
  h('t-favorite', 'title', "Consigliere's Favorite", 'epic', 'Given by High Table.'),
  h('t-righthand', 'title', "The Don's Right Hand", 'legendary', 'Given by High Table.'),
  h('t-oath', 'title', 'Blood Oath', 'mythic', 'Given by High Table, rarely.'),
  // Frames
  m('f-iron', 'frame', 'Iron Ring', 'common', 'days', 1, 'Joined the family.', { theme: 'iron' }),
  m('f-barbed', 'frame', 'Barbed Wire', 'uncommon', 'fights', 5, 'Five blacksites.', { theme: 'barbed' }),
  m('f-roses', 'frame', 'Roses & Thorns', 'rare', 'dinners', 10, 'Ten family dinners.', { theme: 'roses' }),
  m('f-money', 'frame', 'Money Talks', 'epic', 'sold', 2500, '2,500 units sold.', { theme: 'money' }),
  m('f-bones', 'frame', 'Bone Crown', 'epic', 'kills', 250, 'Two hundred and fifty kills.', { theme: 'skulls' }),
  m('f-crown', 'frame', 'The Crown', 'legendary', 'mvps', 10, 'Ten MVPs.', { theme: 'crown' }),
  h('f-covenant', 'frame', 'Blood Covenant', 'mythic', 'Given by High Table.', { theme: 'flames' }),
  // Hues
  m('h-gilded', 'hue', 'Gilded', 'common', 'days', 7, 'A week in the family.', { color: '#fbbf24' }),
  m('h-ember', 'hue', 'Ember', 'uncommon', 'streak', 7, 'Seven days in a row.', { color: '#f97316' }),
  m('h-rose', 'hue', 'Rose', 'uncommon', 'stories', 3, 'Three stories in the Archives.', { color: '#f472b6' }),
  m('h-absinthe', 'hue', 'Absinthe', 'rare', 'cooks', 100, 'A hundred cooks.', { color: '#a3e635' }),
  m('h-midnight', 'hue', 'Midnight Blue', 'rare', 'fights', 25, 'Twenty-five blacksites.', { color: '#3b82f6' }),
  m('h-ice', 'hue', 'Ice', 'epic', 'washed', 250000, '$250,000 washed.', { color: '#67e8f9' }),
  m('h-royal', 'hue', 'Royal Purple', 'epic', 'dinners', 50, 'Fifty dinners.', { color: '#a855f7' }),
  m('h-blood', 'hue', 'Blood Red', 'legendary', 'kills', 500, 'Five hundred kills.', { color: '#dc2626' }),
  // Name effects
  m('e-shimmer', 'effect', 'Shimmer', 'rare', 'repSent', 2000, '2,000 rep given.', { effect: 'shimmer' }),
  m('e-smolder', 'effect', 'Smoldering', 'epic', 'streak', 60, 'Sixty days in a row.', { effect: 'flames' }),
  m('e-glitch', 'effect', 'Glitch', 'epic', 'sightings', 25, 'Twenty-five sightings.', { effect: 'glitch' }),
  m('e-starlight', 'effect', 'Starlight', 'legendary', 'dinners', 75, 'Seventy-five dinners.', { effect: 'starlight' }),
  h('e-bleeding', 'effect', 'Bleeding', 'mythic', 'Given by High Table.', { effect: 'blood' }),
  // Casino milestones
  m('c-regular', 'badge', 'Regular at the Tables', 'uncommon', 'hands', 200, 'Two hundred games at the casino.', { icon: 'Dices', shape: 'hex' }),
  m('c-natural', 'badge', 'Natural', 'rare', 'blackjacks', 10, 'Ten blackjacks dealt to you.', { icon: 'Spade', shape: 'gem' }),
  m('c-bigwin', 'badge', 'Big Win', 'epic', 'biggestWin', 5000, 'Won 5,000 chips in one go.', { icon: 'Coins', shape: 'gem' }),
  m('c-jackpot', 'badge', 'Jackpot', 'legendary', 'jackpots', 1, 'Hit the crown jackpot on the slots.', { icon: 'Crown', shape: 'hex' }),
  m('c-million', 'title', 'Made a Million', 'legendary', 'chipsWon', 1000000, 'A million chips won at the casino.'),
  // The chip shop
  h('s-felt', 'hue', 'Felt Green', 'uncommon', 'From the chip shop.', { color: '#15803d', price: 1500 }),
  h('s-neon', 'hue', 'Neon', 'rare', 'From the chip shop.', { color: '#22d3ee', price: 3000 }),
  h('s-jackpot', 'effect', 'Jackpot Gold', 'epic', 'From the chip shop.', { effect: 'shimmer', price: 7500 }),
  h('s-dealer', 'frame', 'The Dealer', 'rare', 'From the chip shop.', { theme: 'cards', price: 2500 }),
  h('s-stack', 'frame', 'Chip Stack', 'epic', 'From the chip shop.', { theme: 'chips', price: 6000 }),
  h('s-shark', 'title', 'Card Shark', 'rare', 'From the chip shop.', { price: 3000 }),
  h('s-roller', 'title', 'High Roller', 'epic', 'From the chip shop.', { price: 10000 }),
  h('s-house', 'title', 'The House', 'legendary', 'From the chip shop.', { price: 50000 }),
];
/** Bump when new defaults are added, so High Table's next sign-in adds the missing ones. */
export const HONORS_VERSION = 2;

// ---------- writes ----------

type Me = { id: string; name: string };
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

/** Writes the starting catalog, or adds defaults it's missing (High Table). Never overwrites edits. */
export async function setUpHonors(have: Set<string> = new Set()) {
  const b = writeBatch(db);
  DEFAULT_HONORS.filter((x) => !have.has(x.id)).forEach((x) => b.set(doc(db, 'honors', x.id), { ...clean(x), at: serverTimestamp() }));
  b.set(doc(db, 'settings', 'honors'), { setUp: true, version: HONORS_VERSION });
  await b.commit();
}
/** Chips paid out for unlocking an honor. */
export const CHIPS_FOR: Record<Rarity, number> = { common: 50, uncommon: 100, rare: 250, epic: 500, legendary: 1500, mythic: 5000 };
export const saveHonor = (x: Omit<Honor, 'at'>) => setDoc(doc(db, 'honors', x.id), { ...clean(x), at: serverTimestamp() });
export const approveHonor = (id: string) => updateDoc(doc(db, 'honors', id), { status: 'active' });
export const removeHonor = (id: string) => deleteDoc(doc(db, 'honors', id));

/** Unlocking a milestone (done quietly by the watcher). */
export const claim = (me: Me, honorId: string) =>
  setDoc(doc(db, 'honorsOwned', ownedId(me.id, honorId)), { memberId: me.id, honorId, by: 'milestone', byName: '', note: '', seen: false, at: serverTimestamp() });
/** High Table hands one out. */
export const give = (me: Me, memberId: string, honorId: string, note: string) =>
  setDoc(doc(db, 'honorsOwned', ownedId(memberId, honorId)), { memberId, honorId, by: me.id, byName: me.name, note: note.slice(0, 140), seen: false, at: serverTimestamp() });
export const revoke = (memberId: string, honorId: string) => deleteDoc(doc(db, 'honorsOwned', ownedId(memberId, honorId)));
export const markSeen = (memberId: string, honorId: string) => updateDoc(doc(db, 'honorsOwned', ownedId(memberId, honorId)), { seen: true });

export const saveLoadout = (memberId: string, l: Omit<Loadout, 'id'>) => setDoc(doc(db, 'honorLoadouts', memberId), { title: null, frame: null, effect: null, nameHue: null, accentHue: null, trimHue: null, backdropHue: null, showcase: [], ...l }, { merge: true });

/** Can this honor be earned right now (active, and inside its season if it has one)? */
export function earnable(x: Honor, now = Date.now()) {
  if (x.status !== 'active') return false;
  if (x.startsAt && x.startsAt.toMillis() > now) return false;
  if (x.endsAt && x.endsAt.toMillis() < now) return false;
  return true;
}
