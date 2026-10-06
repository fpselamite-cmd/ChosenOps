import { collection, documentId, limit, orderBy, query, where } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import {
  BRICK_SIZE,
  BUD_FIELDS,
  DEFAULT_BUD_PER_POT,
  DEFAULT_COKE_RECIPE,
  DEFAULT_POT_RANGE,
  MAIN_STASH,
  ROOT_FIELDS,
  STRAINS,
  YIELD_SAMPLES_KEEP,
  budCell,
  dayKey,
  toCount,
  type Activity,
  type BudCell,
  type Cook,
  type CokeRecipe,
  type DayHistory,
  type NarcoticsSettings,
  type OpsLocation,
  type RootField,
  type Run,
  type StockDoc,
  type StrainId,
  type SupplyKey,
  type YieldSample,
} from './data';

export interface Totals {
  bricks: number;
  potential: number;
  trimmed: number;
  untrimmed: number;
  coca: number;
  cokeSmall: number;
  cokeLarge: number;
  meth: number;
  strains: Record<StrainId, BudCell>;
}

export interface Yield {
  avg: number;
  min: number;
  max: number;
  samples: number;
}

interface Narcotics {
  ready: boolean;
  locations: OpsLocation[];
  locById: Map<string, OpsLocation>;
  grows: OpsLocation[];
  /** Places that hold stock: stash houses and grows with on-site storage (plus any grow still holding stock). */
  storage: OpsLocation[];
  stock: Map<string, StockDoc>;
  cooks: Cook[];
  runs: Run[];
  supplies: Partial<Record<SupplyKey, number>>;
  supplyLow: Partial<Record<SupplyKey, number | null>>;
  recipe: CokeRecipe;
  activity: Activity[];
  history: Map<string, DayHistory>;
  /** Totals across every location that counts (not left out of totals). */
  totals: Totals;
  totalsFor: (locIds: string[]) => Totals;
  strainYield: (id: StrainId) => Yield;
  learnedStrains: number;
  yields: Record<string, YieldSample[]>;
  /** Locations of the crews I'm in, or every one when I'm in none. */
  crewFilter: 'mine' | 'all';
  setCrewFilter: (f: 'mine' | 'all') => void;
  visible: (loc: OpsLocation) => boolean;
  now: number;
  locLabel: (id: string) => string;
}

const Ctx = createContext<Narcotics | null>(null);

function emptyTotals(): Totals {
  return {
    bricks: 0,
    potential: 0,
    trimmed: 0,
    untrimmed: 0,
    coca: 0,
    cokeSmall: 0,
    cokeLarge: 0,
    meth: 0,
    strains: Object.fromEntries(STRAINS.map((s) => [s.id, { untrimmed: 0, trimmed: 0, bricks: 0 }])) as Record<StrainId, BudCell>,
  };
}

export function sumStock(docs: (StockDoc | undefined)[]): Totals {
  const t = emptyTotals();
  for (const d of docs) {
    if (!d) continue;
    (Object.keys(ROOT_FIELDS) as RootField[]).forEach((f) => (t[f] += toCount(d[f])));
    for (const s of STRAINS) {
      const c = budCell(d, s.id);
      BUD_FIELDS.forEach((f) => (t.strains[s.id][f] += c[f]));
    }
  }
  for (const s of STRAINS) {
    const c = t.strains[s.id];
    t.bricks += c.bricks;
    t.trimmed += c.trimmed;
    t.untrimmed += c.untrimmed;
    t.potential += Math.floor(c.trimmed / BRICK_SIZE);
  }
  return t;
}

