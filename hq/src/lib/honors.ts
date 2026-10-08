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

export const FRAME_THEMES = ['iron', 'barbed', 'roses', 'skulls', 'money', 'crown', 'flames', 'chips', 'cards', 'stars', 'lightning', 'hearts', 'gothic', 'horns', 'neon', 'laurel', 'wax', 'band'] as const;
export type FrameTheme = (typeof FRAME_THEMES)[number];
export const EFFECTS = ['shimmer', 'flames', 'glitch', 'starlight', 'blood', 'neon', 'frost', 'prism'] as const;
export type NameEffect = (typeof EFFECTS)[number];
/** Badge icons, by lucide name (see HonorArt). */
export const BADGE_ICONS = ['Skull', 'Crown', 'Swords', 'Crosshair', 'Flag', 'Star', 'Package', 'Car', 'Sprout', 'FlaskConical', 'Box', 'Gem', 'WashingMachine', 'HandCoins', 'Utensils', 'CalendarDays', 'Flame', 'Landmark', 'Coins', 'Feather', 'Eye', 'Target', 'MessageCircle', 'Shield', 'Heart', 'Moon', 'Rose', 'Zap', 'Trophy', 'Ghost', 'Spade', 'Club', 'Diamond', 'Dices', 'Cherry', 'Vote', 'Cake', 'PartyPopper'] as const;
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
  { id: 'votes', label: 'Polls voted on', group: 'Family life' },
  { id: 'birthdays', label: 'Birthdays with the family', group: 'Family life' },
  { id: 'stories', label: 'Stories in the Archives', group: 'Fun & lore' },
  { id: 'sightings', label: 'Rival sightings reported', group: 'Fun & lore' },
  { id: 'bounties', label: 'Bounties collected', group: 'Fun & lore' },
  { id: 'reactions', label: 'Reactions in the Archives', group: 'Fun & lore' },
  { id: 'hands', label: 'Casino games played', group: 'Casino' },
  { id: 'chipsWon', label: 'Chips won (lifetime)', group: 'Casino' },
  { id: 'biggestWin', label: 'Biggest single win', group: 'Casino' },
  { id: 'blackjacks', label: 'Blackjacks dealt', group: 'Casino' },
  { id: 'jackpots', label: 'Slot jackpots', group: 'Casino' },
  { id: 'narcoRuns', label: 'Narco runs', group: 'Narco runs' },
  { id: 'runsClean', label: 'Clean runs', group: 'Narco runs' },
  { id: 'runsBusted', label: 'Runs busted', group: 'Narco runs' },
  { id: 'runsRobbed', label: 'Runs robbed', group: 'Narco runs' },
  { id: 'bestHaul', label: 'Biggest run haul ($)', group: 'Narco runs' },
  { id: 'heists', label: 'Heists pulled', group: 'Heists' },
  { id: 'heistWins', label: 'Heists got away with', group: 'Heists' },
  { id: 'heistFails', label: 'Heists gone wrong', group: 'Heists' },
  { id: 'bestTake', label: 'Biggest heist take ($)', group: 'Heists' },
  { id: 'heistStreak', label: 'Clean heists in a row', group: 'Heists' },
  { id: 'asDriver', label: 'Heists as Driver', group: 'Heists' },
  { id: 'asHacker', label: 'Heists as Hacker', group: 'Heists' },
  { id: 'asGunman', label: 'Heists as Gunman', group: 'Heists' },
  { id: 'champion', label: 'Months finished #1', group: 'Feats' },
  { id: 'setsDone', label: 'Sets completed', group: 'Feats' },
  // A whole set collected (1 once it's complete).
  { id: 'setWork', label: 'Work & sales set', group: 'Sets' },
  { id: 'setFights', label: 'Fights set', group: 'Sets' },
  { id: 'setFamily', label: 'Family life set', group: 'Sets' },
  { id: 'setLore', label: 'Fun & lore set', group: 'Sets' },
  { id: 'setCasino', label: 'Casino set', group: 'Sets' },
  { id: 'setHeists', label: 'Heists set', group: 'Sets' },
  { id: 'setRuns', label: 'Narco runs set', group: 'Sets' },
] as const;
export type StatId = (typeof STATS)[number]['id'];
/** Narcotics stats (coke runs, harvests, cooks, bricks, product sold): honors on them are Narco only. */
export const NARCO_STATS = new Set<string>(['runs', 'harvests', 'cooks', 'pressed', 'sold', 'narcoRuns', 'runsClean', 'runsBusted', 'runsRobbed', 'bestHaul', 'setRuns']);
export const statsFor = (narco: boolean) => STATS.filter((s) => narco || !NARCO_STATS.has(s.id));
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
  /** The medal it's struck as (round, star, crest, cross, coin, seal, card, pin). Mixed by id when unset. */
  form?: string | null;
  /** Its ribbon's two colors (defaults by rarity). */
  ribbon?: [string, string] | null;
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
  /** The banner behind their portrait, built in the wardrobe. */
  banner?: BannerSpec | null;
}
export interface BannerSpec {
  shape: 'pennant' | 'standard' | 'scroll' | 'swallow';
  pattern: 'plain' | 'stripes' | 'chevron' | 'diamonds' | 'quartered' | 'saltire';
  /** An icon from a badge they own. */
  sigil: string;
  c1: string;
  c2: string;
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

// ---------- The second wave: 100+ more to earn, be given, or buy ----------
type Ladder = [StatId, number, string, Rarity, string, string?][];
/** Milestone badges: [stat, goal, name, rarity, icon, secret?]. */
const BADGE_LADDER: Ladder = [
  ['runs', 100, 'Courier', 'uncommon', 'Package'], ['runs', 500, 'Road Warrior', 'epic', 'Car'], ['runs', 1000, 'Never Stops Driving', 'legendary', 'Car'],
  ['harvests', 10, 'First Crop', 'common', 'Sprout'], ['harvests', 200, 'Harvest Moon', 'rare', 'Moon'], ['harvests', 500, 'The Farmer', 'epic', 'Sprout'],
  ['cooks', 10, 'Apprentice Cook', 'common', 'FlaskConical'], ['cooks', 250, 'Blue Sky', 'epic', 'FlaskConical'], ['cooks', 1000, 'The Chemist', 'legendary', 'FlaskConical'],
  ['pressed', 25, 'Pressed', 'common', 'Box'], ['pressed', 500, 'Brick House', 'epic', 'Box'], ['pressed', 2000, 'Wall of Bricks', 'legendary', 'Landmark'],
  ['sold', 100, 'Street Seller', 'common', 'Coins'], ['sold', 500, 'Supplier', 'uncommon', 'Gem'], ['sold', 10000, 'Cartel Connect', 'legendary', 'Gem'],
  ['washed', 10000, 'First Rinse', 'common', 'WashingMachine'], ['washed', 100000, 'Spin Cycle', 'rare', 'WashingMachine'], ['washed', 5000000, 'Squeaky Clean', 'legendary', 'Gem'],
  ['petty', 10, 'Pickpocket', 'common', 'HandCoins'], ['petty', 500, 'Career Criminal', 'rare', 'HandCoins'], ['petty', 1000, 'Menace', 'epic', 'Skull'],
  ['fights', 50, 'Veteran', 'epic', 'Shield'], ['fights', 250, 'Forever War', 'legendary', 'Swords'],
  ['wins', 1, 'First Victory', 'common', 'Flag'], ['wins', 25, 'Ground Taker', 'rare', 'Flag'], ['wins', 100, 'Conqueror', 'legendary', 'Crown'],
  ['mvps', 5, 'Star Player', 'epic', 'Star'],
  ['kills', 10, 'Trigger Finger', 'common', 'Crosshair'], ['kills', 50, 'Marksman', 'uncommon', 'Crosshair'], ['kills', 1000, 'The Reaper', 'legendary', 'Skull', 'secret'],
  ['dinners', 5, 'Familiar Face', 'common', 'Utensils'], ['dinners', 10, 'Family Man', 'uncommon', 'Heart'],
  ['duesPaid', 5, 'Square With the House', 'common', 'Coins'], ['duesPaid', 50, 'Tithe Keeper', 'rare', 'Landmark'], ['duesPaid', 100, 'Pillar of Dues', 'epic', 'Landmark'],
  ['days', 180, 'Half a Year', 'uncommon', 'CalendarDays'], ['days', 1000, 'Old Guard', 'legendary', 'Shield'],
  ['streak', 3, 'Showing Up', 'common', 'Flame'], ['streak', 14, 'Two Weeks Strong', 'uncommon', 'Flame'], ['streak', 100, 'Unbroken', 'epic', 'Flame'], ['streak', 365, 'Every Single Day', 'legendary', 'Flame', 'secret'],
  ['repSent', 100, 'Paying Respect', 'common', 'Heart'], ['repSent', 1000, 'Rep Builder', 'uncommon', 'Landmark'], ['repSent', 20000, 'Foundation Stone', 'legendary', 'Landmark'],
  ['stories', 5, 'Chronicler', 'rare', 'Feather'], ['stories', 15, 'The Bard', 'epic', 'Feather'],
  ['sightings', 1, 'Spotter', 'common', 'Eye'], ['sightings', 50, 'All-Seeing', 'epic', 'Eye'],
  ['bounties', 3, 'Headhunter', 'legendary', 'Target'],
  ['reactions', 10, 'Applause', 'common', 'MessageCircle'], ['reactions', 250, 'Loudmouth', 'rare', 'MessageCircle'],
  ['hands', 25, 'Card Curious', 'common', 'Spade'], ['hands', 1000, 'House Regular', 'rare', 'Club'], ['hands', 5000, 'Lives at the Casino', 'epic', 'Dices'],
  ['chipsWon', 10000, 'Lucky', 'uncommon', 'Cherry'], ['chipsWon', 100000, 'Hot Streak', 'rare', 'Coins'], ['chipsWon', 500000, 'Whale', 'epic', 'Gem'],
  ['biggestWin', 1000, 'Nice Hand', 'common', 'Diamond'], ['biggestWin', 20000, 'Breaking the Bank', 'legendary', 'Crown'],
  ['blackjacks', 1, 'Twenty-One', 'common', 'Spade'], ['blackjacks', 50, 'Card Counter', 'epic', 'Spade'],
  ['jackpots', 3, 'Triple Crown', 'legendary', 'Crown', 'secret'],
];
const SHAPES: Honor['shape'][] = ['gem', 'shield', 'hex'];
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STAT_WORD: Record<string, string> = Object.fromEntries(STATS.map((x) => [x.id, x.label.toLowerCase()]));
const said = (stat: StatId, goal: number) => `${goal.toLocaleString('en-US')} ${STAT_WORD[stat]}.`;

const WAVE2: Omit<Honor, 'at'>[] = [
  ...BADGE_LADDER.map(([stat, goal, name, rarity, icon, secret], i) => m(`b2-${slug(name)}`, 'badge', name, rarity, stat, goal, said(stat, goal), { icon, shape: SHAPES[i % 3], secret: !!secret })),
  // Titles you earn
  m('t2-courier', 'title', 'The Courier', 'uncommon', 'runs', 100, said('runs', 100)),
  m('t2-cook-year', 'title', 'Cook of the Year', 'epic', 'cooks', 500, said('cooks', 500)),
  m('t2-collector', 'title', 'The Collector', 'legendary', 'washed', 2000000, said('washed', 2000000)),
  m('t2-docks', 'title', 'Veteran of the Docks', 'rare', 'fights', 50, said('fights', 50)),
  m('t2-grim', 'title', 'Grim', 'epic', 'kills', 500, said('kills', 500)),
  m('t2-seat', 'title', 'Seat Warmer', 'rare', 'dinners', 20, said('dinners', 20)),
  m('t2-tales', 'title', 'Teller of Tales', 'rare', 'stories', 3, said('stories', 3)),
  m('t2-lookout', 'title', 'The Lookout', 'rare', 'sightings', 25, said('sightings', 25)),
  m('t2-lady-luck', 'title', "Lady Luck's Favorite", 'epic', 'jackpots', 2, said('jackpots', 2)),
  m('t2-twentyone', 'title', 'Twenty-One', 'rare', 'blackjacks', 25, said('blackjacks', 25)),
  m('t2-iron-will', 'title', 'Iron Will', 'epic', 'streak', 50, said('streak', 50)),
  m('t2-patriarch', 'title', 'Patriarch', 'legendary', 'days', 1095, 'Three years in the family.', { secret: true }),
  // Titles High Table gives
  h('t2-enforcer-year', 'title', 'Enforcer of the Year', 'epic', 'Given by High Table.'),
  h('t2-fixer', 'title', 'The Fixer', 'rare', 'Given by High Table.'),
  h('t2-silent', 'title', 'Silent Partner', 'rare', 'Given by High Table.'),
  h('t2-ghost-grove', 'title', 'Ghost of Grove Street', 'legendary', 'Given by High Table.'),
  h('t2-golden-boy', 'title', 'Golden Child', 'epic', 'Given by High Table.'),
  h('t2-made-blood', 'title', 'Made in Blood', 'mythic', 'Given by High Table, rarely.'),
  // Badges High Table gives
  h('g2-loyalty', 'badge', 'Medal of Loyalty', 'epic', 'Given by High Table.', { icon: 'Heart', shape: 'shield' }),
  h('g2-wounded', 'badge', 'Took a Bullet', 'rare', 'Given by High Table.', { icon: 'Heart', shape: 'gem' }),
  h('g2-night-watch', 'badge', 'Night Watch', 'rare', 'Given by High Table.', { icon: 'Moon', shape: 'hex' }),
  h('g2-silver-tongue', 'badge', 'Silver Tongue', 'rare', 'Given by High Table.', { icon: 'MessageCircle', shape: 'gem' }),
  h('g2-blessing', 'badge', "The Don's Blessing", 'mythic', 'Given by High Table, rarely.', { icon: 'Crown', shape: 'shield' }),
  // Frames you earn
  m('f2-starlit', 'frame', 'Starlit', 'rare', 'dinners', 30, said('dinners', 30), { theme: 'stars' }),
  m('f2-lightning', 'frame', 'Lightning Rod', 'epic', 'wins', 50, said('wins', 50), { theme: 'lightning' }),
  m('f2-heartbound', 'frame', 'Heartbound', 'uncommon', 'repSent', 500, said('repSent', 500), { theme: 'hearts' }),
  m('f2-thornwreath', 'frame', 'Thornwreath', 'epic', 'stories', 10, said('stories', 10), { theme: 'roses' }),
  m('f2-coin-ring', 'frame', 'Coin Ring', 'uncommon', 'hands', 100, said('hands', 100), { theme: 'chips' }),
  m('f2-skull-throne', 'frame', 'Skull Throne', 'legendary', 'kills', 1000, said('kills', 1000), { theme: 'skulls' }),
  m('f2-iron-crown', 'frame', 'Iron Crown', 'epic', 'fights', 150, said('fights', 150), { theme: 'crown' }),
  m('f2-inferno', 'frame', 'Inferno', 'legendary', 'streak', 200, said('streak', 200), { theme: 'flames' }),
  // Hues you earn
  m('h2-steel', 'hue', 'Steel', 'common', 'fights', 3, said('fights', 3), { color: '#94a3b8' }),
  m('h2-moss', 'hue', 'Moss', 'common', 'harvests', 20, said('harvests', 20), { color: '#65a30d' }),
  m('h2-copper', 'hue', 'Copper', 'uncommon', 'pressed', 50, said('pressed', 50), { color: '#c2410c' }),
  m('h2-sky', 'hue', 'Sky', 'uncommon', 'sightings', 5, said('sightings', 5), { color: '#38bdf8' }),
  m('h2-sunset', 'hue', 'Sunset', 'uncommon', 'streak', 21, said('streak', 21), { color: '#fb7185' }),
  m('h2-lilac', 'hue', 'Lilac', 'rare', 'stories', 2, said('stories', 2), { color: '#c084fc' }),
  m('h2-amber', 'hue', 'Amber', 'rare', 'duesPaid', 30, said('duesPaid', 30), { color: '#f59e0b' }),
  m('h2-jade', 'hue', 'Jade', 'rare', 'chipsWon', 25000, said('chipsWon', 25000), { color: '#10b981' }),
  m('h2-crimson-tide', 'hue', 'Crimson Tide', 'epic', 'wins', 40, said('wins', 40), { color: '#be123c' }),
  m('h2-obsidian', 'hue', 'Obsidian Violet', 'legendary', 'days', 500, said('days', 500), { color: '#6d28d9' }),
  // Name effects you earn
  m('e2-neon', 'effect', 'Neon Sign', 'epic', 'hands', 2000, said('hands', 2000), { effect: 'neon' }),
  m('e2-frost', 'effect', 'Frostbite', 'rare', 'kills', 75, said('kills', 75), { effect: 'frost' }),
  m('e2-prism', 'effect', 'Prism', 'legendary', 'chipsWon', 250000, said('chipsWon', 250000), { effect: 'prism' }),
  // The chip shop, second shelf
  h('s2-cherry', 'hue', 'Cherry Red', 'common', 'From the chip shop.', { color: '#e11d48', price: 1000 }),
  h('s2-ocean', 'hue', 'Ocean', 'uncommon', 'From the chip shop.', { color: '#0284c7', price: 1500 }),
  h('s2-mint', 'hue', 'Mint', 'uncommon', 'From the chip shop.', { color: '#34d399', price: 1500 }),
  h('s2-bubblegum', 'hue', 'Bubblegum', 'uncommon', 'From the chip shop.', { color: '#f472b6', price: 2000 }),
  h('s2-ink', 'hue', 'Midnight Ink', 'rare', 'From the chip shop.', { color: '#4338ca', price: 4000 }),
  h('s2-toxic', 'hue', 'Toxic', 'rare', 'From the chip shop.', { color: '#84cc16', price: 4000 }),
  h('s2-rose-gold', 'hue', 'Rose Gold', 'epic', 'From the chip shop.', { color: '#e8a99c', price: 5000 }),
  h('s2-royal-gold', 'hue', 'Royal Gold', 'epic', 'From the chip shop.', { color: '#eab308', price: 6000 }),
  h('s2-lucky-hearts', 'frame', 'Lucky Hearts', 'rare', 'From the chip shop.', { theme: 'hearts', price: 3500 }),
  h('s2-shooting-stars', 'frame', 'Shooting Stars', 'epic', 'From the chip shop.', { theme: 'stars', price: 8000 }),
  h('s2-storm', 'frame', 'The Storm', 'epic', 'From the chip shop.', { theme: 'lightning', price: 9000 }),
  h('s2-bone-yard', 'frame', 'Bone Yard', 'epic', 'From the chip shop.', { theme: 'skulls', price: 12000 }),
  h('s2-golden-crown', 'frame', 'Golden Crown', 'legendary', 'From the chip shop.', { theme: 'crown', price: 30000 }),
  h('s2-lucky-seven', 'title', 'Lucky Seven', 'uncommon', 'From the chip shop.', { price: 1500 }),
  h('s2-mr-lucky', 'title', 'Mr. Lucky', 'uncommon', 'From the chip shop.', { price: 2000 }),
  h('s2-gambler', 'title', 'The Gambler', 'rare', 'From the chip shop.', { price: 2500 }),
  h('s2-big-spender', 'title', 'Big Spender', 'rare', 'From the chip shop.', { price: 4000 }),
  h('s2-loan-shark', 'title', 'Loan Shark', 'rare', 'From the chip shop.', { price: 6000 }),
  h('s2-pit-boss', 'title', 'Pit Boss', 'epic', 'From the chip shop.', { price: 8000 }),
  h('s2-kingmaker', 'title', 'Kingmaker', 'legendary', 'From the chip shop.', { price: 40000 }),
  h('s2-neon', 'effect', 'Neon Lights', 'epic', 'From the chip shop.', { effect: 'neon', price: 12000 }),
  h('s2-ice', 'effect', 'Ice Cold', 'epic', 'From the chip shop.', { effect: 'frost', price: 9000 }),
  h('s2-smoke', 'effect', 'Smoke & Fire', 'epic', 'From the chip shop.', { effect: 'flames', price: 15000 }),
  h('s2-rainbow', 'effect', 'Rainbow Road', 'legendary', 'From the chip shop.', { effect: 'prism', price: 35000 }),
  h('s2-roller', 'badge', 'Roller', 'uncommon', 'From the chip shop.', { icon: 'Dices', shape: 'hex', price: 1000 }),
  h('s2-high-stakes', 'badge', 'High Stakes', 'rare', 'From the chip shop.', { icon: 'Diamond', shape: 'gem', price: 5000 }),
  h('s2-golden-chip', 'badge', 'Golden Chip', 'epic', 'From the chip shop.', { icon: 'Coins', shape: 'gem', price: 20000 }),
  h('s2-house-edge', 'badge', 'House Edge', 'legendary', 'From the chip shop.', { icon: 'Crown', shape: 'shield', price: 75000 }),
];
DEFAULT_HONORS.push(...WAVE2);

/** Wave 3: for voting in the family's polls. */
DEFAULT_HONORS.push(
  m('v-first', 'badge', 'Cast a Ballot', 'common', 'votes', 1, 'Your first vote in a family poll.', { icon: 'Vote', shape: 'shield' }),
  m('v-voice', 'badge', 'Voice of the Family', 'uncommon', 'votes', 10, 'Ten polls voted on.', { icon: 'Vote', shape: 'gem' }),
  m('v-box', 'badge', 'Ballot Box', 'rare', 'votes', 50, 'Fifty polls voted on.', { icon: 'Vote', shape: 'hex' }),
  m('v-senator', 'title', 'The Senator', 'epic', 'votes', 100, 'A hundred polls voted on.'),
  m('v-kingmaker', 'title', 'Kingmaker', 'legendary', 'votes', 250, 'Two hundred and fifty polls voted on.', { secret: true }),
  // Parties: birthdays and the years you've stood with the family.
  m('p-cake', 'badge', 'Another Year Older', 'common', 'birthdays', 1, 'Your first birthday with the family.', { icon: 'Cake', shape: 'shield' }),
  m('p-party', 'title', 'Party Animal', 'rare', 'birthdays', 3, 'Three birthdays with the family.'),
  m('p-2y', 'badge', 'Two Years Strong', 'rare', 'days', 730, 'Two years in the family.', { icon: 'PartyPopper', shape: 'gem' }),
  m('p-3y', 'badge', 'Three Years Deep', 'epic', 'days', 1095, 'Three years in the family.', { icon: 'PartyPopper', shape: 'hex' }),
  m('p-5y', 'badge', 'Five Years Made', 'legendary', 'days', 1825, 'Five years in the family.', { icon: 'Crown', shape: 'hex' }),
  m('v-hue', 'hue', 'Ballot Blue', 'rare', 'votes', 25, 'Twenty-five polls voted on.', { color: '#3b82f6' }),
);

/** Wave 4: heists. The ladder, then the fun ones. */
DEFAULT_HONORS.push(
  m('hz-first', 'badge', 'First Score', 'common', 'heists', 1, 'Your first heist with the crew.', { icon: 'Gem', shape: 'gem' }),
  m('hz-five', 'badge', 'Crew Regular', 'uncommon', 'heists', 5, 'Five heists pulled.', { icon: 'Gem', shape: 'shield' }),
  m('hz-25', 'badge', 'Professional', 'epic', 'heists', 25, 'Twenty-five heists pulled.', { icon: 'Gem', shape: 'hex' }),
  m('hz-100', 'title', 'The Mastermind', 'legendary', 'heists', 100, 'A hundred heists pulled.'),
  // Big takes
  m('hz-gold-fever', 'badge', 'Gold Fever', 'rare', 'bestTake', 250000, 'On a heist that brought home $250,000 or more.', { icon: 'Coins', shape: 'gem' }),
  m('hz-seven-figures', 'title', 'Seven Figures', 'legendary', 'bestTake', 1000000, 'On a heist that brought home a million dollars.'),
  // Close calls
  m('hz-lucky-escape', 'badge', 'Lucky Escape', 'common', 'heistFails', 1, 'Walked away from a heist that went wrong.', { icon: 'Ghost', shape: 'shield' }),
  m('hz-still-breathing', 'title', 'Still Breathing', 'epic', 'heistFails', 5, 'Five heists gone wrong, and still here.'),
  // Roles
  m('hz-wheelman', 'title', 'Wheelman', 'rare', 'asDriver', 10, 'Drove ten heists.'),
  m('hz-ghost-wire', 'title', 'Ghost in the Wire', 'rare', 'asHacker', 10, 'Hacked ten heists.'),
  m('hz-hired-gun', 'badge', 'Hired Gun', 'rare', 'asGunman', 10, 'Gunman on ten heists.', { icon: 'Crosshair', shape: 'hex' }),
  // Streaks
  m('hz-clean-sweep', 'badge', 'Clean Sweep', 'epic', 'heistStreak', 5, 'Five heists in a row without a hitch.', { icon: 'Zap', shape: 'gem' }),
  m('hz-untouchable', 'effect', 'Untouchable', 'legendary', 'heistStreak', 10, 'Ten clean heists in a row.', { effect: 'shimmer', secret: true }),
);

/** Bump when new defaults are added, so High Table's next sign-in adds the missing ones. */
/** Wave 5: Narco runs (Narco only, like every narcotics honor). */
DEFAULT_HONORS.push(
  m('nr-first', 'badge', 'First Drop', 'common', 'narcoRuns', 1, 'Your first Narco run.', { icon: 'Package', shape: 'gem' }),
  m('nr-10', 'badge', 'Runner', 'uncommon', 'narcoRuns', 10, 'Ten Narco runs.', { icon: 'Car', shape: 'shield' }),
  m('nr-50', 'badge', 'The Pipeline', 'epic', 'narcoRuns', 50, 'Fifty Narco runs.', { icon: 'Car', shape: 'hex' }),
  m('nr-200', 'title', 'El Transportador', 'legendary', 'narcoRuns', 200, 'Two hundred Narco runs.'),
  m('nr-clean', 'badge', 'Clean Hands', 'rare', 'runsClean', 25, 'Twenty-five clean runs.', { icon: 'Shield', shape: 'shield' }),
  m('nr-busted', 'badge', 'Hot Potato', 'common', 'runsBusted', 1, 'A run that got busted. It happens.', { icon: 'Flame', shape: 'gem' }),
  m('nr-jailbird', 'title', 'Jailbird', 'epic', 'runsBusted', 5, 'Five runs busted, and still running.'),
  m('nr-jumped', 'badge', 'Jumped', 'common', 'runsRobbed', 1, 'A run that got robbed.', { icon: 'Skull', shape: 'hex' }),
  m('nr-easy-target', 'title', 'Easy Target', 'rare', 'runsRobbed', 5, 'Robbed five times. Maybe bring backup.'),
  m('nr-big-bag', 'badge', 'Big Bag', 'rare', 'bestHaul', 100000, 'A run that brought home $100,000.', { icon: 'Coins', shape: 'gem' }),
  m('nr-cartel', 'title', 'Cartel Money', 'legendary', 'bestHaul', 500000, 'A single run worth half a million.', { secret: true }),
);

/** The collection's sets: every milestone counted by one group of stats. Finishing one earns its Full Set medal and chips. */
export const SETS: { id: StatId; group: string; label: string; icon: string }[] = [
  { id: 'setFights', group: 'Fights', label: 'Fights', icon: 'Swords' },
  { id: 'setHeists', group: 'Heists', label: 'Heists', icon: 'Gem' },
  { id: 'setWork', group: 'Work & sales', label: 'Work & sales', icon: 'HandCoins' },
  { id: 'setRuns', group: 'Narco runs', label: 'Narco runs', icon: 'Car' },
  { id: 'setFamily', group: 'Family life', label: 'Family life', icon: 'Heart' },
  { id: 'setLore', group: 'Fun & lore', label: 'Fun & lore', icon: 'Feather' },
  { id: 'setCasino', group: 'Casino', label: 'Casino', icon: 'Dices' },
];
const GROUP_OF = new Map<string, string>(STATS.map((x) => [x.id, x.group]));
export const groupOf = (stat?: string | null) => (stat ? GROUP_OF.get(stat) : undefined);
/** The honors that make up a set (its Full Set medal not included). */
export const setMembers = (honors: Honor[], group: string) => honors.filter((h) => h.source === 'milestone' && h.status === 'active' && !h.season && groupOf(h.stat) === group);
// Wave 6: a Full Set medal per set, worth 100 chips for every piece in it.
DEFAULT_HONORS.push(
  ...SETS.map((st) => {
    const size = DEFAULT_HONORS.filter((h) => h.source === 'milestone' && groupOf(h.stat) === st.group).length;
    return m(`set-${st.id}`, 'badge', `Full Set: ${st.label}`, 'legendary', st.id, 1, `Collected every ${st.label} honor.`, { icon: st.icon, form: 'star', chips: Math.max(500, size * 100) });
  }),
);

/** Wave 7: Diablo-style frames, earned by feats and seasons. */
const ET_END_2026 = Timestamp.fromDate(new Date('2027-01-01T04:59:59Z'));
DEFAULT_HONORS.push(
  m('f3-cathedral', 'frame', 'Cathedral', 'legendary', 'champion', 1, 'Finished a month at #1 on a Hall of Fame board.', { theme: 'gothic' }),
  m('f3-dynasty', 'frame', 'Dynasty', 'mythic', 'champion', 3, 'Three months at #1.', { theme: 'gothic', secret: true }),
  m('f3-victor', 'frame', "Victor's Laurel", 'epic', 'setsDone', 1, 'Completed a whole set in the collection.', { theme: 'laurel' }),
  m('f3-completionist', 'frame', 'The Completionist', 'legendary', 'setsDone', 4, 'Completed four sets.', { theme: 'crown' }),
  m('f3-horns', 'frame', "Devil's Due", 'epic', 'heists', 25, 'Twenty-five heists pulled.', { theme: 'horns' }),
  m('f3-neon', 'frame', 'Neon Nights', 'rare', 'hands', 500, 'Five hundred casino games.', { theme: 'neon' }),
  m('f3-wax', 'frame', 'Sealed in Wax', 'uncommon', 'duesPaid', 10, 'Ten dues payments.', { theme: 'wax' }),
  m('f3-band', 'frame', 'Money Band', 'rare', 'bestTake', 100000, 'On a heist that brought home $100,000.', { theme: 'band' }),
  { ...m('f3-founding', 'frame', 'Founding Season', 'epic', 'days', 1, 'Was in the family during the Founding Season.', { theme: 'stars' }), season: 'Founding Season', endsAt: ET_END_2026 },
);

export const HONORS_VERSION = 9;

// ---------- writes ----------

type Me = { id: string; name: string };
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

/** Writes the starting catalog, or adds defaults it's missing (High Table). Never overwrites edits. */
/** A clean copy to store, keeping season dates as real timestamps (JSON would flatten them). */
const store = (x: Omit<Honor, 'at'>) => ({ ...clean(x), startsAt: x.startsAt ?? null, endsAt: x.endsAt ?? null });
/** Milliseconds of a season date, whether it's a Timestamp or (from an older save) a plain {seconds}. */
export const whenMs = (t: unknown): number | null => {
  if (!t) return null;
  const v = t as { toMillis?: () => number; seconds?: number };
  return typeof v.toMillis === 'function' ? v.toMillis() : typeof v.seconds === 'number' ? v.seconds * 1000 : null;
};
export async function setUpHonors(have: Set<string> = new Set()) {
  const b = writeBatch(db);
  DEFAULT_HONORS.filter((x) => !have.has(x.id)).forEach((x) => b.set(doc(db, 'honors', x.id), { ...store(x), at: serverTimestamp() }));
  b.set(doc(db, 'settings', 'honors'), { setUp: true, version: HONORS_VERSION });
  await b.commit();
}
/** Chips paid out for unlocking an honor. */
export const CHIPS_FOR: Record<Rarity, number> = { common: 50, uncommon: 100, rare: 250, epic: 500, legendary: 1500, mythic: 5000 };
export const saveHonor = (x: Omit<Honor, 'at'>) => setDoc(doc(db, 'honors', x.id), { ...store(x), at: serverTimestamp() });
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

/** Changes only the slots given; everything else stays on. */
export const saveLoadout = (memberId: string, l: Omit<Loadout, 'id'>) => setDoc(doc(db, 'honorLoadouts', memberId), l, { merge: true });

/** Can this honor be earned right now (active, and inside its season if it has one)? */
export function earnable(x: Honor, now = Date.now()) {
  if (x.status !== 'active') return false;
  const from = whenMs(x.startsAt);
  const to = whenMs(x.endsAt);
  if (from != null && from > now) return false;
  if (to != null && to < now) return false;
  return true;
}
