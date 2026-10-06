/**
 * NoelOps' recipes, strains and numbers, carried over as-is.
 * The Narcotics page (Overview · Weed · Meth · Coke) is built on these.
 */
import type { Timestamp } from 'firebase/firestore';

// 10 strains. `tint` (r,g,b) is the card colour, matched to each logo in /noel/logos/<id>.png
export const STRAINS = [
  { id: 'acapulco', name: 'Acapulco Gold', tint: '245,158,11', nameColor: 'text-amber-400' },
  { id: 'columbian', name: 'Columbian Gold', tint: '212,160,23', nameColor: 'text-yellow-400' },
  { id: 'dosidos', name: 'Dosidos', tint: '168,85,247', nameColor: 'text-purple-400' },
  { id: 'skunk1', name: 'Skunk1', tint: '34,197,94', nameColor: 'text-green-400' },
  { id: 'ogkush', name: 'OGKush', tint: '120,150,110', nameColor: 'text-teal-300' },
  { id: 'afghani', name: 'Pure Afghani', tint: '100,116,139', nameColor: 'text-slate-300' },
  { id: 'rainbow', name: 'Rainbow Belts', tint: '217,70,239', nameColor: 'text-fuchsia-400' },
  { id: 'nl', name: 'Northern Lights', tint: '20,184,166', nameColor: 'text-teal-300' },
  { id: 'lemonskunk', name: 'Lemonskunk', tint: '250,204,21', nameColor: 'text-yellow-300' },
  { id: 'gelato41', name: 'Gelato41', tint: '244,114,182', nameColor: 'text-pink-400' },
] as const;
export type StrainId = (typeof STRAINS)[number]['id'];
export const STRAIN_BY_ID = Object.fromEntries(STRAINS.map((s) => [s.id, s])) as Record<StrainId, (typeof STRAINS)[number]>;

export const BUD_FIELDS = ['untrimmed', 'trimmed', 'bricks'] as const;
export type BudField = (typeof BUD_FIELDS)[number];
export type BudCell = Record<BudField, number>;

/** Other products kept per location next to the strains. */
export const ROOT_FIELDS = { coca: 'Coca leaves', cokeSmall: 'Small coke bricks', cokeLarge: 'Large coke bricks', meth: 'Meth bins' } as const;
export type RootField = keyof typeof ROOT_FIELDS;

export const PRODUCTS = [
  { id: 'cokeSmall', name: 'Small Coke Brick', tint: '125,211,252', nameColor: 'text-sky-300', unit: 'brick' },
  { id: 'cokeLarge', name: 'Large Coke Brick', tint: '56,189,248', nameColor: 'text-sky-300', unit: 'brick' },
  { id: 'meth', name: 'Meth Bin', tint: '34,211,238', nameColor: 'text-cyan-300', unit: 'bin' },
] as const;

/** 750 trimmed bud = 1 brick, and strains can't be mixed. */
export const BRICK_SIZE = 750;
export const PLANTS_PER_POT = 4;
export const AVG_BUD_PER_PLANT = 49.5;
export const DEFAULT_BUD_PER_POT = PLANTS_PER_POT * AVG_BUD_PER_PLANT; // 198
export const DEFAULT_POT_RANGE = [PLANTS_PER_POT * 38, PLANTS_PER_POT * 61] as const;
export const YIELD_SAMPLES_KEEP = 10;

export const COKE_INGREDIENTS = [
  { key: 'coca', label: 'Coca leaves', short: 'leaves', icon: 'leaf' },
  { key: 'oil', label: 'Oil barrels', short: 'oil', icon: 'oil-can' },
  { key: 'cement', label: 'Cement bags', short: 'cement', icon: 'sack-xmark' },
  { key: 'acid', label: 'Battery acid', short: 'acid', icon: 'car-battery' },
] as const;
export type CokeIngredient = (typeof COKE_INGREDIENTS)[number]['key'];
export type CokeRecipe = Record<'small' | 'large', Record<CokeIngredient, number>>;
export const DEFAULT_COKE_RECIPE: CokeRecipe = {
  small: { coca: 2000, oil: 10, cement: 40, acid: 25 },
  large: { coca: 4000, oil: 20, cement: 80, acid: 50 },
};
export const COKE_PURE = { small: 25, large: 50 };
export const COKE_KG = { small: 220, large: 440 };
export const COKE_HOURS = { small: 2, large: 4 };
export const LUCAS_PAYS = { acid: 2000, oil: 1000, cement: 750 };

export const SUPPLIES = {
  meth: [
    { key: 'sodium', label: 'Sodium', icon: 'droplet' },
    { key: 'ammonia', label: 'Ammonia', icon: 'flask' },
    { key: 'soda', label: 'Baking soda', icon: 'cube' },
    { key: 'water', label: 'Water', icon: 'bottle-water' },
    { key: 'bags', label: 'Plastic bags', icon: 'bag-shopping' },
    { key: 'hammers', label: 'Hammers', icon: 'hammer' },
  ],
  coke: [
    { key: 'oil', label: 'Oil barrels', icon: 'oil-can' },
    { key: 'cement', label: 'Cement bags', icon: 'sack-xmark' },
    { key: 'acid', label: 'Battery acid', icon: 'car-battery' },
  ],
} as const;
export type SupplyKey = (typeof SUPPLIES)['meth' | 'coke'][number]['key'];
export const SUPPLY_LABEL = Object.fromEntries(
  [...SUPPLIES.meth, ...SUPPLIES.coke].map((s) => [s.key, s.label]),
) as Record<SupplyKey, string>;

