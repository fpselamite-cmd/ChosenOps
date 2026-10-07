import { Gift, Hammer, Lock, Sparkles, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../../components/Field';
import { FancyName, Framed, HonorPic, RarityChip, TitleTag } from '../../components/HonorArt';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { ago } from '../../lib/format';
import { give, HIGH_TIER, HUE_SLOTS, KINDS, RARITIES, rarityOf, revoke, saveLoadout, STATS, type Honor, type HonorKind, type Loadout } from '../../lib/honors';
import type { Member } from '../../lib/types';
import { useArchiveAccess } from '../archives/useArchives';
import { Forge } from './Forge';
import { useHonors, useMyHonorStats } from './useHonors';

const statLabel = (id?: string | null) => STATS.find((s) => s.id === id)?.label ?? id ?? '';
const rank = (h: Honor) => RARITIES.findIndex((r) => r.id === h.rarity);

/** What you have on, and swapping it. */
function Wardrobe({ m }: { m: Member }) {
  const { honorById, ownedBy, loadoutOf, equipped } = useHonors();
  const mine = ownedBy(m.id).map((o) => honorById.get(o.honorId)).filter((x): x is Honor => !!x);
  const l = loadoutOf(m.id);
  const e = equipped(m.id);
  const of = (k: HonorKind) => mine.filter((h) => h.kind === k).sort((a, b) => rank(b) - rank(a));
  const set = (patch: Omit<Loadout, 'id'>) => saveLoadout(m.id, patch);
  const pick = (label: string, k: HonorKind, field: keyof Loadout) => (
    <Field label={label}>
      <select className="input py-1.5 text-sm" value={(l[field] as string) ?? ''} onChange={(ev) => set({ [field]: ev.target.value || null })}>
        <option value="">None</option>
        {of(k).map((h) => (
          <option key={h.id} value={h.id}>
            {h.name} · {rarityOf(h.rarity).label}
          </option>
        ))}
      </select>
    </Field>
  );
  const badges = of('badge');
  const show = l.showcase ?? [];
  return (
    <Panel title="Your loadout">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center gap-2 text-center" style={e.backdropHue ? { background: `radial-gradient(circle at 50% 30%, color-mix(in oklab, ${e.backdropHue} 35%, transparent), transparent 70%)` } : undefined}>
          <Framed member={m} frame={e.frame} size="xl" />
          <FancyName name={m.name} hue={e.nameHue} effect={e.effect?.effect} className="font-display text-2xl" />
          {e.title && <TitleTag h={e.title} />}
          <div className="flex gap-1.5">
            {e.showcase.map((h) => (
              <HonorPic key={h.id} h={h} />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {pick('Title', 'title', 'title')}
            {pick('Portrait frame', 'frame', 'frame')}
            {pick('Name effect', 'effect', 'effect')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {HUE_SLOTS.map((s) => (
              <Field key={s.id} label={`${s.label} · ${s.hint}`}>
                <div className="flex flex-wrap gap-1.5">
                  <button className={`chip px-2 py-1 text-xs ${!l[s.id] ? 'border-gold-400 text-gold-200' : 'text-smoke'}`} onClick={() => set({ [s.id]: null })}>
                    Default
                  </button>
                  {of('hue').map((h) => (
                    <button key={h.id} title={h.name} onClick={() => set({ [s.id]: h.id })} className={`size-7 rounded-full border-2 ${l[s.id] === h.id ? 'border-white' : 'border-transparent'}`} style={{ background: h.color }} />
                  ))}
                  {!of('hue').length && <span className="text-xs text-smoke">No hues yet.</span>}
                </div>
              </Field>
            ))}
          </div>
          <Field label={`Showcase badges (${show.length}/3)`}>
            <div className="flex flex-wrap gap-2">
              {badges.map((h) => {
                const on = show.includes(h.id);
                return (
                  <button key={h.id} title={h.name} className={`rounded p-0.5 ${on ? 'ring-2 ring-gold-300' : 'opacity-60 hover:opacity-100'}`} onClick={() => set({ showcase: on ? show.filter((x) => x !== h.id) : [...show, h.id].slice(-3) })}>
                    <HonorPic h={h} />
                  </button>
                );
              })}
              {!badges.length && <span className="text-xs text-smoke">Earn badges to show them off.</span>}
            </div>
          </Field>
        </div>
      </div>
    </Panel>
  );
}

function GiveDialog({ m, h, onClose }: { m: Member; h: Honor; onClose: () => void }) {
  const { me } = useHub();
  const [note, setNote] = useState('');
  return (
    <Modal title={`Give ${h.name} to ${m.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <HonorPic h={h} member={m} />
          <RarityChip r={h.rarity} />
        </div>
        <Field label="A word with it (optional)">
          <input className="input" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold" onClick={() => give(me, m.id, h.id, note).then(onClose)}>
            <Gift className="size-4" /> Give it
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Someone's Honorwall: everything earned and still to earn, on their character page. */
export function Vault({ m }: { m: Member }) {
  const { me, isLead } = useHub();
  const { isArchivist } = useArchiveAccess();
  const { honors, has, ownedBy, score } = useHonors();
  const stats = useMyHonorStats();
  const [kind, setKind] = useState<HonorKind | 'all'>('all');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [giving, setGiving] = useState<Honor | null>(null);
  const [forge, setForge] = useState(false);
  const mine = m.id === me.id;
  const owned = ownedBy(m.id);
  const ownedMap = new Map(owned.map((o) => [o.honorId, o]));
  const live = honors.filter((h) => h.status !== 'proposed');
  const list = live
    .filter((h) => (kind === 'all' || h.kind === kind) && (!onlyOwned || ownedMap.has(h.id)) && (h.status === 'active' || ownedMap.has(h.id)))
    .sort((a, b) => +ownedMap.has(b.id) - +ownedMap.has(a.id) || rank(b) - rank(a) || a.name.localeCompare(b.name));
  const counts = RARITIES.map((r) => ({ r, n: owned.filter((o) => honors.find((h) => h.id === o.honorId)?.rarity === r.id).length }));
  return (
    <div className="space-y-6">
      <div className="hud flex flex-wrap items-center gap-5 p-5">
        <div>
          <p className="label text-gold-500">Honorwall</p>
          <p className="font-display text-3xl text-gold-100">
            {score(m.id).toLocaleString()} <span className="text-base text-smoke">honor</span>
          </p>
          <p className="text-xs text-smoke">
            {owned.length} of {live.filter((h) => h.status === 'active').length} unlocked
          </p>
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          {counts.map(({ r, n }) => (
            <span key={r.id} className="rar-count" style={{ ['--rar' as string]: r.color }}>
              <b>{n}</b> {r.label}
            </span>
          ))}
        </div>
        {(isLead || isArchivist) && (
          <button className="btn-ghost btn-sm" onClick={() => setForge(true)}>
            <Hammer className="size-3.5" /> The Forge
          </button>
        )}
      </div>

      {mine && <Wardrobe m={m} />}

      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 'all' as const, plural: 'Everything' }, ...KINDS].map((k) => (
          <button key={k.id} className={`chip px-3 py-1 text-xs ${kind === k.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => setKind(k.id)}>
            {k.plural}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-smoke">
          <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Unlocked only
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((h) => {
          const o = ownedMap.get(h.id);
          // What it takes stays hidden for secret and high-tier honors until you've earned one yourself.
          const viewerHas = has(me.id, h.id);
          const nameHidden = h.secret && !o && !viewerHas;
          const howHidden = !viewerHas && (h.secret || HIGH_TIER.includes(h.rarity));
          const progress = mine && !o && h.source === 'milestone' && h.stat && stats && !howHidden ? Math.min(1, (stats[h.stat] ?? 0) / (h.goal || 1)) : null;
          return (
            <div key={h.id} className={`honor-tile rar-${h.rarity} ${o ? 'owned' : 'locked'}`} style={{ ['--rar' as string]: rarityOf(h.rarity).color }}>
              <div className="honor-tile-pic">
                <HonorPic h={h} locked={!o && nameHidden} member={m} />
                {!o && <Lock className="honor-lock" />}
              </div>
              <b className="honor-tile-name">{nameHidden ? '???' : h.name}</b>
              <RarityChip r={h.rarity} />
              {h.season && <span className="text-[10px] tracking-widest text-sky-300 uppercase">{h.season}</span>}
              <p className="honor-tile-how">
                {howHidden && !o
                  ? 'Earn it to find out.'
                  : h.source === 'honor'
                    ? h.description || 'Given by High Table.'
                    : o
                      ? h.description
                      : `${statLabel(h.stat)}: ${(h.goal ?? 0).toLocaleString()}`}
              </p>
              {progress !== null && (
                <span className="welcome-bar mt-1 block w-full">
                  <i style={{ width: `${progress * 100}%` }} />
                </span>
              )}
              {o && <p className="text-[10px] text-smoke">{o.by === 'milestone' ? `Unlocked ${ago(o.at)}` : `From ${o.byName} ${ago(o.at)}${o.note ? ` · “${o.note}”` : ''}`}</p>}
              {isLead && !mine && h.source === 'honor' && !o && h.status === 'active' && (
                <button className="btn-ghost btn-sm mt-1" onClick={() => setGiving(h)}>
                  <Gift className="size-3" /> Give
                </button>
              )}
              {isLead && o && o.by !== 'milestone' && (
                <button className="mt-1 text-[11px] text-smoke hover:text-red-300" onClick={() => confirm(`Take ${h.name} back from ${m.name}?`) && revoke(m.id, h.id)}>
                  <Undo2 className="inline size-3" /> Revoke
                </button>
              )}
            </div>
          );
        })}
        {!list.length && (
          <p className="col-span-full flex items-center gap-2 text-sm text-smoke">
            <Sparkles className="size-4" /> {honors.length ? 'Nothing here yet.' : 'The Honorwall is being set up.'}
          </p>
        )}
      </div>
      {giving && <GiveDialog m={m} h={giving} onClose={() => setGiving(null)} />}
      {forge && <Forge onClose={() => setForge(false)} />}
    </div>
  );
}
