/**
 * Trophies for the keepsake cabinet. Achievements award them automatically in tiers;
 * leadership can award any design by hand.
 */
export type TrophyDesign =
  | 'leaf'
  | 'brick'
  | 'beaker'
  | 'snowflake'
  | 'moneybag'
  | 'coins'
  | 'mask'
  | 'crest'
  | 'shield'
  | 'crown'
  | 'skull'
  | 'star'
  | 'laurel'
  | 'cup'
  | 'crosshair';

export const TIERS = [
  { tier: 1, name: 'Bronze', roman: 'I' },
  { tier: 2, name: 'Silver', roman: 'II' },
  { tier: 3, name: 'Gold', roman: 'III' },
  { tier: 4, name: 'Onyx', roman: 'IV' },
] as const;
export type Tier = 1 | 2 | 3 | 4;

/** Numbers a member's achievements are measured on. */
export interface AchievementStats {
  harvests: number;
  pressed: number;
  cooks: number;
  runs: number;
  sold: number;
  washed: number;
  petty: number;
  repSent: number;
  days: number;
}

export interface Achievement {
  id: string;
  name: string;
  design: TrophyDesign;
  /** What it counts, for the description. */
  unit: string;
  stat: keyof AchievementStats;
  /** Bronze, silver, gold, onyx. */
  at: [number, number, number, number];
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'harvester', name: 'Harvester', design: 'leaf', unit: 'harvests', stat: 'harvests', at: [5, 25, 100, 250] },
  { id: 'press', name: 'Brick Press', design: 'brick', unit: 'bricks pressed', stat: 'pressed', at: [10, 50, 200, 500] },
  { id: 'cook', name: 'The Cook', design: 'beaker', unit: 'meth cooks put down', stat: 'cooks', at: [5, 25, 100, 250] },
  { id: 'snowman', name: 'Snowman', design: 'snowflake', unit: 'coke runs', stat: 'runs', at: [3, 15, 50, 150] },
  { id: 'plug', name: 'The Plug', design: 'moneybag', unit: 'bricks and bins sold', stat: 'sold', at: [10, 50, 250, 1000] },
  { id: 'launderer', name: 'Launderer', design: 'coins', unit: 'dollars washed', stat: 'washed', at: [100_000, 1_000_000, 5_000_000, 20_000_000] },
  { id: 'streetrat', name: 'Street Rat', design: 'mask', unit: 'petty crimes logged', stat: 'petty', at: [10, 50, 200, 500] },
  { id: 'loyal', name: 'Loyal Blood', design: 'crest', unit: 'petty rep given to the family', stat: 'repSent', at: [100, 1000, 5000, 20000] },
  { id: 'veteran', name: 'Veteran', design: 'shield', unit: 'days in the family', stat: 'days', at: [30, 90, 180, 365] },
];
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Designs leadership can hand out (plus every achievement design). */
export const AWARD_DESIGNS: { design: TrophyDesign; name: string }[] = [
  { design: 'crown', name: 'Crown' },
  { design: 'cup', name: 'Champion’s Cup' },
  { design: 'star', name: 'Star Medal' },
  { design: 'laurel', name: 'Laurel Wreath' },
  { design: 'skull', name: 'Golden Skull' },
  { design: 'crosshair', name: 'Marksman' },
  { design: 'shield', name: 'Shield' },
  { design: 'crest', name: 'Family Crest' },
  { design: 'moneybag', name: 'Money Bag' },
  { design: 'leaf', name: 'Golden Leaf' },
  { design: 'beaker', name: 'Beaker' },
  { design: 'snowflake', name: 'Snowflake' },
  { design: 'brick', name: 'Brick' },
  { design: 'coins', name: 'Coin Stack' },
  { design: 'mask', name: 'Mask' },
];

/** The tier a number reaches (0 = none yet). */
export function tierFor(a: Achievement, value: number): 0 | Tier {
  let t: 0 | Tier = 0;
  a.at.forEach((n, i) => {
    if (value >= n) t = (i + 1) as Tier;
  });
  return t;
}

export interface TrophyDoc {
  id: string;
  memberId: string;
  kind: 'achievement' | 'award';
  achId?: string;
  tier: Tier;
  design: TrophyDesign;
  title: string;
  note?: string;
  by: string;
  byName?: string;
  at?: import('firebase/firestore').Timestamp;
}

export interface Pedestal {
  /** What stands on it. */
  kind: 'trophy' | 'item' | 'keepsake';
  trophyId?: string;
  itemTypeId?: string;
  name?: string;
  /** Small square picture (data URL) for keepsakes. */
  image?: string | null;
  label?: string;
}

export interface Cabinet {
  id: string;
  /** How many pedestals the cabinet shows (1–24). */
  pedestals: number;
  slots: Record<string, Pedestal>;
}
