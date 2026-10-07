import { collection, query, where } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HonorPic, RarityChip } from '../../components/HonorArt';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { DinnerNote, Lore } from '../../lib/archives';
import type { DuesPay } from '../../lib/books';
import { records, type Blacksite } from '../../lib/blacksites';
import { useMyAchievementStats } from '../../lib/cabinet';
import { db } from '../../lib/firebase';
import { claim, earnable, KINDS, markSeen, rarityOf, setUpHonors, type Honor, type HonorStats, type Loadout, type Owned } from '../../lib/honors';
import type { Bounty, Sighting } from '../../lib/rivals';
import { useArchiveAccess } from '../archives/useArchives';

interface HonorsCtx {
  honors: Honor[];
  honorById: Map<string, Honor>;
  owned: Owned[];
  ownedBy: (memberId: string) => Owned[];
  has: (memberId: string, honorId: string) => boolean;
  loadoutOf: (memberId: string) => Loadout;
  /** The honors someone has on, only counting ones they really own. */
  equipped: (memberId: string) => { title?: Honor; frame?: Honor; effect?: Honor; nameHue?: string; backdropHue?: string; accentHue?: string; trimHue?: string; showcase: Honor[] };
  score: (memberId: string) => number;
  setUp: boolean;
}
const Ctx = createContext<HonorsCtx | null>(null);
export const useHonors = () => useContext(Ctx)!;

export function HonorsProvider({ children }: { children: ReactNode }) {
  const honors = useCollection<Honor>('honors') ?? [];
  const owned = useCollection<Owned>('honorsOwned') ?? [];
  const loadouts = useCollection<Loadout>('honorLoadouts') ?? [];
  const settings = useDoc<{ setUp?: boolean }>('settings/honors');
  const value = useMemo<HonorsCtx>(() => {
    const honorById = new Map(honors.map((h) => [h.id, h]));
    const byMember = new Map<string, Owned[]>();
    owned.forEach((o) => byMember.set(o.memberId, [...(byMember.get(o.memberId) ?? []), o]));
    const ownedSet = new Set(owned.map((o) => `${o.memberId}_${o.honorId}`));
    const lo = new Map(loadouts.map((l) => [l.id, l]));
    const has = (m: string, h: string) => ownedSet.has(`${m}_${h}`);
    const pick = (m: string, id?: string | null) => (id && has(m, id) ? honorById.get(id) : undefined);
    return {
      honors,
      honorById,
      owned,
      ownedBy: (m) => byMember.get(m) ?? [],
      has,
      loadoutOf: (m) => lo.get(m) ?? { id: m },
      equipped: (m) => {
        const l = lo.get(m) ?? { id: m };
        const hue = (id?: string | null) => pick(m, id)?.color;
        return {
          title: pick(m, l.title),
          frame: pick(m, l.frame),
          effect: pick(m, l.effect),
          nameHue: hue(l.nameHue),
          backdropHue: hue(l.backdropHue),
          accentHue: hue(l.accentHue),
          trimHue: hue(l.trimHue),
          showcase: (l.showcase ?? []).map((id) => pick(m, id)).filter((x): x is Honor => !!x),
        };
      },
      score: (m) => (byMember.get(m) ?? []).reduce((t, o) => t + rarityOf(honorById.get(o.honorId)?.rarity).points, 0),
      setUp: !!settings?.setUp,
    };
  }, [honors, owned, loadouts, settings]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <EnsureCatalog />
      <HonorWatcher />
      <HueApplier />
      <UnlockToasts />
    </Ctx.Provider>
  );
}

/** Every number the milestones count, for the signed-in member. */
export function useMyHonorStats(): HonorStats | null {
  const { me } = useHub();
  const { blooded } = useArchiveAccess();
  const base = useMyAchievementStats();
  const sitesQ = useMemo(() => query(collection(db, 'blacksites'), where('participants', 'array-contains', me.id)), [me.id]);
  const sites = useCollection<Blacksite>(sitesQ);
  const notes = useCollection<DinnerNote>(useMemo(() => query(collection(db, 'dinnerNotes'), where('status', '==', 'published')), []), blooded) ?? [];
  const dues = useCollection<DuesPay>(useMemo(() => query(collection(db, 'duesPay'), where('memberId', '==', me.id)), [me.id])) ?? [];
  const lore = useCollection<Lore>(useMemo(() => query(collection(db, 'lore'), where('by', '==', me.id)), [me.id]), blooded) ?? [];
  const seen = useCollection<Sighting>(useMemo(() => query(collection(db, 'sightings'), where('by', '==', me.id)), [me.id])) ?? [];
  const bounties = useCollection<Bounty>(useMemo(() => query(collection(db, 'bounties'), where('claimBy', '==', me.id)), [me.id])) ?? [];
  const reacts = useCollection<{ id: string }>(useMemo(() => query(collection(db, 'archiveReacts'), where('memberId', '==', me.id)), [me.id]), blooded) ?? [];
  if (!base || !sites) return null;
  const r = records(sites).get(me.id);
  return {
    ...base,
    fights: r?.fights ?? 0,
    wins: r?.wins ?? 0,
    mvps: r?.mvps ?? 0,
    kills: r?.kills ?? 0,
    dinners: notes.filter((n) => n.present.includes(me.id)).length,
    duesPaid: dues.filter((d) => d.status === 'confirmed').length,
    stories: lore.filter((l) => l.status === 'published').length,
    sightings: seen.length,
    bounties: bounties.filter((b) => b.status === 'paid').length,
    reactions: reacts.length,
  };
}

