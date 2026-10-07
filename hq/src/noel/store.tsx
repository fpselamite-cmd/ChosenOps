import { Timestamp } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { NOEL_MAIN, hqIdOf, setKnownBuckets, useNoel, type NoelBucket, type NoelGrow, type NoelStash } from '../lib/noelops';
import { BRICK_SIZE, BUD_FIELDS, MAIN_STASH, ROOT_FIELDS, STRAINS, budCell, toCount, type BudCell, type OpsLocation, type RootField, type StockDoc, type StrainId } from './data';

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

interface Narcotics {
  ready: boolean;
  /** NoelOps couldn't be reached: drug counts are missing, items still show. */
  noelDown: boolean;
  locations: OpsLocation[];
  locById: Map<string, OpsLocation>;
  /** Places that hold stock: stash houses and grows with on-site storage (plus any grow still holding stock). */
  storage: OpsLocation[];
  /** Drug counts come from NoelOps, items from the HQ. */
  stock: Map<string, StockDoc>;
  /** NoelOps' grows as it stores them (key → grow). */
  noelGrows: Record<string, NoelGrow>;
  /** Totals across every location that counts (not left out of totals). */
  totals: Totals;
  totalsFor: (locIds: string[]) => Totals;
  /** Locations of the crews I'm in, or every one when I'm in none. */
  crewFilter: 'mine' | 'all';
  setCrewFilter: (f: 'mine' | 'all') => void;
  visible: (loc: OpsLocation) => boolean;
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

export function sumStock(docs: (StockDoc | NoelBucket | undefined | null)[]): Totals {
  const t = emptyTotals();
  for (const d of docs) {
    if (!d) continue;
    (Object.keys(ROOT_FIELDS) as RootField[]).forEach((f) => (t[f] += toCount(d[f])));
    for (const s of STRAINS) {
      const c = budCell(d as StockDoc, s.id);
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

/** Firestore ids that stand for NoelOps places (the HQ's own extras for them, like crew). */
const noelShaped = (id: string) => id === MAIN_STASH || id.startsWith('noel_') || /^g\d+$/.test(id);

/** The places NoelOps has, shaped like HQ locations. */
function noelPlaces(main: { name?: string; excludeTotals?: boolean } | null | undefined, stashes: Record<string, NoelStash>, grows: Record<string, NoelGrow>) {
  const out: OpsLocation[] = [{ id: MAIN_STASH, kind: 'stash', name: main?.name?.trim() || 'Main Stash', excludeTotals: !!main?.excludeTotals, crewId: null, order: 0 }];
  Object.entries(stashes).forEach(([id, s]) => {
    if (!s || typeof s !== 'object') return;
    out.push({ id: `noel_${id}`, kind: 'stash', name: s.name || 'Stash house', note: s.note || '', excludeTotals: !!s.excludeTotals, crewId: null, order: 1 + (Number(s.order) || 0) / 1e13 });
  });
  Object.entries(grows).forEach(([key, g]) => {
    if (!g || typeof g !== 'object') return;
    const postal = String(g.id ?? hqIdOf(key).slice(1));
    out.push({
      id: hqIdOf(key),
      kind: 'grow',
      name: g.alias || `Postal ${postal}`,
      postal,
      crewId: null,
      durationHours: Number(g.durationHours) || 36,
      pots: toCount(g.pots),
      startTime: g.startTime ? Timestamp.fromMillis(Number(g.startTime)) : null,
      strainPots: g.strainPots ?? {},
      storage: g.storage === true,
      stashTo: hqIdOf(g.stashTo || NOEL_MAIN),
      excludeTotals: g.excludeTotals === true,
      order: 10 + (Number(g.order) || 0),
    });
  });
  return out;
}

export function NarcoticsProvider({ children }: { children: ReactNode }) {
  const { myCrews } = useHub();
  const hqLocations = useCollection<OpsLocation>('locations');
  const hqStock = useCollection<StockDoc>('stock');
  const nStock = useNoel<Record<string, NoelBucket>>('stock');
  const nStashes = useNoel<Record<string, NoelStash>>('stashes');
  const nGrows = useNoel<Record<string, NoelGrow>>('locations');
  const nMain = useNoel<{ name?: string; excludeTotals?: boolean }>('settings/mainStash');
  // If NoelOps doesn't answer, don't hold the page forever: show the HQ side and say so.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  const [crewFilter, setCrewFilter] = useState<'mine' | 'all'>(() => {
    try {
      return localStorage.getItem('hq_narc_filter') === 'mine' ? 'mine' : 'all';
    } catch {
      return 'all';
    }
  });

  const noelLoaded = [nStock, nStashes, nGrows, nMain].every((x) => x.data !== undefined);
  const noelDown = [nStock, nStashes, nGrows, nMain].some((x) => x.error) || (!noelLoaded && slow);

  const value = useMemo<Narcotics>(() => {
    const stashes = nStashes.data ?? {};
    const grows = nGrows.data ?? {};
    const buckets = nStock.data ?? {};
    setKnownBuckets([...Object.keys(stashes).map((id) => `%h${id}`), ...Object.keys(grows)]);

    const extras = new Map((hqLocations ?? []).map((l) => [l.id, l]));
    const fromNoel = noelPlaces(nMain.data, stashes, grows).map((l) => {
      const x = extras.get(l.id);
      return x
        ? { ...l, crewId: x.crewId ?? null, postal: l.kind === 'grow' ? l.postal : x.postal, createdBy: x.createdBy, owners: x.owners, seeRank: x.seeRank ?? null, takeRank: x.takeRank ?? null, mins: x.mins, values: x.values }
        : l;
    });
    const noelIds = new Set(fromNoel.map((l) => l.id));
    // Places only the HQ has (items only, or drugs kept the old way).
    const hqOnly = (hqLocations ?? []).filter((l) => !noelIds.has(l.id) && !noelShaped(l.id));
    const locations = [...fromNoel, ...hqOnly].sort(
      (a, b) =>
        (a.id === MAIN_STASH ? -1 : b.id === MAIN_STASH ? 1 : 0) ||
        (a.kind === b.kind ? 0 : a.kind === 'stash' ? -1 : 1) ||
        (a.order ?? 0) - (b.order ?? 0) ||
        (a.postal ?? a.name).localeCompare(b.postal ?? b.name),
    );
    const locById = new Map(locations.map((l) => [l.id, l]));

    const hqStockById = new Map((hqStock ?? []).map((s) => [s.id, s]));
    const stock = new Map<string, StockDoc>();
    for (const l of locations) {
      const hq = hqStockById.get(l.id);
      if (noelIds.has(l.id)) {
        const key = l.id === MAIN_STASH ? NOEL_MAIN : l.id.startsWith('noel_') ? `%h${l.id.slice(5)}` : Object.keys(grows).find((k) => hqIdOf(k) === l.id);
        const drugs = key ? buckets[key] : undefined;
        stock.set(l.id, { ...(drugs ?? {}), id: l.id, items: hq?.items ?? {} });
      } else if (hq) stock.set(l.id, hq);
    }

    const mine = new Set(myCrews.map((c) => c.id));
    const visible = (l: OpsLocation) => crewFilter === 'all' || !mine.size || !l.crewId || mine.has(l.crewId);
    const hasStock = (id: string) => {
      const t = sumStock([stock.get(id)]);
      return t.bricks + t.trimmed + t.untrimmed + t.coca + t.cokeSmall + t.cokeLarge + t.meth > 0 || Object.values(stock.get(id)?.items ?? {}).some((v) => toCount(v));
    };
    const counted = locations.filter((l) => !l.excludeTotals).map((l) => stock.get(l.id));
    return {
      ready: !!hqLocations && !!hqStock && (noelLoaded || noelDown),
      noelDown,
      locations,
      locById,
      storage: locations.filter((l) => l.kind === 'stash' || l.storage || hasStock(l.id)),
      stock,
      noelGrows: grows,
      totals: sumStock(counted),
      totalsFor: (ids) => sumStock(ids.map((id) => stock.get(id))),
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
      locLabel: (id) => {
        const l = locById.get(id);
        if (!l) return 'a removed location';
        return l.kind === 'grow' ? `Postal ${l.postal ?? l.name}` : l.name;
      },
    };
  }, [hqLocations, hqStock, nStock.data, nStashes.data, nGrows.data, nMain.data, noelLoaded, noelDown, crewFilter, myCrews]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNarcotics() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNarcotics outside NarcoticsProvider');
  return v;
}
