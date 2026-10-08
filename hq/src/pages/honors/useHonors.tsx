import { collection, query, where } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, HonorPic, RarityChip } from '../../components/HonorArt';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { DinnerNote, Lore } from '../../lib/archives';
import type { DuesPay } from '../../lib/books';
import { records, type Blacksite } from '../../lib/blacksites';
import { useCabinet, useMyAchievementStats } from '../../lib/cabinet';
import { heistStatsOf, type Heist } from '../../lib/heists';
import { runStatsOf, type NarcoRun } from '../../lib/runs';
import { db } from '../../lib/firebase';
import { CHIPS_FOR, NARCO_STATS, SETS, setMembers, claim, earnable, HONORS_VERSION, KINDS, markSeen, rarityOf, setUpHonors, type Honor, type HonorStats, type Loadout, type Owned } from '../../lib/honors';
import type { Bounty, Sighting } from '../../lib/rivals';
import { useArchiveAccess } from '../archives/useArchives';
import { claimGift, dayKey, DEFAULT_CASINO, openChips, weekKey, type CasinoSettings, type ChipGift, type Chips } from '../../lib/casino';
import { doc, increment, updateDoc } from 'firebase/firestore';

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
  /** Which number this copy is: No. n of everyone who holds it, by when they earned it. */
  serialOf: (memberId: string, honorId: string) => { n: number; of: number } | null;
  setUp: boolean;
  /** Everyone's honors and who owns what have both loaded (until then, "doesn't own it" means "don't know yet"). */
  ready: boolean;
}
const Ctx = createContext<HonorsCtx | null>(null);
export const useHonors = () => useContext(Ctx)!;

export function HonorsProvider({ children }: { children: ReactNode }) {
  const { narco } = useHub();
  const allHonors = useCollection<Honor>('honors');
  const allOwned = useCollection<Owned>('honorsOwned');
  // Honors for narcotics milestones only exist for Narco (and High Table).
  const honors = useMemo(() => (allHonors ?? []).filter((h) => narco || !NARCO_STATS.has(h.stat ?? '')), [allHonors, narco]);
  const owned = useMemo(() => {
    const ok = new Set(honors.map((h) => h.id));
    return (allOwned ?? []).filter((o) => ok.has(o.honorId));
  }, [allOwned, honors]);
  const loadouts = useCollection<Loadout>('honorLoadouts') ?? [];
  const settings = useDoc<{ setUp?: boolean }>('settings/honors');
  const value = useMemo<HonorsCtx>(() => {
    const honorById = new Map(honors.map((h) => [h.id, h]));
    const byMember = new Map<string, Owned[]>();
    owned.forEach((o) => byMember.set(o.memberId, [...(byMember.get(o.memberId) ?? []), o]));
    const ownedSet = new Set(owned.map((o) => `${o.memberId}_${o.honorId}`));
    const byHonor = new Map<string, Owned[]>();
    owned.forEach((o) => byHonor.set(o.honorId, [...(byHonor.get(o.honorId) ?? []), o]));
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
      serialOf: (m, h) => {
        const holders = (byHonor.get(h) ?? []).slice().sort((a, b) => (a.at?.toMillis() ?? Date.now()) - (b.at?.toMillis() ?? Date.now()));
        const i = holders.findIndex((o) => o.memberId === m);
        return i < 0 ? null : { n: i + 1, of: holders.length };
      },
      setUp: !!settings?.setUp,
      ready: allHonors !== null && allOwned !== null,
    };
  }, [honors, owned, loadouts, settings, allHonors, allOwned]);
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
  const { me, narco } = useHub();
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
  const ballots = useCollection<{ id: string }>(useMemo(() => query(collection(db, 'pollBallots'), where('memberId', '==', me.id)), [me.id])) ?? [];
  const heists = useCollection<Heist>(useMemo(() => query(collection(db, 'heists'), where('crew', 'array-contains', me.id)), [me.id]), blooded) ?? [];
  const runs = useCollection<NarcoRun>(useMemo(() => query(collection(db, 'narcoRuns'), where('crew', 'array-contains', me.id)), [me.id]), narco) ?? [];
  const chips = useDoc<Chips>(`chips/${me.id}`);
  const ctx = useContext(Ctx);
  const { trophies } = useCabinet(me.id, true);
  if (!base || !sites || chips === undefined) return null;
  // A set counts as collected once every piece in it is mine.
  const setDone = (group: string) => {
    if (!ctx) return 0;
    const pieces = setMembers(ctx.honors, group);
    return pieces.length > 0 && pieces.every((h) => ctx.has(me.id, h.id)) ? 1 : 0;
  };
  const sets: Record<string, number> = Object.fromEntries(SETS.map((st) => [st.id, setDone(st.group)]));
  const setsDone = Object.values(sets).reduce((t, v) => t + v, 0);
  const champion = trophies.filter((t) => t.kind === 'monthly' && (t as { place?: number }).place === 1).length;
  const hz = heistStatsOf(heists, me.id);
  const nr = runStatsOf(runs, me.id);
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
    votes: ballots.length,
    birthdays: (chips?.partiesPaid ?? []).filter((x) => x.startsWith('birthday_')).length,
    hands: chips?.hands ?? 0,
    chipsWon: chips?.chipsWon ?? 0,
    biggestWin: chips?.biggestWin ?? 0,
    blackjacks: chips?.blackjacks ?? 0,
    jackpots: chips?.jackpots ?? 0,
    narcoRuns: nr.narcoRuns,
    runsClean: nr.runsClean,
    runsBusted: nr.runsBusted,
    runsRobbed: nr.runsRobbed,
    bestHaul: nr.bestHaul,
    heists: hz.heists,
    heistWins: hz.heistWins,
    heistFails: hz.heistFails,
    bestTake: hz.bestTake,
    heistStreak: hz.heistStreak,
    asDriver: hz.asDriver,
    asHacker: hz.asHacker,
    asGunman: hz.asGunman,
    ...sets,
    setsDone,
    champion,
  } as HonorStats;
}