export const METH_SIZES: Record<number, string> = { 5: 'High', 3: 'Medium', 1: 'Low' };
export const METH_COOK_MAX_H = 24;

// ---------- Firestore shapes ----------

export const MAIN_STASH = 'main';

export interface OpsLocation {
  id: string;
  kind: 'stash' | 'grow';
  /** Stash house name, or the grow's alias. */
  name: string;
  /** In-city postal. Grows are known by it. */
  postal?: string;
  /** Crew that runs it. null = gang-wide. */
  crewId: string | null;
  excludeTotals?: boolean;
  order?: number;
  note?: string;
  // Grows only
  durationHours?: number;
  pots?: number;
  startTime?: Timestamp | null;
  strainPots?: Partial<Record<StrainId, number>>;
  /** Keeps stock on site (most grow ops don't). */
  storage?: boolean;
  /** Where harvests go. */
  stashTo?: string;
  /** "Ready to harvest" was announced for this cycle. */
  alertSent?: boolean;
}

/** Stock at one location. Missing fields read as 0. */
export interface StockDoc {
  id: string;
  coca?: number;
  cokeSmall?: number;
  cokeLarge?: number;
  meth?: number;
  /** Guns, attachments and other items: item type id → count. */
  items?: Record<string, number>;
  [strain: string]: unknown;
}

export interface Cook {
  id: string;
  by: string;
  size: number;
  mins: number;
  at?: Timestamp;
  done?: boolean;
  told?: boolean;
}

export interface Run {
  id: string;
  by: string;
  crew: string;
  size: 'small' | 'large';
  n: number;
  mins: number;
  at?: Timestamp;
  done?: boolean;
  told?: boolean;
}

export interface Activity {
  id: string;
  who: string;
  kind: string;
  pre: string;
  hi: string;
  post: string;
  at?: Timestamp;
}

export interface DayHistory {
  id: string;
  bricksMade?: number;
  cokeMade?: number;
  methMade?: number;
}

export interface NarcoticsSettings {
  cokeRecipe?: CokeRecipe;
  supplyLow?: Partial<Record<SupplyKey, number | null>>;
}

export interface YieldSample {
  buds: number;
  pots: number;
  at: number;
}

// ---------- helpers ----------

export const toCount = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

export function budCell(stock: StockDoc | undefined, strain: string): BudCell {
  const c = (stock?.[strain] ?? {}) as Partial<BudCell>;
  return { untrimmed: toCount(c.untrimmed), trimmed: toCount(c.trimmed), bricks: toCount(c.bricks) };
}
export const rootOf = (stock: StockDoc | undefined, f: RootField) => toCount(stock?.[f]);

export function formatTime(totalSecs: number) {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 36 → "36h", 1.5 → "1h 30m", 0.75 → "45m" */
export function formatDuration(hours: number) {
  const total = Math.max(1, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
export const minsLabel = (m: number) => formatDuration(m / 60);
export const fmtBricks = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
export const n = (v: number) => v.toLocaleString('en-US');

export const cokeLeavesFor = (r: CokeRecipe, size: 'small' | 'large') => Math.max(1, toCount(r[size].coca));
export const cokeCanMake = (coca: number, r: CokeRecipe, size: 'small' | 'large') => Math.floor(coca / cokeLeavesFor(r, size));
export const cokeBringText = (r: CokeRecipe, size: 'small' | 'large') =>
  COKE_INGREDIENTS.filter((i) => i.key !== 'coca' && r[size][i.key] > 0)
    .map((i) => `${n(r[size][i.key])} ${i.short}`)
    .join(' · ');
export const cokeRecipeText = (r: CokeRecipe, size: 'small' | 'large') =>
  COKE_INGREDIENTS.filter((i) => r[size][i.key] > 0)
    .map((i) => `${n(r[size][i.key])} ${i.short}`)
    .join(' · ');

/** 1 bag = 1 sodium + 1 ammonia → 1 tray → 3 water + 3 baking soda → 3 refined + 1 plastic bag */
export function methMaterials(bags: number) {
  bags = Math.max(0, Math.floor(bags) || 0);
  const high = Math.floor(bags / 5);
  const rest = bags % 5;
  return {
    bags,
    bins: bags / 10,
    sodium: bags,
    ammonia: bags,
    hammers: Math.min(bags, 5),
    soda: bags * 3,
    water: bags * 3,
    plastic: bags,
    yields: { high, medium: Math.floor(rest / 3), low: rest % 3 },
  };
}

export const logoSrc = (id: string) => `/noel/logos/${id}.png`;

/** US Eastern calendar day, e.g. "2026-10-06". */
export function etDayKey(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
export const dayKey = (back = 0) => etDayKey(Date.now() - back * 86400_000);

export function etTime(ms: number, opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }) {
  return `${new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', ...opts })} ET`;
}
