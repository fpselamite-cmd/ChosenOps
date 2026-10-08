import { collection, deleteDoc, doc, query, setDoc, where } from 'firebase/firestore';
import { ArrowRightLeft, Bookmark, Check, Copy, Eye, EyeOff, HandHelping, Heart, ImagePlus, ShoppingCart, Lock, Pencil, Plus, Redo2, Save, Search, Star, Swords, Trash2, Undo2, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Field } from '../components/Field';
import { ItemPicker } from '../components/ItemPicker';
import { EQUIP_ICON, InvSlot, KitStage, SLOT_DRAG, VehicleArt } from '../components/Kit';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Tabs } from '../components/Page';
import { WeaponArt, type GunArt } from '../components/WeaponArt';
import { GunBench, GunStill, PartThumb, StatBars } from '../components/Gun3D';
import type { GunSpec } from '../components/gun3d';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { gunClassOf, useCatalog, useOwned, type Catalog } from '../lib/catalog';
import { db } from '../lib/firebase';
import { ago } from '../lib/format';
import { shrinkImage } from '../lib/image';
import { attachmentsFor, GUN_CLASSES, itemTitle, kindOf, SLOTS, slotLabel, slotsFor, type ItemType } from '../lib/items';
import { BAG_SLOTS, blankKit, createKit, equipKit, fromLoadout, HOTBAR, kitNeeds, PLATE, removeKit, saveKit, useMyKits, type GearKit, type KitData, type KitSlot } from '../lib/kits';
import { BUILD_ROLES, BUILD_STATS, BUILD_TAGS, featureBuild, keepBuild, likeBuild, markBuildPublic, removeBuild, saveBuild, type Build, type BuildStats, type CharLoadout, type StatKey } from '../lib/loadouts';
import { money, type BmSettings, type Wish } from '../lib/money';
import { WishlistButton } from '../components/WishlistButton';
import { useLists } from '../lib/adminData';
import { addToShopping, askGang, useShopping, type ShopItem } from '../lib/shopping';
import { VEHICLE_CLASSES } from '../lib/vehicles';
import { toCount } from '../noel/data';

const count = (m?: Record<string, boolean>) => Object.values(m ?? {}).filter(Boolean).length;
/** The gun whose attachments a carried gun takes (a member's named copy uses its base gun's). */
const partsGun = (id: string, byId: Map<string, ItemType>) => byId.get(id)?.baseId ?? id;

/** Family builds plus my own private ones. */
function useBuilds(me: string) {
  const { can } = useHub();
  const lead = can('manageOps');
  // Older builds have no family/private flag yet; leadership's page marks them family so everyone sees them.
  const allQ = useMemo(() => collection(db, 'builds'), []);
  const all_ = useCollection<Build>(allQ, lead);
  useEffect(() => {
    all_?.filter((b) => b.public === undefined).forEach((b) => void markBuildPublic(b.id).catch(() => {}));
  }, [all_]);
  const pubQ = useMemo(() => query(collection(db, 'builds'), where('public', '==', true)), []);
  const mineQ = useMemo(() => query(collection(db, 'builds'), where('by', '==', me)), [me]);
  const pub = useCollection<Build>(pubQ);
  const mine = useCollection<Build>(mineQ);
  // Builds from before the family/private choice are family builds.
  useEffect(() => {
    mine?.filter((b) => b.public === undefined).forEach((b) => void markBuildPublic(b.id));
  }, [mine]);
  return useMemo(() => {
    if (!pub || !mine) return null;
    const all = new Map<string, Build>();
    [...pub, ...mine].forEach((b) => all.set(b.id, b));
    return [...all.values()];
  }, [pub, mine]);
}

const useGunArt = (weaponId: string) => useDoc<GunArt & { id: string }>(`gunArt/${weaponId || '_'}`, !!weaponId);

// ---------- gunsmith ----------

/** What the 3D bench needs: the gun, its class and the names of the fitted parts. */
export function specOf(cat: Catalog, weaponId: string, parts: Record<string, string>): GunSpec {
  const w = cat.byId.get(weaponId);
  const base = w?.baseId ? cat.byId.get(w.baseId) : w;
  return {
    weaponId: base?.id ?? weaponId,
    name: base?.name ?? w?.name ?? '',
    cls: gunClassOf(w, cat.byId),
    parts: Object.fromEntries(Object.entries(parts).filter(([, v]) => v).map(([k, v]) => [k, cat.byId.get(v)?.name ?? v])),
  };
}

function usePhone() {
  const q = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setPhone(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return phone;
}

type Parts = Record<string, string>;

/** Every gun, by class, with a tick on the ones I own. */
function WeaponList({ cat, owned, value, onPick, className = '' }: { cat: Catalog; owned: Map<string, number>; value: string; onPick: (id: string) => void; className?: string }) {
  const [q, setQ] = useState('');
  const list = cat.weapons.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={`hud flex flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-line-soft px-3">
        <Search className="size-4 text-smoke" />
        <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Find a weapon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="overflow-y-auto">
        {GUN_CLASSES.map((c) => {
          const ws = list.filter((x) => x.gunClass === c.id);
          return ws.length ? (
            <div key={c.id}>
              <p className="label sticky top-0 bg-coal px-3 py-1">{c.label}</p>
              {ws.map((x) => (
                <button
                  key={x.id}
                  onClick={() => onPick(x.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm md:py-1.5 ${x.id === value ? 'bg-gold-400/15 text-gold-100' : 'text-ash hover:bg-raised'}`}
                >
                  <span>{x.name}</span>
                  {owned.get(x.id) ? <Check className="size-3.5 text-ok" /> : <span className="text-[10px] text-smoke">{x.base ? 'BM' : ''}</span>}
                </button>
              ))}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