/** Quietly unlocks every milestone I've reached and don't have yet. */
function HonorWatcher() {
  const { me, preview } = useHub();
  const { honors, has, ready } = useHonors();
  const stats = useMyHonorStats();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    // Wait for what I own to load: claiming one I already have gets refused, but it flashes up as new first.
    if (!stats || preview || !ready) return;
    for (const h of honors) {
      if (h.source !== 'milestone' || !h.stat || !earnable(h) || has(me.id, h.id) || tried.current.has(h.id)) continue;
      if ((stats[h.stat] ?? 0) >= (h.goal ?? Infinity)) {
        tried.current.add(h.id);
        void claim(me, h.id).catch(() => {});
      }
    }
  }, [stats, honors, has, me, preview, ready]);

  // The casino purse: weekly allowance, daily bonus, chips for new activity and for honors unlocked, gifts.
  const chips = useDoc<Chips>(`chips/${me.id}`);
  const casino = { ...DEFAULT_CASINO, ...(useDoc<CasinoSettings>('settings/casino') ?? {}) };
  const { ownedBy, honorById } = useHonors();
  const giftQ = useMemo(() => query(collection(db, 'chipGifts'), where('to', '==', me.id), where('claimed', '==', false)), [me.id]);
  const gifts = useCollection<ChipGift>(giftQ) ?? [];
  const busy = useRef(false);
  useEffect(() => {
    if (preview || !stats || chips === undefined || busy.current) return;
    if (chips === null) {
      busy.current = true;
      void openChips(me.id, casino.weekly).finally(() => (busy.current = false));
      return;
    }
    const paid = chips.paidFor ?? {};
    const units: Record<string, [number, number]> = { runs: [stats.runs, casino.perRun], fights: [stats.fights, casino.perFight], dinners: [stats.dinners, casino.perDinner], votes: [stats.votes, casino.perVote] };
    let add = 0;
    const patch: Record<string, unknown> = {};
    if (chips.lastWeekly !== weekKey()) (add += casino.weekly), (patch.lastWeekly = weekKey());
    if (chips.lastDaily !== dayKey()) (add += casino.daily), (patch.lastDaily = dayKey());
    for (const [k, [n, per]] of Object.entries(units)) {
      // The first time, count what's already done as paid (no back-pay flood).
      const was = paid[k];
      if (was === undefined) patch[`paidFor.${k}`] = n;
      else if (n > was) (add += (n - was) * per), (patch[`paidFor.${k}`] = n);
    }
    const already = new Set(chips.honorsPaid ?? []);
    const fresh = ownedBy(me.id).filter((o) => !already.has(o.honorId) && honorById.has(o.honorId) && o.by !== 'shop');
    if (fresh.length) {
      add += fresh.reduce((t, o) => t + (honorById.get(o.honorId)!.chips ?? CHIPS_FOR[honorById.get(o.honorId)!.rarity]), 0);
      patch.honorsPaid = [...already, ...fresh.map((o) => o.honorId)];
    }
    if (!Object.keys(patch).length) return;
    busy.current = true;
    void updateDoc(doc(db, 'chips', me.id), { ...patch, ...(add ? { balance: increment(add) } : {}) })
      .catch(() => {})
      .finally(() => (busy.current = false));
  }, [preview, stats, chips, casino.weekly, casino.daily, casino.perRun, casino.perFight, casino.perDinner, casino.perVote, me.id, ownedBy, honorById]);
  useEffect(() => {
    if (preview || !chips) return;
    gifts.forEach((g) => void claimGift(me.id, g).catch(() => {}));
  }, [gifts, chips, me.id, preview]);
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