/** Ticks once a second so countdowns move. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function NarcoticsProvider({ children }: { children: ReactNode }) {
  const { myCrews } = useHub();
  const now = useNow();
  const locationsRaw = useCollection<OpsLocation>('locations');
  const stockRaw = useCollection<StockDoc>('stock');
  const cooksQ = useMemo(() => query(collection(db, 'cooks'), where('done', '==', false)), []);
  const runsQ = useMemo(() => query(collection(db, 'runs'), where('done', '==', false)), []);
  const activityQ = useMemo(() => query(collection(db, 'activity'), orderBy('at', 'desc'), limit(50)), []);
  const historyQ = useMemo(() => query(collection(db, 'history'), where(documentId(), '>=', dayKey(30))), []);
  const cooksRaw = useCollection<Cook>(cooksQ);
  const runsRaw = useCollection<Run>(runsQ);
  const activityRaw = useCollection<Activity>(activityQ);
  const historyRaw = useCollection<DayHistory>(historyQ);
  const yieldsRaw = useCollection<{ id: string; samples?: YieldSample[] }>('yields');
  const supplies = useDoc<Partial<Record<SupplyKey, number>> & { id: string }>('supplies/lab');
  const settings = useDoc<NarcoticsSettings & { id: string }>('settings/narcotics');
  const [crewFilter, setCrewFilter] = useState<'mine' | 'all'>(() => {
    try {
      return localStorage.getItem('hq_narc_filter') === 'mine' ? 'mine' : 'all';
    } catch {
      return 'all';
    }
  });

  const value = useMemo<Narcotics>(() => {
    const locations = [...(locationsRaw ?? [])].sort(
      (a, b) =>
        (a.id === MAIN_STASH ? -1 : b.id === MAIN_STASH ? 1 : 0) ||
        (a.kind === b.kind ? 0 : a.kind === 'stash' ? -1 : 1) ||
        (a.order ?? 0) - (b.order ?? 0) ||
        (a.postal ?? a.name).localeCompare(b.postal ?? b.name),
    );
    const locById = new Map(locations.map((l) => [l.id, l]));
    const stock = new Map((stockRaw ?? []).map((s) => [s.id, s]));
    const mine = new Set(myCrews.map((c) => c.id));
    const visible = (l: OpsLocation) => crewFilter === 'all' || !mine.size || !l.crewId || mine.has(l.crewId);
    const hasStock = (id: string) => {
      const t = sumStock([stock.get(id)]);
      return t.bricks + t.trimmed + t.untrimmed + t.coca + t.cokeSmall + t.cokeLarge + t.meth > 0;
    };
    const counted = locations.filter((l) => !l.excludeTotals).map((l) => stock.get(l.id));
    const yields = Object.fromEntries((yieldsRaw ?? []).map((y) => [y.id, y.samples ?? []]));
    const strainYield = (id: StrainId): Yield => {
      const samples = [...(yields[id] ?? [])].sort((a, b) => b.at - a.at).slice(0, YIELD_SAMPLES_KEEP);
      if (!samples.length) return { avg: DEFAULT_BUD_PER_POT, min: DEFAULT_POT_RANGE[0], max: DEFAULT_POT_RANGE[1], samples: 0 };
      const perPot = samples.map((x) => x.buds / x.pots);
      const buds = samples.reduce((s, x) => s + x.buds, 0);
      const pots = samples.reduce((s, x) => s + x.pots, 0);
      return { avg: buds / pots, min: Math.min(...perPot), max: Math.max(...perPot), samples: samples.length };
    };
    const { supplyLow = {}, cokeRecipe } = settings ?? {};
    const { id: _ignored, ...supplyCounts } = supplies ?? { id: '' };
    void _ignored;
    return {
      ready: !!locationsRaw && !!stockRaw && !!cooksRaw && !!runsRaw && supplies !== undefined && settings !== undefined,
      locations,
      locById,
      grows: locations.filter((l) => l.kind === 'grow'),
      storage: locations.filter((l) => l.kind === 'stash' || l.storage || hasStock(l.id)),
      stock,
      cooks: [...(cooksRaw ?? [])].sort((a, b) => (a.at?.toMillis() ?? now) - (b.at?.toMillis() ?? now)),
      runs: [...(runsRaw ?? [])].sort((a, b) => (a.at?.toMillis() ?? now) - (b.at?.toMillis() ?? now)),
      supplies: supplyCounts,
      supplyLow,
      recipe: cokeRecipe ?? DEFAULT_COKE_RECIPE,
      activity: activityRaw ?? [],
      history: new Map((historyRaw ?? []).map((h) => [h.id, h])),
      totals: sumStock(counted),
      totalsFor: (ids) => sumStock(ids.map((id) => stock.get(id))),
      strainYield,
      learnedStrains: STRAINS.filter((s) => (yields[s.id] ?? []).length).length,
      yields,
      crewFilter,
      setCrewFilter: (f) => {
        setCrewFilter(f);
        try {
          localStorage.setItem('hq_narc_filter', f);
        } catch {
          /* optional */
        }
      },
      visible,
      now,
      locLabel: (id) => {
        const l = locById.get(id);
        if (!l) return 'a removed location';
        return l.kind === 'grow' ? `Postal ${l.postal ?? l.name}` : l.name;
      },
    };
  }, [locationsRaw, stockRaw, cooksRaw, runsRaw, activityRaw, historyRaw, yieldsRaw, supplies, settings, crewFilter, myCrews, now]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNarcotics() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNarcotics outside NarcoticsProvider');
  return v;
}