function Gunsmith({ cat, initial, asCopy, onSaved, onEquip }: { cat: Catalog; initial?: Build | null; asCopy?: boolean; onSaved: () => void; onEquip: (b: Pick<Build, 'weaponId' | 'parts' | 'name'>) => void }) {
  const { me, can } = useHub();
  const owned = useOwned();
  const phone = usePhone();
  const bm = useDoc<BmSettings & { id: string }>('settings/blackmarket');
  const prices = bm?.prices ?? {};
  const [weaponId, setWeaponId] = useState(initial?.weaponId ?? cat.weapons[0]?.id ?? '');
  // Undo / redo: every change to the parts is a step.
  const [hist, setHist] = useState<{ past: Parts[]; now: Parts; next: Parts[] }>({ past: [], now: initial?.parts ?? {}, next: [] });
  const parts = hist.now;
  const setParts = (now: Parts) => setHist((h) => ({ past: [...h.past.slice(-49), h.now], now, next: [] }));
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1]!, next: [h.now, ...h.next] } : h));
  const redo = () => setHist((h) => (h.next.length ? { past: [...h.past, h.now], now: h.next[0]!, next: h.next.slice(1) } : h));
  const [active, setActive] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pq, setPq] = useState('');
  const [saving, setSaving] = useState<null | 'save' | 'copy'>(null);
  const [artEdit, setArtEdit] = useState(false);
  const [view, setView] = useState<'3d' | 'picture'>('3d');
  const art = useGunArt(weaponId);
  const mine = !!initial && initial.by === me.id && !asCopy;
  useEffect(() => {
    if (initial) {
      setWeaponId(initial.weaponId);
      setHist({ past: [], now: initial.parts, next: [] });
    }
  }, [initial]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') (e.preventDefault(), e.shiftKey ? redo() : undo());
      else if (e.key.toLowerCase() === 'y') (e.preventDefault(), redo());
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const w = cat.byId.get(weaponId);
  const slots = slotsFor(weaponId, cat.types);
  const opts = (slot: string) =>
    attachmentsFor(weaponId, cat.types)
      .filter((a) => a.slot === slot)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const filled = new Set(Object.entries(parts).filter(([, v]) => v).map(([k]) => k));
  const have = Object.values(parts).filter((p) => p && owned.get(p)).length;
  const cur = active ?? slots[0]?.id ?? null;
  const labels = Object.fromEntries(slots.map((s) => [s.id, parts[s.id] ? `${s.label}: ${cat.byId.get(parts[s.id]!)?.name}` : s.label]));
  const spec = specOf(cat, weaponId, parts);
  // What I'd still need, and what the BlackMarket asks for the ones it prices.
  const missing = [weaponId, ...Object.values(parts)].filter((id) => id && !owned.get(id));
  const cost = missing.reduce((t, id) => t + (prices[id] ?? 0), 0);
  const unpriced = missing.filter((id) => !prices[id]).length;
  const pick = (slot: string) => {
    if (!slots.some((s) => s.id === slot)) return;
    setActive(slot);
    setPq('');
    if (phone) setSheet(true);
  };
  const pickWeapon = (id: string) => {
    setWeaponId(id);
    setHist({ past: [], now: {}, next: [] });
    setActive(null);
    setPicking(false);
  };

  const shown = cur ? opts(cur).filter((o) => !pq || o.name.toLowerCase().includes(pq.toLowerCase())) : [];
  const partsPanel = cur && (
    <div className="parts-panel">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <p className="label min-w-0 flex-1 truncate">
          {slotLabel(cur)} · {opts(cur).length} parts
        </p>
        {parts[cur] && (
          <button className="text-[11px] text-smoke hover:text-gold-200" onClick={() => setParts({ ...parts, [cur]: '' })}>
            Take it off
          </button>
        )}
        {phone && (
          <button className="btn-ghost btn-sm px-2" onClick={() => setSheet(false)} aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>
      {opts(cur).length > 9 && (
        <div className="flex items-center gap-2 border-b border-line-soft px-3">
          <Search className="size-3.5 text-smoke" />
          <input className="w-full bg-transparent py-1.5 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder={`Find a ${slotLabel(cur).toLowerCase()}`} value={pq} onChange={(e) => setPq(e.target.value)} />
        </div>
      )}
      <div className="part-grid">
        {shown.map((o) => {
          const on = parts[cur] === o.id;
          return (
            <button key={o.id} type="button" className={`part-tile ${on ? 'on' : ''}`} onClick={() => setParts({ ...parts, [cur]: on ? '' : o.id })} title={o.name}>
              <PartThumb spec={specOf(cat, weaponId, { [cur]: o.id })} slot={cur} />
              <span className="part-name">{o.name.replace(new RegExp(`^${(w?.name ?? '').split(' ')[0]}\\s+`, 'i'), '')}</span>
              <span className="part-meta">
                {owned.get(o.id) ? <span className="text-ok">have {owned.get(o.id)}</span> : prices[o.id] ? <span className="text-gold-300">{money(prices[o.id]!)}</span> : <span className="text-smoke">—</span>}
                {on && <Check className="size-3.5 text-gold-300" />}
              </span>
            </button>
          );
        })}
        {!shown.length && <p className="col-span-full p-4 text-center text-xs text-smoke">No parts match.</p>}
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {!phone && <WeaponList cat={cat} owned={owned} value={weaponId} onPick={pickWeapon} className="max-h-[80dvh]" />}

      <div className="min-w-0 space-y-4">
        <section className="bench">
          <div className="bench-head">
            <div className="min-w-0">
              <p className="label text-gold-500">
                {GUN_CLASSES.find((c) => c.id === w?.gunClass)?.label.replace(/s$/, '')} · {w?.base ? 'Base gun · Black Market parts' : 'Custom'}
                {initial && <> · {asCopy ? `copy of “${initial.name}”` : `editing “${initial.name}”`}</>}
              </p>
              <h2 className="foil truncate font-display text-2xl font-bold sm:text-3xl">{w?.name ?? 'Pick a weapon'}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {phone && (
                <button className="btn-ghost btn-sm" onClick={() => setPicking(true)}>
                  <Swords className="size-3.5" /> Gun
                </button>
              )}
              <button className="btn-ghost btn-sm px-2" onClick={undo} disabled={!hist.past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
                <Undo2 className="size-4" />
              </button>
              <button className="btn-ghost btn-sm px-2" onClick={redo} disabled={!hist.next.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <Redo2 className="size-4" />
              </button>
            </div>
          </div>
          <div className="bench-stage">
            {view === 'picture' && art ? (
              <div className="flex h-full items-center px-4">
                <WeaponArt cls={w?.gunClass} slots={slots.map((s) => s.id)} filled={filled} active={cur} art={art} onSlot={pick} labels={labels} />
              </div>
            ) : (
              <GunBench spec={spec} active={cur} onSlot={pick} fallback={<div className="flex h-full items-center px-4"><WeaponArt cls={w?.gunClass} slots={slots.map((s) => s.id)} filled={filled} active={cur} art={art} onSlot={pick} labels={labels} /></div>} />
            )}
            <span className="bench-lamp" aria-hidden />
            <p className="bench-hint">{view === 'picture' && art ? 'Tap a light to fit that slot' : 'Drag to turn it · tap a part to fit that slot'}</p>
            <span className="absolute top-2 right-2 flex gap-1">
              {art && (
                <button className="btn-ghost btn-sm bg-void/60" onClick={() => setView(view === '3d' ? 'picture' : '3d')}>
                  {view === '3d' ? 'Picture' : '3D'}
                </button>
              )}
              {can('manageOps') && (
                <button className="btn-ghost btn-sm bg-void/60" onClick={() => setArtEdit(true)} title="Gun picture">
                  <ImagePlus className="size-3.5" />
                </button>
              )}
            </span>
          </div>
          {/* Every slot, at a glance */}
          <div className="bench-slots">
            {slots.map((s) => {
              const p = parts[s.id] ? cat.byId.get(parts[s.id]!) : undefined;
              return (
                <button key={s.id} onClick={() => pick(s.id)} className={`slot-chip ${cur === s.id ? 'on' : ''} ${p ? 'filled' : ''}`}>
                  <i />
                  <span className="min-w-0">
                    <b>{s.label}</b>
                    <span className={`block truncate ${p ? (owned.get(p.id) ? 'text-ok' : 'text-gold-100') : 'text-smoke'}`}>{p?.name ?? 'Stock'}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="bench-foot">
            <span>
              {filled.size}/{slots.length} slots · you own {have}/{filled.size} parts{owned.get(weaponId) ? ' + the gun' : ''}
            </span>
            {missing.length > 0 ? (
              <span className="text-gold-200">
                Still to get: {missing.length} · {cost ? `${money(cost)} at the BlackMarket` : 'no BlackMarket prices yet'}
                {cost && unpriced ? ` + ${unpriced} unpriced` : ''}
              </span>
            ) : (
              <span className="text-ok">You own all of it</span>
            )}
          </div>
        </section>

        {!phone && partsPanel}

        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!w} onClick={() => setSaving('save')}>
            <Save className="size-4" /> {mine ? 'Save build' : 'Save as a build'}
          </button>
          {mine && (
            <button className="btn-ghost" onClick={() => setSaving('copy')}>
              <Copy className="size-4" /> Save as a copy
            </button>
          )}
          <button className="btn-ghost" disabled={!w} onClick={() => onEquip({ weaponId, parts: Object.fromEntries(Object.entries(parts).filter(([, v]) => v)), name: w?.name ?? '' })}>
            <ArrowRightLeft className="size-4" /> Put in a kit
          </button>
          <button className="btn-ghost" onClick={() => setParts({})} disabled={!filled.size}>
            <X className="size-4" /> Strip it
          </button>
          <WishlistButton label="Wishlist what I'm missing" className="btn-ghost" items={missing.map((id) => ({ item: id, qty: 1, from: w?.name }))} />
        </div>
      </div>

      {phone && sheet && partsPanel && (
        <>
          <div className="parts-sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="parts-sheet">{partsPanel}</div>
        </>
      )}
      {picking && (
        <Modal title="Pick a gun" onClose={() => setPicking(false)}>
          <WeaponList cat={cat} owned={owned} value={weaponId} onPick={pickWeapon} className="max-h-[70dvh]" />
        </Modal>
      )}
      {saving && (
        <SaveBuild
          initial={initial ?? null}
          copy={saving === 'copy' || !!asCopy}
          defaultName={initial ? (saving === 'copy' || asCopy ? `${initial.name} (copy)` : initial.name) : ''}
          onClose={() => setSaving(null)}
          onSave={async (b) => {
            const clean = Object.fromEntries(Object.entries(parts).filter(([, v]) => v));
            await saveBuild(me, { ...b, weaponId, parts: clean }, mine && saving === 'save' ? initial!.id : undefined);
            setSaving(null);
            onSaved();
          }}
        />
      )}
      {artEdit && w && <GunArtEditor weapon={w} slots={slots.map((s) => s.id)} art={art ?? null} onClose={() => setArtEdit(false)} />}
    </div>
  );
}

type BuildInfo = Pick<Build, 'name' | 'notes' | 'tags' | 'public' | 'stats' | 'role' | 'ttk' | 'pros' | 'cons'>;
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 5);

/** Name it, tag it, and (if they like) say how it handles: stat bars, role, time to kill, pros and cons. */
function SaveBuild({ initial, copy, defaultName, onSave, onClose }: { initial: Build | null; copy: boolean; defaultName: string; onSave: (b: BuildInfo) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [pub, setPub] = useState(initial?.public ?? true);
  const [stats, setStats] = useState<BuildStats>(initial?.stats ?? {});
  const [role, setRole] = useState(initial?.role ?? '');
  const [ttk, setTtk] = useState(initial?.ttk ?? '');
  const [pros, setPros] = useState((initial?.pros ?? []).join('\n'));
  const [cons, setCons] = useState((initial?.cons ?? []).join('\n'));
  const [more, setMore] = useState(!!(initial?.stats && Object.keys(initial.stats).length) || !!initial?.role);
  return (
    <Modal title={initial && !copy ? 'Save build' : 'New build'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim())
            await onSave({
              name: name.trim().slice(0, 40),
              notes: notes.trim().slice(0, 500),
              tags,
              public: pub,
              stats: Object.fromEntries(Object.entries(stats).filter(([, v]) => v)) as BuildStats,
              role,
              ttk: ttk.trim().slice(0, 80),
              pros: lines(pros),
              cons: lines(cons),
            });
        }}
      >
        <Field label="Build name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Blacksite rifleman" autoFocus />
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1">
            {BUILD_TAGS.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : tags.length < 6 ? [...tags, t] : tags)}
                className={`chip px-2.5 py-1 text-xs ${tags.includes(t) ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <button type="button" className="flex w-full items-center justify-between rounded border border-line-soft px-3 py-2 text-left text-sm text-gold-100 hover:bg-raised" onClick={() => setMore(!more)}>
          <span>
            How it handles <span className="text-xs text-smoke">· optional: stats, role, time to kill, pros &amp; cons</span>
          </span>
          <span className="text-smoke">{more ? '−' : '+'}</span>
        </button>
        {more && (
          <div className="space-y-4 rounded border border-line-soft bg-coal/60 p-3">
            <div className="space-y-2">
              {BUILD_STATS.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-ash">{s.label}</span>
                  <div className="stat-picker" role="radiogroup" aria-label={s.label}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                      <button
                        type="button"
                        key={v}
                        aria-label={`${s.label} ${v}`}
                        className={(stats[s.id] ?? 0) >= v ? 'on' : ''}
                        onClick={() => setStats({ ...stats, [s.id]: stats[s.id] === v ? 0 : v })}
                      />
                    ))}
                  </div>
                  <b className="w-5 text-right font-mono text-xs text-gold-100">{stats[s.id] || '–'}</b>
                </div>
              ))}
              <p className="text-[11px] text-smoke">Tap a bar to set it, tap the same one again to clear. Control means how easy the recoil is.</p>
            </div>
            <Field label="Role">
              <div className="flex flex-wrap gap-1">
                {BUILD_ROLES.map((r) => (
                  <button type="button" key={r} onClick={() => setRole(role === r ? '' : r)} className={`chip px-2.5 py-1 text-xs ${role === r ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Time to kill" hint="e.g. 4 body shots, 2 to the head">
              <input className="input" value={ttk} onChange={(e) => setTtk(e.target.value)} maxLength={80} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pros" hint="One per line, up to 5">
                <textarea className="input min-h-20" value={pros} onChange={(e) => setPros(e.target.value)} />
              </Field>
              <Field label="Cons" hint="One per line, up to 5">
                <textarea className="input min-h-20" value={cons} onChange={(e) => setCons(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        <Field label="Notes" hint="What it's for, why these parts">
          <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <Field label="Who sees it">
          <div className="flex gap-1">
            {[
              [true, 'The family', Eye],
              [false, 'Just me', EyeOff],
            ].map(([v, l, I]) => {
              const Icon = I as typeof Eye;
              return (
                <button type="button" key={String(v)} onClick={() => setPub(v as boolean)} className={`chip flex items-center gap-1.5 px-3 py-1.5 text-xs ${pub === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  <Icon className="size-3.5" /> {l as string}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Admins: put a real picture on a gun and drag each slot light onto it. */
function GunArtEditor({ weapon, slots, art, onClose }: { weapon: ItemType; slots: string[]; art: GunArt | null; onClose: () => void }) {
  const [image, setImage] = useState(art?.image ?? '');
  const [anchors, setAnchors] = useState<Record<string, [number, number]>>(art?.anchors ?? {});
  const [slot, setSlot] = useState(slots[0] ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal title={`Picture · ${weapon.name}`} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-sm text-ash">Upload a side-on picture (transparent PNG looks best), then pick a slot and tap where it sits on the gun.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setImage(await shrinkImage(f, 900, 0.8));
          }}
        />
        <div className="flex flex-wrap gap-1">
          {slots.map((s) => (
            <button key={s} onClick={() => setSlot(s)} className={`chip px-2.5 py-1 text-xs ${slot === s ? 'bg-gold-400 text-void' : anchors[s] ? 'bg-gold-400/20 text-gold-100' : 'bg-raised text-ash'}`}>
              {slotLabel(s)}
            </button>
          ))}
        </div>
        <div
          className="relative cursor-crosshair border border-line-soft bg-coal"
          onClick={(e) => {
            if (!image || !slot) return;
            const r = e.currentTarget.getBoundingClientRect();
            setAnchors({ ...anchors, [slot]: [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10] });
            const next = slots[slots.indexOf(slot) + 1];
            if (next) setSlot(next);
          }}
        >
          <WeaponArt cls={weapon.gunClass} slots={slots} filled={new Set(Object.keys(anchors))} active={slot} art={image ? { image, anchors } : null} />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" /> {image ? 'Change picture' : 'Upload picture'}
            </button>
            {art && (
              <button className="btn-ghost text-red-300" onClick={async () => (await deleteDoc(doc(db, 'gunArt', weapon.id)), onClose())}>
                <Trash2 className="size-4" /> Back to the outline
              </button>
            )}
          </span>
          <button
            className="btn-gold"
            disabled={!image || busy}
            onClick={async () => {
              setBusy(true);
              await setDoc(doc(db, 'gunArt', weapon.id), { image, anchors });
              onClose();
            }}
          >
            <Save className="size-4" /> Save picture
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- builds ----------

function BuildActions({ b, onOpen, onCopy, onEquip, owned }: { b: Build; owned: Map<string, number>; onOpen: () => void; onCopy: () => void; onEquip: () => void }) {
  const { me, can } = useHub();
  const parts = Object.values(b.parts);
  return (
    <div className="flex flex-wrap gap-1">
      <button className="btn-ghost btn-sm" onClick={onEquip}>
        <ArrowRightLeft className="size-3.5" /> Put in a kit
      </button>
      <button className="btn-ghost btn-sm" onClick={onCopy}>
        <Copy className="size-3.5" /> Copy & tweak
      </button>
      <WishlistButton label="Wishlist" items={[b.weaponId, ...parts].filter((id) => id && !owned.get(id)).map((id) => ({ item: id, qty: 1, from: b.name }))} />
      {can('manageOps') && b.public !== false && (
        <button className={`btn-ghost btn-sm ${b.featured ? 'text-gold-200' : ''}`} onClick={() => featureBuild(b.id, !b.featured)} title={b.featured ? 'Take it off the Family issue shelf' : 'Make it a Family issue build'}>
          <Star className={`size-3.5 ${b.featured ? 'fill-current' : ''}`} /> {b.featured ? 'Unfeature' : 'Feature'}
        </button>
      )}
      {b.by === me.id && (
        <>
          <button className="btn-ghost btn-sm" onClick={onOpen}>
            <Wrench className="size-3.5" /> Edit
          </button>
          <button className="btn-ghost btn-sm px-2" onClick={() => confirm(`Delete “${b.name}”?`) && removeBuild(b.id)} aria-label="Delete">
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function LikeSave({ b }: { b: Build }) {
  const { me } = useHub();
  const liked = !!b.likes?.[me.id];
  const kept = !!b.saves?.[me.id];
  return (
    <span className="flex items-center gap-2">
      <button onClick={() => keepBuild(b.id, me.id, !kept)} className={kept ? 'text-gold-300' : 'text-smoke hover:text-gold-200'} aria-label={kept ? 'Saved' : 'Save'} title={kept ? 'In your saved builds' : 'Save to your list'}>
        <Bookmark className={`size-4 ${kept ? 'fill-current' : ''}`} />
      </button>
      <button onClick={() => likeBuild(b.id, me.id, !liked)} className={`flex items-center gap-1 text-sm ${liked ? 'text-danger' : 'text-smoke hover:text-gold-200'}`} aria-label="Like">
        <Heart className={`size-4 ${liked ? 'fill-current' : ''}`} /> {count(b.likes)}
      </button>
    </span>
  );
}

function ProsCons({ b }: { b: Build }) {
  if (!b.pros?.length && !b.cons?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <ul className="space-y-0.5">
        {(b.pros ?? []).map((p) => (
          <li key={p} className="text-ok">
            + <span className="text-ash">{p}</span>
          </li>
        ))}
      </ul>
      <ul className="space-y-0.5">
        {(b.cons ?? []).map((p) => (
          <li key={p} className="text-red-300">
            − <span className="text-ash">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuildCard({ b, cat, owned, onOpen, onCopy, onEquip, picked, onPick }: { b: Build; cat: Catalog; owned: Map<string, number>; onOpen: () => void; onCopy: () => void; onEquip: () => void; picked: boolean; onPick: () => void }) {
  const w = cat.byId.get(b.weaponId);
  const parts = Object.entries(b.parts);
  const have = parts.filter(([, v]) => owned.get(v)).length;
  return (
    <div className={`build-card ${b.featured ? 'featured' : ''} ${picked ? 'picked' : ''}`}>
      <div className="build-shot">
        <GunStill spec={specOf(cat, b.weaponId, b.parts)} />
        {b.role && <span className="role-chip">{b.role}</span>}
        {b.featured && (
          <span className="issue-chip">
            <Star className="size-3 fill-current" /> Family issue
          </span>
        )}
        <label className="compare-tick" title="Compare">
          <input type="checkbox" checked={picked} onChange={onPick} /> Compare
        </label>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-hud text-lg leading-tight font-bold text-gold-100">{b.name}</p>
            <p className="text-xs text-smoke">
              {b.public === false && <Lock className="mr-1 inline size-3" />}
              {w?.name ?? 'Unknown weapon'} · by <MemberName id={b.by} className="text-xs" /> · {ago(b.at)}
            </p>
          </div>
          <LikeSave b={b} />
        </div>
        <StatBars stats={b.stats} compact />
        {b.ttk && <p className="text-xs text-gold-200">⏱ {b.ttk}</p>}
        <ProsCons b={b} />
        {(b.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {b.tags!.map((t) => (
              <span key={t} className="chip bg-gold-400/10 px-2 py-0.5 text-[10px] text-gold-200">
                {t}
              </span>
            ))}
          </div>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer text-smoke hover:text-gold-200">
            {parts.length} parts · you own {have}/{parts.length}
            {owned.get(b.weaponId) ? ' and the gun' : ''}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {parts.map(([slot, id]) => (
              <li key={slot} className="flex gap-2">
                <span className="w-20 shrink-0 text-smoke">{slotLabel(slot)}</span>
                <span className={`truncate ${owned.get(id) ? 'text-ok' : 'text-gold-100'}`}>{cat.byId.get(id)?.name ?? '—'}</span>
              </li>
            ))}
          </ul>
        </details>
        {b.notes && <p className="text-xs text-ash italic">“{b.notes}”</p>}
        <div className="mt-auto">
          <BuildActions b={b} owned={owned} onOpen={onOpen} onCopy={onCopy} onEquip={onEquip} />
        </div>
      </div>
    </div>
  );
}

/** Leadership's pinned builds: a wide, gold-trimmed card with the gun turning on the bench. */
function FamilyIssue({ list, cat, owned, onOpen, onCopy, onEquip }: { list: Build[]; cat: Catalog; owned: Map<string, number>; onOpen: (b: Build) => void; onCopy: (b: Build) => void; onEquip: (b: Build) => void }) {
  const [i, setI] = useState(0);
  const b = list[Math.min(i, list.length - 1)]!;
  const w = cat.byId.get(b.weaponId);
  return (
    <section className="family-issue mb-5">
      <div className="family-issue-stage">
        <GunBench key={b.id} spec={specOf(cat, b.weaponId, b.parts)} active={null} onSlot={() => {}} fallback={<GunStill spec={specOf(cat, b.weaponId, b.parts)} />} />
        <span className="issue-chip">
          <Star className="size-3 fill-current" /> Family issue
        </span>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="label text-gold-500">
              {w?.name ?? 'Unknown weapon'}
              {b.role ? ` · ${b.role}` : ''}
            </p>
            <h3 className="foil font-display text-2xl font-bold">{b.name}</h3>
            <p className="text-xs text-smoke">
              by <MemberName id={b.by} className="text-xs" /> · {ago(b.at)}
            </p>
          </div>
          <LikeSave b={b} />
        </div>
        <StatBars stats={b.stats} />
        {b.ttk && <p className="text-sm text-gold-200">⏱ {b.ttk}</p>}
        <ProsCons b={b} />
        {b.notes && <p className="text-sm text-ash italic">“{b.notes}”</p>}
        <div className="mt-auto">
          <BuildActions b={b} owned={owned} onOpen={() => onOpen(b)} onCopy={() => onCopy(b)} onEquip={() => onEquip(b)} />
        </div>
        {list.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {list.map((x, n) => (
              <button key={x.id} onClick={() => setI(n)} className={`chip px-2.5 py-1 text-[11px] ${n === i ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {x.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Two or three builds side by side: stats (best in gold), role, time to kill, and every part. */
function Compare({ list, cat, owned, onClose }: { list: Build[]; cat: Catalog; owned: Map<string, number>; onClose: () => void }) {
  const best = Object.fromEntries(BUILD_STATS.map((s) => [s.id, Math.max(0, ...list.map((b) => b.stats?.[s.id] ?? 0))]).filter(([, v]) => (v as number) > 0)) as BuildStats;
  const slots = SLOTS.filter((s) => list.some((b) => b.parts[s.id]));
  return (
    <Modal title="Compare builds" onClose={onClose} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((b) => (
          <div key={b.id} className="min-w-0 space-y-2">
            <GunStill spec={specOf(cat, b.weaponId, b.parts)} className="rounded" />
            <p className="truncate font-hud font-bold text-gold-100">{b.name}</p>
            <p className="truncate text-xs text-smoke">
              {cat.byId.get(b.weaponId)?.name}
              {b.role ? ` · ${b.role}` : ''}
            </p>
            {b.stats && Object.keys(b.stats).length ? <StatBars stats={b.stats} best={best} /> : <p className="text-xs text-smoke">No stats given.</p>}
            {b.ttk && <p className="text-xs text-gold-200">⏱ {b.ttk}</p>}
            <ProsCons b={b} />
          </div>
        ))}
      </div>
      <table className="mt-4 w-full table-fixed text-xs">
        <tbody>
          {slots.map((s) => (
            <tr key={s.id} className="border-t border-line-soft">
              <td className="w-24 py-1.5 pr-2 align-top text-smoke">{s.label}</td>
              {list.map((b) => {
                const id = b.parts[s.id];
                return (
                  <td key={b.id} className={`truncate py-1.5 pr-2 align-top ${id ? (owned.get(id) ? 'text-ok' : 'text-gold-100') : 'text-smoke'}`}>
                    {id ? (cat.byId.get(id)?.name ?? '—') : 'Stock'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

type BuildSort = 'likes' | 'new' | 'member' | `stat:${StatKey}`;

function Builds({ cat, builds, onOpen, onCopy, onEquip }: { cat: Catalog; builds: Build[] | null; onOpen: (b: Build) => void; onCopy: (b: Build) => void; onEquip: (b: Build) => void }) {
  const { me } = useHub();
  const owned = useOwned();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [weapon, setWeapon] = useState('');
  const [tag, setTag] = useState('');
  const [role, setRole] = useState('');
  const [show, setShow] = useState<'all' | 'saved' | 'mine'>('all');
  const [sort, setSort] = useState<BuildSort>('likes');
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  if (!builds) return null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = (b: Build) => [b.name, b.byName, b.role, cat.byId.get(b.weaponId)?.name, ...Object.values(b.parts).map((id) => cat.byId.get(id)?.name), ...(b.tags ?? [])].join(' ').toLowerCase();
  const statOf = (b: Build, k: StatKey) => b.stats?.[k] ?? 0;
  const list = builds
    .filter((b) => !words.length || words.every((wd) => haystack(b).includes(wd)))
    .filter((b) => !cls || cat.byId.get(b.weaponId)?.gunClass === cls)
    .filter((b) => !weapon || b.weaponId === weapon)
    .filter((b) => !tag || b.tags?.includes(tag))
    .filter((b) => !role || b.role === role)
    .filter((b) => show === 'all' || (show === 'saved' ? b.saves?.[me.id] : b.by === me.id))
    .filter((b) => !sort.startsWith('stat:') || statOf(b, sort.slice(5) as StatKey) > 0)
    .sort((a, b) =>
      sort.startsWith('stat:')
        ? statOf(b, sort.slice(5) as StatKey) - statOf(a, sort.slice(5) as StatKey) || count(b.likes) - count(a.likes)
        : sort === 'likes'
          ? count(b.likes) - count(a.likes)
          : sort === 'new'
            ? (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0)
            : a.byName.localeCompare(b.byName) || count(b.likes) - count(a.likes),
    );
  const featured = builds.filter((b) => b.featured && b.public !== false).sort((a, b) => count(b.likes) - count(a.likes));
  const used = cat.weapons.filter((w) => builds.some((b) => b.weaponId === w.id) && (!cls || w.gunClass === cls));
  const pick = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked);
  const filtering = !!(q || cls || weapon || tag || role || show !== 'all');
  return (
    <>
      {featured.length > 0 && !filtering && <FamilyIssue list={featured} cat={cat} owned={owned} onOpen={onOpen} onCopy={onCopy} onEquip={onEquip} />}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded border border-line-soft bg-coal px-3">
          <Search className="size-4 text-smoke" />
          <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Search builds, guns, parts, members" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(
            [
              ['all', 'All'],
              ['saved', 'Saved'],
              ['mine', 'Mine'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setShow(v)} className={`chip px-3 py-1.5 text-xs ${show === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={cls} onChange={(e) => (setCls(e.target.value), setWeapon(''))}>
          <option value="">Every class</option>
          {GUN_CLASSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={weapon} onChange={(e) => setWeapon(e.target.value)}>
          <option value="">Every gun</option>
          {used.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Every role</option>
          {BUILD_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as BuildSort)}>
          <option value="likes">Most liked</option>
          <option value="new">Newest</option>
          <option value="member">By member</option>
          <optgroup label="Highest stat">
            {BUILD_STATS.map((s) => (
              <option key={s.id} value={`stat:${s.id}`}>
                Most {s.label.toLowerCase()}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        {BUILD_TAGS.map((t) => (
          <button key={t} onClick={() => setTag(tag === t ? '' : t)} className={`chip px-2.5 py-1 text-[11px] ${tag === t ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
            {t}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b) => (
            <BuildCard key={b.id} b={b} cat={cat} owned={owned} onOpen={() => onOpen(b)} onCopy={() => onCopy(b)} onEquip={() => onEquip(b)} picked={picked.includes(b.id)} onPick={() => pick(b.id)} />
          ))}
        </div>
      ) : (
        <Empty icon={<Wrench className="size-6" />} title={builds.length ? 'Nothing matches' : 'No builds yet'}>
          {builds.length ? 'Try another search or filter.' : 'Make one in the Gunsmith and save it.'}
        </Empty>
      )}
      {picked.length > 0 && (
        <div className="compare-bar">
          <span className="text-sm text-ash">
            {picked.length} picked <span className="text-smoke">(up to 3)</span>
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setPicked([])}>
            Clear
          </button>
          <button className="btn-gold btn-sm" disabled={picked.length < 2} onClick={() => setComparing(true)}>
            Compare
          </button>
        </div>
      )}
      {comparing && <Compare list={picked.map((id) => builds.find((b) => b.id === id)).filter((b): b is Build => !!b)} cat={cat} owned={owned} onClose={() => setComparing(false)} />}
    </>
  );
}

/** Put a gun build into one of my kits, on the hotbar or in the bag. */
function PutInKit({ build, cat, onClose, onDone }: { build: Pick<Build, 'weaponId' | 'parts' | 'name'>; cat: Catalog; onClose: () => void; onDone: (kitId: string) => void }) {
  const { me } = useHub();
  const { kits, equipped } = useMyKits(me.id);
  const [kitId, setKitId] = useState<string>('');
  const [where_, setWhere] = useState<number>(0);
  useEffect(() => {
    if (kits && !kitId) setKitId(equipped && kits.some((k) => k.id === equipped) ? equipped : (kits[0]?.id ?? 'new'));
  }, [kits, kitId, equipped]);
  const kit = kits?.find((k) => k.id === kitId);
  const w = cat.byId.get(build.weaponId);
  async function put() {
    const slot: KitSlot = { item: build.weaponId, qty: 1, parts: build.parts };
    const base: KitData = kit ? { ...kit } : blankKit('Everyday');
    const hotbar = [...base.hotbar];
    const bag = [...base.bag];
    if (where_ < HOTBAR) {
      const old = hotbar[where_];
      hotbar[where_] = slot;
      if (old) {
        const gap = bag.findIndex((s) => !s);
        if (gap >= 0) bag[gap] = old;
        else bag.push(old);
      }
    } else {
      const gap = bag.findIndex((s) => !s);
      if (gap >= 0) bag[gap] = slot;
      else bag.push(slot);
    }
    const next = { ...base, hotbar, bag };
    let id = kit?.id;
    if (kit) await saveKit(kit.id, next);
    else {
      id = await createKit(me.id, next);
      if (!equipped) await equipKit(me.id, id);
    }
    onDone(id!);
  }
  return (
    <Modal title={`Put ${build.name || w?.name} in a kit`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Kit">
          <div className="flex flex-wrap gap-1">
            {(kits ?? []).map((k) => (
              <button key={k.id} onClick={() => setKitId(k.id)} className={`chip flex items-center gap-1 px-3 py-1.5 text-xs ${kitId === k.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {k.id === equipped && <Star className="size-3 fill-current" />}
                {k.name}
              </button>
            ))}
            {!kits?.length && <span className="chip bg-gold-400 px-3 py-1.5 text-xs text-void">New kit: Everyday</span>}
          </div>
        </Field>
        <Field label="Where" hint="The hotbar is the 5 quickslots; anything else rides in the bag.">
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: HOTBAR }, (_, i) => {
              const s = kit?.hotbar[i];
              return (
                <button key={i} onClick={() => setWhere(i)} className={`border px-1 py-2 text-center text-xs ${where_ === i ? 'border-gold-300 bg-gold-400/15 text-gold-100' : 'border-line-soft text-ash'}`}>
                  <b className="block font-hud text-gold-300">{i + 1}</b>
                  <span className="block truncate text-[10px] text-smoke">{s ? cat.byId.get(s.item)?.name : 'empty'}</span>
                </button>
              );
            })}
            <button onClick={() => setWhere(HOTBAR)} className={`border px-1 py-2 text-center text-xs ${where_ === HOTBAR ? 'border-gold-300 bg-gold-400/15 text-gold-100' : 'border-line-soft text-ash'}`}>
              <b className="block font-hud text-gold-300">Bag</b>
              <span className="block text-[10px] text-smoke">next free</span>
            </button>
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" onClick={put} disabled={!kits}>
            <Check className="size-4" /> Put it in
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- my kits ----------

type Spot = { zone: 'hot' | 'bag'; i: number };
const KIT_NAMES = ['Everyday', 'Heist', 'Blacksite', 'Run', 'Defense', 'Night out'];

function MyKits({ cat, open, onOpen }: { cat: Catalog; open: string | null; onOpen: (id: string) => void }) {
  const { me } = useHub();
  const owned = useOwned();
  const { kits, equipped, pickLoaded } = useMyKits(me.id);
  const legacy = useDoc<CharLoadout>(`loadouts/${me.id}`);
  const migrated = useRef(false);
  const [naming, setNaming] = useState<null | 'new' | 'copy'>(null);

  // First visit: the old single loadout becomes the first kit.
  useEffect(() => {
    if (!kits || !pickLoaded || legacy === undefined || migrated.current) return;
    migrated.current = true;
    if (kits.length || !legacy) return;
    const k = fromLoadout(legacy);
    if (!k.vest && !k.bagType && !k.hotbar.some(Boolean)) return;
    void createKit(me.id, k).then((id) => equipKit(me.id, id));
  }, [kits, legacy, pickLoaded, me.id]);

  const kit = kits?.find((k) => k.id === open) ?? kits?.find((k) => k.id === equipped) ?? kits?.[0];

  if (!kits) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {kits.map((k) => (
          <button key={k.id} onClick={() => onOpen(k.id)} className={`chip flex items-center gap-1.5 px-3 py-1.5 text-sm ${kit?.id === k.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-100'}`}>
            {k.id === equipped && <Star className="size-3.5 fill-current" />}
            {k.name}
            {!k.public && <Lock className="size-3 opacity-60" />}
          </button>
        ))}
        <button className="chip flex items-center gap-1 bg-raised px-3 py-1.5 text-sm text-gold-300" onClick={() => setNaming('new')}>
          <Plus className="size-3.5" /> New kit
        </button>
      </div>
      {kit ? (
        <KitEditor key={kit.id} kit={kit} cat={cat} owned={owned} equipped={kit.id === equipped} onCopy={() => setNaming('copy')} />
      ) : (
        <Empty icon={<Swords className="size-6" />} title="No kits yet">
          A kit is what you carry for a kind of day: Everyday, Heist, Blacksite… Make one, fill the 5 hotbar slots and the bag, and equip it.
        </Empty>
      )}
      {naming && (
        <NameKit
          title={naming === 'copy' ? `Copy “${kit?.name}”` : 'New kit'}
          initial={naming === 'copy' ? `${kit?.name} 2` : (KIT_NAMES.find((n) => !kits.some((k) => k.name === n)) ?? '')}
          onClose={() => setNaming(null)}
          onSave={async (name) => {
            const base: KitData = naming === 'copy' && kit ? { ...kit, name } : blankKit(name);
            const { id: _id, owner: _o, at: _a, ...data } = base as GearKit;
            const id = await createKit(me.id, { ...data, name });
            if (!equipped) await equipKit(me.id, id);
            setNaming(null);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}

function NameKit({ title, initial, onSave, onClose }: { title: string; initial: string; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), name.trim() && void onSave(name.trim()))}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1">
          {KIT_NAMES.map((n) => (
            <button type="button" key={n} onClick={() => setName(n)} className="chip bg-raised px-2.5 py-1 text-xs text-ash">
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!name.trim()}>
            Make it
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KitEditor({ kit, cat, owned, equipped, onCopy }: { kit: GearKit; cat: Catalog; owned: Map<string, number>; equipped: boolean; onCopy: () => void }) {
  const { me } = useHub();
  const [k, setK] = useState<KitData>(() => ({ ...blankKit(kit.name), ...kit }));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(true);
  const [editing, setEditing] = useState<Spot | null>(null);
  const [equip, setEquip] = useState<null | 'vest' | 'bag' | 'look' | 'car'>(null);
  const [renaming, setRenaming] = useState(false);
  const drag = useRef<Spot | null>(null);

  // Save a moment after the last change.
  useEffect(() => {
    if (!dirty) return;
    setSaved(false);
    const t = setTimeout(() => void saveKit(kit.id, k).then(() => (setSaved(true), setDirty(false))), 700);
    return () => clearTimeout(t);
  }, [k, dirty, kit.id]);

  const set = (patch: Partial<KitData>) => (setK((x) => ({ ...x, ...patch })), setDirty(true));
  const plan = k.mode === 'plan';
  const needs = kitNeeds(k);
  const short = new Set([...needs.entries()].filter(([id, n]) => (owned.get(id) ?? 0) < n).map(([id]) => id));
  const missingSlot = (s: KitSlot) => short.has(s.item) || Object.values(s.parts ?? {}).some((p) => short.has(p));
  const bag = Array.from({ length: BAG_SLOTS }, (_, i) => k.bag[i] ?? null);
  const get = (p: Spot) => (p.zone === 'hot' ? k.hotbar[p.i] : bag[p.i]) ?? null;
  const put = (p: Spot, s: KitSlot | null, hotbar = [...k.hotbar], b = [...bag]) => {
    if (p.zone === 'hot') hotbar[p.i] = s;
    else b[p.i] = s;
    return { hotbar, bag: b };
  };
  const swap = (a: Spot, b: Spot) => {
    if (a.zone === b.zone && a.i === b.i) return;
    const sa = get(a);
    const sb = get(b);
    const one = put(a, sb);
    set(put(b, sa, one.hotbar, one.bag));
  };
  const dragProps = (p: Spot) => ({
    onDragStart: (e: DragEvent<HTMLElement>) => {
      drag.current = p;
      e.dataTransfer.setData(SLOT_DRAG, '1');
      e.dataTransfer.effectAllowed = 'move';
    },
    onDrop: () => {
      if (drag.current) swap(drag.current, p);
      drag.current = null;
    },
  });
  const plates = owned.get(PLATE) ?? 0;
  const shopping = [...needs.entries()].filter(([id, n]) => (owned.get(id) ?? 0) < n).map(([id, n]) => ({ id, short: n - (owned.get(id) ?? 0) }));
  const name = (id?: string | null) => (id ? itemTitle(cat.byId.get(id), cat.byId) : null);
  const card = (key: 'vest' | 'bag' | 'look' | 'car', label: string, value: string | null, warn?: boolean) => {
    const Icon = EQUIP_ICON[key];
    return (
      <button onClick={() => setEquip(key)} className={`ox-panel flex w-full items-center gap-2.5 p-2.5 text-left transition hover:border-gold-600/60 ${warn ? 'border-red-400/60' : ''}`}>
        <span className={`grid size-9 shrink-0 place-items-center rounded ${value ? 'bg-gold-400/15 text-gold-300' : 'bg-raised text-smoke'}`}>
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="label block text-[10px]">{label}</span>
          <span className={`block truncate text-sm ${value ? 'text-gold-100' : 'text-smoke'}`}>{value ?? 'Add'}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="font-display text-2xl font-bold text-gold-100 hover:text-gold-50" onClick={() => setRenaming(true)} title="Rename">
          {k.name} <Pencil className="inline size-4 text-smoke" />
        </button>
        <span className="text-xs text-smoke">{saved ? 'Saved' : 'Saving…'}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={() => equipKit(me.id, equipped ? null : kit.id)} className={`chip flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${equipped ? 'bg-gold-400 text-void' : 'bg-raised text-ash ring-1 ring-line'}`}>
            <Star className={`size-3.5 ${equipped ? 'fill-current' : ''}`} /> {equipped ? 'Equipped' : 'Equip'}
          </button>
          <div className="flex overflow-hidden rounded-full ring-1 ring-line">
            {(
              [
                ['real', 'Real'],
                ['plan', 'Plan'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} onClick={() => set({ mode: v })} className={`px-3 py-1.5 text-xs font-bold ${k.mode === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`} title={v === 'real' ? 'Only what is in your locker' : 'Anything in the catalog; what you are missing is flagged'}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={() => set({ public: !k.public })} className={`chip flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${k.public ? 'bg-ok/20 text-ok ring-1 ring-ok/50' : 'bg-raised text-smoke ring-1 ring-line'}`}>
            {k.public ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {k.public ? 'Family can see' : 'Private'}
          </button>
          <button className="btn-ghost btn-sm" onClick={onCopy}>
            <Copy className="size-3.5" /> Copy
          </button>
          <button className="btn-ghost btn-sm px-2 text-red-300" onClick={async () => confirm(`Delete the “${k.name}” kit?`) && (await removeKit(kit.id), equipped && (await equipKit(me.id, null)))} aria-label="Delete kit">
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_1fr]">
        {/* the mannequin */}
        <div className="min-w-0 space-y-3">
          <KitStage kit={k} byId={cat.byId} />
          <div className="grid grid-cols-2 gap-2">
            {card('look', 'Look', k.outfit || null)}
            {card('vest', 'Vest', k.vest ? `${name(k.vest)}${k.plates ? ` · ${k.plates} plates` : ''}` : null, (!!k.vest && short.has(k.vest)) || short.has(PLATE))}
            {card('bag', 'Bag', name(k.bagType), !!k.bagType && short.has(k.bagType))}
            {card('car', 'Car', k.vehicle?.name ?? null)}
          </div>
          <p className="text-center text-[11px] text-smoke">{plan ? 'Plan mode: pick anything in the catalog. What you are missing glows red.' : 'Real mode: only what is in your locker.'}</p>
        </div>

        {/* the inventory, FiveM style: slots 1–5 are the hotbar */}
        <div className="ox-panel">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-hud text-sm font-bold tracking-wider text-gold-200 uppercase">Inventory</p>
            <p className="font-mono text-[11px] text-smoke">
              {[...k.hotbar, ...k.bag].filter(Boolean).length} items · {short.size ? <span className="text-red-300">{short.size} missing</span> : <span className="text-ok">all in your locker</span>}
            </p>
          </div>
          <p className="label mb-1 text-[10px]">Hotbar</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: HOTBAR }, (_, i) => {
              const s = k.hotbar[i] ?? null;
              const p: Spot = { zone: 'hot', i };
              return <InvSlot key={i} slot={s} num={i + 1} hot byId={cat.byId} missing={!!s && missingSlot(s)} onClick={() => setEditing(p)} {...dragProps(p)} />;
            })}
          </div>
          <p className="label mt-3 mb-1 text-[10px]">Bag</p>
          <div className="grid grid-cols-5 gap-1.5">
            {bag.map((s, i) => {
              const p: Spot = { zone: 'bag', i };
              return <InvSlot key={i} slot={s} byId={cat.byId} missing={!!s && missingSlot(s)} onClick={() => setEditing(p)} {...dragProps(p)} />;
            })}
          </div>
          <p className="mt-2 text-[11px] text-smoke">Tap a square to fill it. Drag to move things between the hotbar and the bag.</p>
        </div>
      </div>

      {shopping.length > 0 && <StillToGet kitName={k.name} need={shopping} name={(id) => name(id) ?? id} />}

      {editing && (
        <SlotEditor
          cat={cat}
          owned={owned}
          plan={plan}
          spot={editing}
          slot={get(editing)}
          onClose={() => setEditing(null)}
          onSave={(s) => (set(put(editing, s)), setEditing(null))}
          onMove={(to) => (swap(editing, to), setEditing(null))}
          hotbar={k.hotbar}
          bagFree={bag.findIndex((x) => !x)}
        />
      )}
      {equip === 'vest' && <VestEditor cat={cat} owned={owned} plan={plan} vest={k.vest ?? null} plates={k.plates ?? 0} have={plates} onClose={() => setEquip(null)} onSave={(vest, p) => (set({ vest, plates: p }), setEquip(null))} />}
      {equip === 'bag' && <ItemOnly title="Bag" kinds={['gear']} cat={cat} owned={owned} plan={plan} value={k.bagType ?? null} onClose={() => setEquip(null)} onSave={(bagType) => (set({ bagType }), setEquip(null))} />}
      {equip === 'look' && <LookEditor value={k.outfit ?? ''} onClose={() => setEquip(null)} onSave={(outfit) => (set({ outfit }), setEquip(null))} />}
      {equip === 'car' && <CarEditor value={k.vehicle ?? null} onClose={() => setEquip(null)} onSave={(vehicle) => (set({ vehicle }), setEquip(null))} />}
      {renaming && <NameKit title="Rename kit" initial={k.name} onClose={() => setRenaming(false)} onSave={async (n) => (set({ name: n }), setRenaming(false))} />}
    </div>
  );
}

/** What a kit still needs, and a button to put it on my Personal Wishlist or ask the gang for it. */
function StillToGet({ kitName, need, name }: { kitName: string; need: { id: string; short: number }[]; name: (id: string) => string }) {
  const { me } = useHub();
  const list = useShopping(me.id);
  const wishQ = useMemo(() => query(collection(db, 'wishes'), where('byId', '==', me.id)), [me.id]);
  const wishes = (useCollection<Wish>(wishQ) ?? []).filter((w) => w.status === 'open' || w.status === 'claimed');
  const stock = useCollection<{ id: string; items?: Record<string, unknown> }>('stock');
  const [open, setOpen] = useState(false);
  const inStash = (id: string) => (stock ?? []).reduce((t, d) => t + toCount(d.items?.[id]), 0);
  const listed = (id: string) => list?.some((x) => x.item === id);
  const asked = (id: string) => wishes.some((w) => w.title === name(id));
  return (
    <div className="hud p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label">Still to get</p>
        <button className="btn-gold btn-sm" onClick={() => setOpen(true)} disabled={!list || !stock}>
          <ShoppingCart className="size-3.5" /> Get these
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {need.map((s) => (
          <span key={s.id} className="chip flex items-center gap-1 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 ring-1 ring-red-400/30">
            {name(s.id)} ×{s.short}
            {listed(s.id) && <ShoppingCart className="size-3 text-gold-300" aria-label="On your Personal Wishlist" />}
            {asked(s.id) && <HandHelping className="size-3 text-gold-300" aria-label="Asked the gang" />}
          </span>
        ))}
      </div>
      {open && list && stock && <GetThese kitName={kitName} need={need} name={name} inStash={inStash} list={list} onClose={() => setOpen(false)} />}
    </div>
  );
}

function GetThese({ kitName, need, name, inStash, list, onClose }: { kitName: string; need: { id: string; short: number }[]; name: (id: string) => string; inStash: (id: string) => number; list: ShopItem[]; onClose: () => void }) {
  const { me } = useHub();
  // The gang if the family stash has enough to hand over; otherwise it's mine to buy.
  const [where_, setWhere] = useState<Record<string, 'me' | 'gang' | 'skip'>>(() => Object.fromEntries(need.map((n) => [n.id, inStash(n.id) >= n.short ? 'gang' : 'me'])));
  const [busy, setBusy] = useState(false);
  const mine = need.filter((n) => where_[n.id] === 'me');
  const gang = need.filter((n) => where_[n.id] === 'gang');
  return (
    <Modal title={`Get what “${kitName}” needs`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-ash">Things the family stash has go to the gang as a request on the BlackMarket wish list. The rest goes on your Personal Wishlist (My Locker). Change any of them.</p>
        <ul className="divide-y divide-line-soft border border-line-soft">
          {need.map((n) => {
            const st = inStash(n.id);
            return (
              <li key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="text-gold-100">{name(n.id)}</span> <span className="font-mono text-xs text-smoke">×{n.short}</span>
                  <span className={`block text-[11px] ${st ? 'text-ok' : 'text-smoke'}`}>{st ? `Family stash has ${st}` : 'Not in the family stash'}</span>
                </span>
                <span className="flex overflow-hidden rounded-full ring-1 ring-line">
                  {(
                    [
                      ['me', 'My wishlist'],
                      ['gang', 'Ask the gang'],
                      ['skip', 'Skip'],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} onClick={() => setWhere({ ...where_, [n.id]: v })} className={`px-2.5 py-1 text-[11px] font-bold ${where_[n.id] === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                      {l}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-gold"
            disabled={busy || (!mine.length && !gang.length)}
            onClick={async () => {
              setBusy(true);
              if (mine.length) await addToShopping(me.id, list, mine.map((n) => ({ item: n.id, qty: n.short, from: kitName })));
              for (const n of gang) await askGang(me, name(n.id), n.short, `For my ${kitName} kit`);
              onClose();
            }}
          >
            <Check className="size-4" /> {[mine.length && `${mine.length} to my wishlist`, gang.length && `${gang.length} to the gang`].filter(Boolean).join(' · ') || 'Nothing picked'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Fill or change one inventory square: the item, how many, and a gun's attachments. */
function SlotEditor({
  cat,
  owned,
  plan,
  spot,
  slot,
  hotbar,
  bagFree,
  onSave,
  onMove,
  onClose,
}: {
  cat: Catalog;
  owned: Map<string, number>;
  plan: boolean;
  spot: Spot;
  slot: KitSlot | null;
  hotbar: (KitSlot | null)[];
  bagFree: number;
  onSave: (s: KitSlot | null) => void;
  onMove: (to: Spot) => void;
  onClose: () => void;
}) {
  const { me } = useHub();
  const [s, setS] = useState<KitSlot | null>(slot);
  const [choosing, setChoosing] = useState(!slot);
  const builds = useBuilds(me.id);
  const only = useMemo(() => (plan ? undefined : new Set([...owned.entries()].filter(([, n]) => n > 0).map(([id]) => id))), [plan, owned]);
  const t = s ? cat.byId.get(s.item) : undefined;
  const gun = t && kindOf(t, cat.byId) === 'gun';
  const wid = s ? partsGun(s.item, cat.byId) : '';
  const gslots = gun ? slotsFor(wid, cat.types) : [];
  const fits = gun
    ? (builds ?? [])
        .filter((b) => b.weaponId === wid && (b.by === me.id || b.saves?.[me.id] || b.public !== false))
        .sort((a, b) => Number(!!b.saves?.[me.id] || b.by === me.id) - Number(!!a.saves?.[me.id] || a.by === me.id) || count(b.likes) - count(a.likes))
    : [];
  const max = plan ? 9999 : Math.max(1, owned.get(s?.item ?? '') ?? 1);
  const where_ = spot.zone === 'hot' ? `Hotbar slot ${spot.i + 1}` : 'Bag';
  return (
    <Modal title={slot ? `${where_} · ${t?.name ?? 'Item'}` : `${where_} · add something`} onClose={onClose} wide>
      <div className="space-y-4">
        {choosing ? (
          <ItemPicker
            types={cat.types.filter((x) => x.category !== 'attachment')}
            value={s?.item ?? null}
            only={only}
            count={plan ? undefined : (id) => owned.get(id) ?? 0}
            onChange={(id) => (setS({ item: id, qty: 1 }), setChoosing(false))}
          />
        ) : (
          s && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-20">
                  <InvSlot slot={s} byId={cat.byId} small missing={(owned.get(s.item) ?? 0) < s.qty} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-hud text-lg font-bold text-gold-100">{itemTitle(t, cat.byId)}</p>
                  <p className={`text-xs ${(owned.get(s.item) ?? 0) >= s.qty ? 'text-ok' : 'text-red-300'}`}>{owned.get(s.item) ? `${owned.get(s.item)} in your locker` : 'Not in your locker'}</p>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setChoosing(true)}>
                  Change
                </button>
              </div>
              {!gun && (
                <Field label="How many">
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={max} className="input w-28 font-mono" value={s.qty} onChange={(e) => setS({ ...s, qty: Math.max(1, Math.min(max, +e.target.value || 1)) })} />
                    {!plan && <span className="text-xs text-smoke">up to {max}</span>}
                  </div>
                </Field>
              )}
              {gun && gslots.length > 0 && (
                <div className="space-y-2">
                  {fits.length > 0 && (
                    <select
                      className="input py-1.5 text-sm"
                      value=""
                      onChange={(e) => {
                        const b = fits.find((x) => x.id === e.target.value);
                        // Real kits only take the parts you own.
                        if (b) setS({ ...s, parts: plan ? { ...b.parts } : Object.fromEntries(Object.entries(b.parts).filter(([, id]) => owned.get(id))) });
                      }}
                    >
                      <option value="">Use a build…</option>
                      {fits.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} · {b.by === me.id ? 'mine' : b.byName}
                          {b.saves?.[me.id] ? ' · saved' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {gslots.map((g) => {
                      const opts = attachmentsFor(wid, cat.types).filter((a) => a.slot === g.id && (plan || owned.get(a.id) || s.parts?.[g.id] === a.id));
                      const v = s.parts?.[g.id] ?? '';
                      return (
                        <label key={g.id} className="text-xs">
                          <span className="text-smoke">{g.label}</span>
                          <select className={`input py-1 text-xs ${v && !owned.get(v) ? 'border-red-400/60' : ''}`} value={v} onChange={(e) => setS({ ...s, parts: { ...s.parts, [g.id]: e.target.value } })}>
                            <option value="">{opts.length ? '— None —' : '— none owned —'}</option>
                            {opts.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                                {owned.get(o.id) ? ' ✓' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {slot && (
                <Field label="Move to">
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: HOTBAR }, (_, i) => (
                      <button
                        key={i}
                        disabled={spot.zone === 'hot' && spot.i === i}
                        onClick={() => onMove({ zone: 'hot', i })}
                        className="chip bg-raised px-2.5 py-1 text-xs text-ash disabled:opacity-40"
                        title={hotbar[i] ? `Swap with ${cat.byId.get(hotbar[i]!.item)?.name}` : 'Empty'}
                      >
                        {i + 1}
                      </button>
                    ))}
                    {spot.zone === 'hot' && bagFree >= 0 && (
                      <button onClick={() => onMove({ zone: 'bag', i: bagFree })} className="chip bg-raised px-2.5 py-1 text-xs text-ash">
                        Bag
                      </button>
                    )}
                  </div>
                </Field>
              )}
            </>
          )
        )}
        <div className="flex flex-wrap justify-between gap-2">
          {slot ? (
            <button className="btn-ghost text-red-300" onClick={() => onSave(null)}>
              <Trash2 className="size-4" /> Empty this square
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={!s} onClick={() => s && onSave({ ...s, parts: Object.fromEntries(Object.entries(s.parts ?? {}).filter(([, v]) => v)) })}>
              <Check className="size-4" /> Done
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ItemOnly({ title, kinds, cat, owned, plan, value, onSave, onClose }: { title: string; kinds: string[]; cat: Catalog; owned: Map<string, number>; plan: boolean; value: string | null; onSave: (id: string | null) => void; onClose: () => void }) {
  const types = cat.types.filter((t) => kinds.includes(kindOf(t, cat.byId)) && (plan || owned.get(t.id)));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {types.length ? (
          <ItemPicker types={types} value={value} onChange={(id) => onSave(id)} count={plan ? undefined : (id) => owned.get(id) ?? 0} />
        ) : (
          <p className="text-sm text-smoke">Nothing like that in your locker. Switch the kit to Plan to pick from the whole catalog.</p>
        )}
        {value && (
          <button className="btn-ghost text-red-300" onClick={() => onSave(null)}>
            <Trash2 className="size-4" /> Take it off
          </button>
        )}
      </div>
    </Modal>
  );
}

function VestEditor({ cat, owned, plan, vest, plates, have, onSave, onClose }: { cat: Catalog; owned: Map<string, number>; plan: boolean; vest: string | null; plates: number; have: number; onSave: (vest: string | null, plates: number) => void; onClose: () => void }) {
  const [v, setV] = useState(vest);
  const [p, setP] = useState(plates);
  const types = cat.types.filter((t) => kindOf(t, cat.byId) === 'armor' && t.id !== PLATE && (plan || owned.get(t.id) || t.id === vest));
  const max = plan ? 10 : Math.max(have, 0);
  return (
    <Modal title="Vest & plates" onClose={onClose}>
      <div className="space-y-4">
        {types.length ? <ItemPicker types={types} value={v} onChange={setV} count={plan ? undefined : (id) => owned.get(id) ?? 0} /> : <p className="text-sm text-smoke">No armor in your locker. Switch the kit to Plan to pick from the whole catalog.</p>}
        <Field label={`Plates${plan ? '' : ` · you have ${have}`}`}>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(Math.max(max, p), 10) + 1 }, (_, i) => (
              <button key={i} onClick={() => setP(i)} className={`grid size-8 place-items-center border text-xs font-bold ${p === i ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-line-soft text-ash'}`}>
                {i}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex justify-between gap-2">
          {vest ? (
            <button className="btn-ghost text-red-300" onClick={() => onSave(null, 0)}>
              <Trash2 className="size-4" /> No vest
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold" onClick={() => onSave(v, v ? p : 0)}>
            <Check className="size-4" /> Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LookEditor({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <Modal title="Look" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Outfit & mask" hint="What you wear for this kit, e.g. Oni mask, white Cursed tee, black beanie">
          <textarea className="input min-h-24" value={v} onChange={(e) => setV(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold" onClick={() => onSave(v.trim())}>
            <Check className="size-4" /> Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CarEditor({ value, onSave, onClose }: { value: { name: string; cls: string } | null; onSave: (v: { name: string; cls: string } | null) => void; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? '');
  const [cls, setCls] = useState(value?.cls ?? 'sedan');
  // The car list is kept in Admin → Lists; hidden cars don't show.
  const cars = useLists().vehicles.filter((v) => !v.hidden).map((v): [string, string] => [v.name, v.cls]);
  const known = cars.find(([n]) => n.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal title="Car" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Which car">
          <input
            className="input"
            list="kit-cars"
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              const k = cars.find(([n]) => n.toLowerCase() === e.target.value.trim().toLowerCase());
              if (k) setCls(k[1]);
            }}
            placeholder="e.g. Sultan RS"
          />
          <datalist id="kit-cars">
            {cars.map(([n]) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        {!known && (
          <Field label="Kind">
            <div className="flex flex-wrap gap-1">
              {VEHICLE_CLASSES.map((c) => (
                <button key={c.id} onClick={() => setCls(c.id)} className={`chip px-2.5 py-1 text-xs ${cls === c.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        {name.trim() && (
          <div className="mx-auto w-56 rounded bg-[radial-gradient(ellipse_at_50%_100%,#1a1233,#050507_70%)] p-4">
            <VehicleArt key={name.trim()} v={{ name: name.trim(), cls }} className="w-full" />
          </div>
        )}
        <div className="flex justify-between gap-2">
          {value ? (
            <button className="btn-ghost text-red-300" onClick={() => onSave(null)}>
              <Trash2 className="size-4" /> No car
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), cls })}>
            <Check className="size-4" /> Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- page ----------

export default function Gear() {
  const { me } = useHub();
  const cat = useCatalog();
  const builds = useBuilds(me.id);
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = (raw === 'builds' ? 'builds' : raw === 'kits' || raw === 'mine' || raw === 'loadout' ? 'kits' : 'smith') as 'smith' | 'builds' | 'kits';
  const [opened, setOpened] = useState<{ b: Build; copy: boolean } | null>(null);
  const [putting, setPutting] = useState<Pick<Build, 'weaponId' | 'parts' | 'name'> | null>(null);
  const kitParam = params.get('kit');
  return (
    <>
      <PageHeader
        icon={Swords}
        kicker="Me"
        title="Gear & Loadouts"
        sub="Build a gun slot by slot, browse the family's builds, and pack your kits: 5 hotbar slots, the bag, vest, look and ride."
        actions={
          <button className="btn-ghost" onClick={() => (setOpened(null), setParams({ tab: 'smith' }))}>
            <Plus className="size-4" /> New build
          </button>
        }
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(t) => setParams({ tab: t })}
          tabs={[
            { id: 'smith', label: opened ? <span className="inline-flex items-center gap-1"><Pencil className="size-3.5" /> Gunsmith</span> : 'Gunsmith' },
            { id: 'builds', label: `Builds${builds ? ` · ${builds.length}` : ''}` },
            { id: 'kits', label: 'My kits' },
          ]}
        />
      </div>
      {!cat.ready ? null : tab === 'kits' ? (
        <MyKits cat={cat} open={kitParam} onOpen={(id) => setParams({ tab: 'kits', kit: id })} />
      ) : !cat.weapons.length ? (
        <Empty title="No weapons in the catalog yet">Load the standard catalog in Admin → Item catalog.</Empty>
      ) : (
        <>
          {tab === 'smith' && <Gunsmith key={opened ? `${opened.b.id}${opened.copy}` : 'new'} cat={cat} initial={opened?.b} asCopy={opened?.copy} onSaved={() => (setOpened(null), setParams({ tab: 'builds' }))} onEquip={setPutting} />}
          {tab === 'builds' && (
            <Builds
              cat={cat}
              builds={builds}
              onOpen={(b) => (setOpened({ b, copy: false }), setParams({ tab: 'smith' }))}
              onCopy={(b) => (setOpened({ b, copy: true }), setParams({ tab: 'smith' }))}
              onEquip={(b) => setPutting(b)}
            />
          )}
        </>
      )}
      {putting && <PutInKit build={putting} cat={cat} onClose={() => setPutting(null)} onDone={(id) => (setPutting(null), setParams({ tab: 'kits', kit: id }))} />}
    </>
  );
}