/**
 * The unlock moment: a small case drops in, the lid swings open and the piece rises out of it with a
 * burst in its tier's color. Mythic takes the whole screen. Several at once queue up (or skip them all).
 */
function UnlockToasts() {
  const { me, preview } = useHub();
  const { ownedBy, honorById, serialOf } = useHonors();
  // Only once the server has it (its time is filled in): a write that's about to be refused never flashes up.
  const fresh = ownedBy(me.id).filter((o) => !o.seen && !!o.at && honorById.has(o.honorId));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const queue = fresh.filter((o) => !gone.has(o.id));
  const o = queue[0];
  if (preview || !o) return null;
  const h = honorById.get(o.honorId)!;
  const serial = serialOf(me.id, h.id);
  const next = () => {
    setGone((g) => new Set(g).add(o.id));
    void markSeen(me.id, o.honorId).catch(() => {});
  };
  const skipAll = () => {
    setGone((g) => new Set([...g, ...queue.map((x) => x.id)]));
    queue.forEach((x) => void markSeen(me.id, x.honorId).catch(() => {}));
  };
  return (
    <div className={`honor-toast unlock rar-${h.rarity}`} style={{ ['--rar' as string]: rarityOf(h.rarity).color }} onClick={next} role="dialog" aria-label={`Unlocked ${h.name}`}>
      <div className="unlock-stage" key={o.id}>
        <span className="unlock-burst" aria-hidden />
        <span className="unlock-rays" aria-hidden />
        <div className="unlock-case" aria-hidden>
          <span className="unlock-lid" />
          <span className="unlock-box" />
        </div>
        <div className="unlock-piece">{h.kind === 'badge' ? <Badge h={h} size={130} ribbon /> : <HonorPic h={h} member={me} />}</div>
        <div className="unlock-text">
          <span className="label block text-[10px]" style={{ color: rarityOf(h.rarity).color }}>
            {o.by === 'milestone' ? 'Unlocked' : o.by === 'shop' ? 'Bought' : `From ${o.byName}`} · {KINDS.find((k) => k.id === h.kind)?.label}
          </span>
          <b className="block font-display text-3xl text-gold-100">{h.name}</b>
          <span className="mt-1 flex items-center justify-center gap-2">
            <RarityChip r={h.rarity} />
            {serial && <span className="text-xs text-smoke">No. {serial.n} of {serial.of}</span>}
          </span>
          {h.description && <span className="mt-2 block text-sm text-ash">{h.description}</span>}
          {o.by !== 'shop' && <span className="mt-1 block text-xs text-gold-300">+{(h.chips ?? CHIPS_FOR[h.rarity]).toLocaleString()} chips</span>}
        </div>
        <div className="unlock-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn-gold btn-sm" onClick={next}>
            {queue.length > 1 ? `Next (${queue.length - 1} more)` : 'Into the case'}
          </button>
          {queue.length > 1 && (
            <button className="btn-ghost btn-sm" onClick={skipAll}>
              Skip all
            </button>
          )}
        </div>
      </div>
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
  const { honors } = useHonors();
  const settings = useDoc<{ setUp?: boolean; version?: number }>('settings/honors');
  const done = useRef(false);
  useEffect(() => {
    if (!isLead || preview || done.current || settings === undefined) return;
    if (settings?.setUp && (settings.version ?? 1) >= HONORS_VERSION) return;
    done.current = true;
    void setUpHonors(new Set(honors.map((h) => h.id))).catch(() => {});
  }, [isLead, preview, settings, honors]);
}