/** Quietly unlocks every milestone I've reached and don't have yet. */
function HonorWatcher() {
  const { me, preview } = useHub();
  const { honors, has } = useHonors();
  const stats = useMyHonorStats();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!stats || preview) return;
    for (const h of honors) {
      if (h.source !== 'milestone' || !h.stat || !earnable(h) || has(me.id, h.id) || tried.current.has(h.id)) continue;
      if ((stats[h.stat] ?? 0) >= (h.goal ?? Infinity)) {
        tried.current.add(h.id);
        void claim(me, h.id).catch(() => {});
      }
    }
  }, [stats, honors, has, me, preview]);
  return null;
}

/** My equipped accent and trim hues recolor the app, just for me. */
function HueApplier() {
  const { me } = useHub();
  const { equipped } = useHonors();
  const e = equipped(me.id);
  useEffect(() => {
    const el = document.documentElement;
    const set = (k: string, v: string | null) => (v ? el.style.setProperty(k, v) : el.style.removeProperty(k));
    const a = e.accentHue;
    const shades: [string, number][] = [['50', 92], ['100', 80], ['200', 62], ['300', 42], ['400', 18], ['500', 0], ['600', -25], ['700', -45], ['900', -80]];
    shades.forEach(([k, mix]) => set(`--color-gold-${k}`, a ? (mix >= 0 ? `color-mix(in oklab, ${a}, white ${mix}%)` : `color-mix(in oklab, ${a}, black ${-mix}%)`) : null));
    if (a) {
      const n = parseInt(a.slice(1), 16);
      set('--acc', `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`);
      set('--acc-hi', `${Math.min(255, ((n >> 16) & 255) + 50)} ${Math.min(255, ((n >> 8) & 255) + 50)} ${Math.min(255, (n & 255) + 50)}`);
    } else {
      set('--acc', null);
      set('--acc-hi', null);
    }
    const t = e.trimHue;
    set('--color-line', t ? `color-mix(in oklab, ${t} 45%, transparent)` : null);
    set('--color-line-soft', t ? `color-mix(in oklab, ${t} 22%, transparent)` : null);
  }, [e.accentHue, e.trimHue]);
  return null;
}

/** A small card pops in the corner when something unlocks, colored and animated by rarity. */
function UnlockToasts() {
  const { me, preview } = useHub();
  const { ownedBy, honorById } = useHonors();
  const fresh = ownedBy(me.id).filter((o) => !o.seen && honorById.has(o.honorId));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = fresh.filter((o) => !gone.has(o.id)).slice(0, 3);
  useEffect(() => {
    if (preview || !list.length) return;
    // The cards on screen go together after a few seconds; the next batch (if any) follows.
    const t = setTimeout(() => {
      setGone((g) => new Set([...g, ...list.map((o) => o.id)]));
      list.forEach((o) => void markSeen(me.id, o.honorId).catch(() => {}));
    }, 6000);
    return () => clearTimeout(t);
  }, [list, me.id, preview]);
  if (preview || !list.length) return null;
  return (
    <div className="fixed right-4 bottom-20 z-[70] flex flex-col gap-3 lg:bottom-6">
      {list.map((o) => {
        const h = honorById.get(o.honorId)!;
        return (
          <button
            key={o.id}
            className={`honor-toast rar-${h.rarity}`}
            style={{ ['--rar' as string]: rarityOf(h.rarity).color }}
            onClick={() => {
              setGone((g) => new Set(g).add(o.id));
              void markSeen(me.id, o.honorId);
            }}
          >
            <span className="honor-toast-pic">
              <HonorPic h={h} member={me} />
            </span>
            <span className="min-w-0 text-left">
              <span className="label block text-[9px]" style={{ color: rarityOf(h.rarity).color }}>
                {o.by === 'milestone' ? 'Unlocked' : `From ${o.byName}`} · {KINDS.find((k) => k.id === h.kind)?.label}
              </span>
              <b className="block truncate font-display text-lg text-gold-100">{h.name}</b>
              <RarityChip r={h.rarity} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EnsureCatalog() {
  useEnsureCatalog();
  return null;
}

/** High Table: put the starting catalog in place the first time one of them signs in. */
export function useEnsureCatalog() {
  const { isLead, preview } = useHub();
  const { setUp, honors } = useHonors();
  const settings = useDoc<{ setUp?: boolean }>('settings/honors');
  const done = useRef(false);
  useEffect(() => {
    if (!isLead || preview || done.current || settings === undefined || setUp || honors.length) return;
    done.current = true;
    void setUpHonors().catch(() => {});
  }, [isLead, preview, settings, setUp, honors.length]);
}
