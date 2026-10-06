import { Backpack, Copy, Crosshair, Eye, EyeOff, Heart, Lock, Pencil, Plus, Save, Search, Shield, Sword, Swords, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Tabs } from '../components/Page';
import { WeaponArt } from '../components/WeaponArt';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { ago } from '../lib/format';
import { attachmentsFor, GUN_CLASSES, itemTitle, kindOf, slotLabel, slotsFor, type ItemType } from '../lib/items';
import { likeBuild, removeBuild, saveBuild, saveLoadout, setLoadoutPublic, SLOT_KINDS, UTILITY_SLOTS, type Build, type Carried, type CharLoadout } from '../lib/loadouts';
import { useLocker } from '../lib/locker';
import { toCount } from '../noel/data';

function useCatalog() {
  const types = useCollection<ItemType>('itemTypes');
  return useMemo(() => {
    const list = types ?? [];
    const byId = new Map(list.map((t) => [t.id, t]));
    // Weapons you can build: every custom weapon, and base guns that take Black Market parts.
    const weapons = list
      .filter((t) => t.category === 'gun' && !t.baseId && attachmentsFor(t.id, list).length > 0)
      .sort((a, b) => Number(!!a.base) - Number(!!b.base) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { ready: !!types, types: list, byId, weapons };
  }, [types]);
}
type Catalog = ReturnType<typeof useCatalog>;

/** How many of each item I have, across all my storages. */
function useOwned() {
  const locker = useLocker();
  return useMemo(() => {
    const n = new Map<string, number>();
    locker.stock.forEach((s) => Object.entries(s.items ?? {}).forEach(([k, v]) => n.set(k, (n.get(k) ?? 0) + toCount(v))));
    return n;
  }, [locker.stock]);
}

const classOf = (w?: ItemType) => w?.gunClass ?? 'rifle';

// ---------- gunsmith ----------

function SlotPicker({ slot, value, options, owned, onChange, onFocus }: { slot: string; value?: string; options: ItemType[]; owned?: Map<string, number>; onChange: (v: string) => void; onFocus: () => void }) {
  const cur = options.find((o) => o.id === value);
  return (
    <label className={`hud block p-3 transition ${value ? 'border-gold-600/70' : ''}`} onMouseEnter={onFocus}>
      <span className="label flex items-center justify-between">
        {slotLabel(slot)}
        {value && owned && <span className={owned.get(value) ? 'text-ok' : 'text-smoke'}>{owned.get(value) ? 'in your locker' : 'not owned'}</span>}
      </span>
      <select className="input mt-1.5 py-1.5 text-sm" value={value ?? ''} onChange={(e) => onChange(e.target.value)} onFocus={onFocus}>
        <option value="">— None —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {owned?.get(o.id) ? ' ✓' : ''}
          </option>
        ))}
      </select>
      <span className="mt-1 block truncate text-xs text-gold-200">{cur ? cur.name : <span className="text-smoke">{options.length} options</span>}</span>
    </label>
  );
}

function Gunsmith({ cat, initial, onSaved }: { cat: Catalog; initial?: Build | null; onSaved: () => void }) {
  const { me } = useHub();
  const owned = useOwned();
  const [weaponId, setWeaponId] = useState(initial?.weaponId ?? cat.weapons[0]?.id ?? '');
  const [parts, setParts] = useState<Record<string, string>>(initial?.parts ?? {});
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const mine = initial && initial.by === me.id;
  useEffect(() => {
    if (initial) {
      setWeaponId(initial.weaponId);
      setParts(initial.parts);
      setName(initial.name);
      setNotes(initial.notes ?? '');
    }
  }, [initial]);

  const w = cat.byId.get(weaponId);
  const slots = slotsFor(weaponId, cat.types);
  const opts = (slot: string) =>
    attachmentsFor(weaponId, cat.types)
      .filter((a) => a.slot === slot)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const filled = new Set(Object.entries(parts).filter(([, v]) => v).map(([k]) => k));
  const have = Object.values(parts).filter((p) => p && owned.get(p)).length;
  const list = cat.weapons.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Panel title="Weapon" pad={false}>
        <div className="flex items-center gap-2 border-b border-line-soft px-3">
          <Search className="size-4 text-smoke" />
          <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Find a weapon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[60dvh] overflow-y-auto">
          {GUN_CLASSES.map((c) => {
            const ws = list.filter((x) => x.gunClass === c.id);
            return ws.length ? (
              <div key={c.id}>
                <p className="label sticky top-0 bg-coal px-3 py-1">{c.label}</p>
                {ws.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => (setWeaponId(x.id), setParts({}))}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${x.id === weaponId ? 'bg-gold-400/15 text-gold-100' : 'text-ash hover:bg-raised'}`}
                  >
                    <span>{x.name}</span>
                    <span className="text-[10px] text-smoke">{x.base ? 'BM' : `${attachmentsFor(x.id, cat.types).length}`}</span>
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </div>
      </Panel>

      <div className="space-y-4">
        <section className="hud scanlines relative overflow-hidden p-5" style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(212,175,55,0.12), transparent 70%), #0e0e0f' }}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="label text-gold-500">{GUN_CLASSES.find((c) => c.id === w?.gunClass)?.label.replace(/s$/, '')} · {w?.base ? 'Base gun · Black Market parts' : 'Custom'}</p>
              <h2 className="foil font-display text-3xl font-bold">{w?.name ?? 'Pick a weapon'}</h2>
            </div>
            <p className="font-mono text-sm text-gold-200">
              {filled.size}/{slots.length} slots · you own {have}/{filled.size} parts{owned.get(weaponId) ? ' + the gun' : ''}
            </p>
          </div>
          <div className="mx-auto mt-2 max-w-2xl">
            <WeaponArt cls={classOf(w)} slots={slots.map((s) => s.id)} filled={filled} active={active} />
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {slots.map((s) => (
            <SlotPicker key={s.id} slot={s.id} value={parts[s.id]} options={opts(s.id)} owned={owned} onFocus={() => setActive(s.id)} onChange={(v) => setParts({ ...parts, [s.id]: v })} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!w} onClick={() => setSaving(true)}>
            <Save className="size-4" /> {mine ? 'Save build' : 'Share this build'}
          </button>
          {mine && (
            <button className="btn-ghost" onClick={() => (setName(`${name} (copy)`), setSaving(true))}>
              <Copy className="size-4" /> Save as a copy
            </button>
          )}
          <button className="btn-ghost" onClick={() => setParts({})}>
            <X className="size-4" /> Strip it
          </button>
        </div>
      </div>

      {saving && (
        <Modal title={mine ? 'Save build' : 'Share a build'} onClose={() => setSaving(false)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const clean = Object.fromEntries(Object.entries(parts).filter(([, v]) => v));
              const copy = name.endsWith('(copy)');
              await saveBuild(me, { name: name.trim().slice(0, 40), weaponId, parts: clean, notes: notes.trim().slice(0, 500) }, mine && !copy ? initial!.id : undefined);
              setSaving(false);
              onSaved();
            }}
          >
            <Field label="Build name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Blacksite rifleman" autoFocus />
            </Field>
            <Field label="Notes" hint="What it's for, why these parts">
              <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setSaving(false)}>
                Cancel
              </button>
              <button className="btn-gold" disabled={!name.trim()}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- shared builds ----------

function BuildCard({ b, cat, onOpen, owned }: { b: Build; cat: Catalog; onOpen: () => void; owned: Map<string, number> }) {
  const { me } = useHub();
  const w = cat.byId.get(b.weaponId);
  const likes = Object.values(b.likes ?? {}).filter(Boolean).length;
  const liked = !!b.likes?.[me.id];
  const parts = Object.entries(b.parts);
  const have = parts.filter(([, v]) => owned.get(v)).length;
  return (
    <div className="hud flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="label">{w?.name ?? 'Unknown weapon'}</p>
          <p className="font-hud text-lg leading-tight font-bold text-gold-100">{b.name}</p>
          <p className="text-xs text-smoke">
            by <MemberName id={b.by} className="text-xs" /> · {ago(b.at)}
          </p>
        </div>
        <button onClick={() => likeBuild(b.id, me.id, !liked)} className={`flex items-center gap-1 text-sm ${liked ? 'text-danger' : 'text-smoke hover:text-gold-200'}`} aria-label="Like">
          <Heart className={`size-4 ${liked ? 'fill-current' : ''}`} /> {likes}
        </button>
      </div>
      <div className="my-2">
        <WeaponArt cls={classOf(w)} slots={slotsFor(b.weaponId, cat.types).map((s) => s.id)} filled={new Set(Object.keys(b.parts))} />
      </div>
      <ul className="flex-1 space-y-0.5 text-xs">
        {parts.map(([slot, id]) => (
          <li key={slot} className="flex gap-2">
            <span className="w-20 shrink-0 text-smoke">{slotLabel(slot)}</span>
            <span className={`truncate ${owned.get(id) ? 'text-ok' : 'text-gold-100'}`}>{cat.byId.get(id)?.name ?? '—'}</span>
          </li>
        ))}
      </ul>
      {b.notes && <p className="mt-2 text-xs text-ash italic">“{b.notes}”</p>}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-smoke">
          You own {have}/{parts.length} parts
        </span>
        <span className="flex gap-1">
          <button className="btn-ghost btn-sm" onClick={onOpen}>
            <Wrench className="size-3.5" /> {b.by === me.id ? 'Edit' : 'Open'}
          </button>
          {b.by === me.id && (
            <button className="btn-ghost btn-sm px-2" onClick={() => confirm(`Delete “${b.name}”?`) && removeBuild(b.id)} aria-label="Delete">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function SharedBuilds({ cat, onOpen }: { cat: Catalog; onOpen: (b: Build) => void }) {
  const builds = useCollection<Build>('builds') ?? [];
  const owned = useOwned();
  const [weapon, setWeapon] = useState('');
  const [sort, setSort] = useState<'likes' | 'new'>('likes');
  const list = builds
    .filter((b) => !weapon || b.weaponId === weapon)
    .sort((a, b) =>
      sort === 'likes'
        ? Object.values(b.likes ?? {}).filter(Boolean).length - Object.values(a.likes ?? {}).filter(Boolean).length
        : (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0),
    );
  const used = cat.weapons.filter((w) => builds.some((b) => b.weaponId === w.id));
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={weapon} onChange={(e) => setWeapon(e.target.value)}>
          <option value="">All weapons</option>
          {used.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as 'likes' | 'new')}>
          <option value="likes">Most liked</option>
          <option value="new">Newest</option>
        </select>
      </div>
      {list.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b) => (
            <BuildCard key={b.id} b={b} cat={cat} owned={owned} onOpen={() => onOpen(b)} />
          ))}
        </div>
      ) : (
        <Empty icon={<Wrench className="size-6" />} title="No builds shared yet">
          Make one in the Gunsmith and share it.
        </Empty>
      )}
    </>
  );
}

// ---------- character loadout ----------

const SLOT_ICONS = { vest: Shield, primary: Crosshair, sidearm: Crosshair, melee: Sword, bag: Backpack } as const;

function GunSlot({ label, value, guns, cat, owned, onChange }: { label: string; value: Carried | null | undefined; guns: ItemType[]; cat: Catalog; owned: Map<string, number>; onChange: (v: Carried | null) => void }) {
  const builds = (useCollection<Build>('builds') ?? []).filter((b) => b.weaponId === value?.item);
  const w = value ? cat.byId.get(value.item) : undefined;
  const slots = value ? slotsFor(value.item, cat.types) : [];
  const parts = value?.parts ?? {};
  return (
    <div className="hud p-4">
      <p className="label mb-1.5 flex items-center gap-1.5">
        <Crosshair className="size-3.5" /> {label}
      </p>
      <select className="input" value={value?.item ?? ''} onChange={(e) => onChange(e.target.value ? { item: e.target.value, parts: {} } : null)}>
        <option value="">— Empty —</option>
        {guns.map((g) => (
          <option key={g.id} value={g.id}>
            {itemTitle(g, cat.byId)}
          </option>
        ))}
      </select>
      {value && !owned.get(value.item) && <p className="mt-1 text-xs text-danger">Not in your locker any more.</p>}
      {value && slots.length > 0 && (
        <>
          <div className="my-2">
            <WeaponArt cls={classOf(w)} slots={slots.map((s) => s.id)} filled={new Set(Object.keys(parts).filter((k) => parts[k]))} />
          </div>
          {builds.length > 0 && (
            <select
              className="input mb-2 py-1 text-xs"
              value=""
              onChange={(e) => {
                const b = builds.find((x) => x.id === e.target.value);
                // Only the parts you own go on.
                if (b) onChange({ item: value.item, parts: Object.fromEntries(Object.entries(b.parts).filter(([, id]) => owned.get(id))) });
              }}
            >
              <option value="">Apply a shared build (parts you own)…</option>
              {builds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {slots.map((s) => {
              const opts = attachmentsFor(value.item, cat.types).filter((a) => a.slot === s.id && (owned.get(a.id) || parts[s.id] === a.id));
              return (
                <label key={s.id} className="text-xs">
                  <span className="text-smoke">{s.label}</span>
                  <select className="input py-1 text-xs" value={parts[s.id] ?? ''} onChange={(e) => onChange({ ...value, parts: { ...parts, [s.id]: e.target.value } })}>
                    <option value="">{opts.length ? '— None —' : '— none owned —'}</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Edit my own character loadout, using only what's in my locker. */
function MyLoadout({ cat }: { cat: Catalog }) {
  const { me } = useHub();
  const owned = useOwned();
  const saved = useDoc<CharLoadout>(`loadouts/${me.id}`);
  const [l, setL] = useState<Omit<CharLoadout, 'id' | 'at'> | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (saved !== undefined && !dirty) setL(saved ? { ...saved } : { public: false, plates: 0, utility: [] });
  }, [saved, dirty]);
  if (!l || !cat.ready) return null;
  const set = (patch: Partial<CharLoadout>) => (setL({ ...l, ...patch }), setDirty(true));
  const mine = cat.types.filter((t) => owned.get(t.id));
  const ofKind = (kinds: readonly string[]) => mine.filter((t) => kinds.includes(kindOf(t, cat.byId)));
  const guns = ofKind(SLOT_KINDS.primary);
  const pistols = guns.filter((g) => (g.baseId ? cat.byId.get(g.baseId)?.gunClass : g.gunClass) === 'pistol');
  const longs = guns.filter((g) => !pistols.includes(g));
  const plates = owned.get('ar_armor_plate') ?? 0;
  const util = [...(l.utility ?? [])];
  while (util.length < UTILITY_SLOTS) util.push({ item: '', qty: 1 });
  const simple = (key: 'vest' | 'melee' | 'bag', label: string, kinds: readonly string[]) => {
    const Icon = SLOT_ICONS[key];
    const v = l[key];
    return (
      <div className="hud p-4">
        <p className="label mb-1.5 flex items-center gap-1.5">
          <Icon className="size-3.5" /> {label}
        </p>
        <select className="input" value={v ?? ''} onChange={(e) => set({ [key]: e.target.value || null })}>
          <option value="">— Empty —</option>
          {ofKind(kinds).map((t) => (
            <option key={t.id} value={t.id}>
              {itemTitle(t, cat.byId)}
            </option>
          ))}
        </select>
        {v && !owned.get(v) && <p className="mt-1 text-xs text-danger">Not in your locker any more.</p>}
        {key === 'vest' && (
          <label className="mt-2 flex items-center justify-between text-sm">
            <span className="text-smoke">Plates in it · you have {plates}</span>
            <input type="number" min={0} max={Math.max(plates, l.plates ?? 0)} className="input w-20 py-1 font-mono" value={l.plates ?? 0} onChange={(e) => set({ plates: Math.max(0, Math.min(Math.max(plates, 0), +e.target.value || 0)) })} />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ash">Built from what's in your locker. Only you can change it.</p>
        <span className="flex items-center gap-2">
          <PublicPill on={!!l.public} onChange={(v) => set({ public: v })} />
          <button className="btn-gold" disabled={!dirty} onClick={async () => (await saveLoadout(me.id, { ...l, utility: (l.utility ?? []).filter((u) => u.item) }), setDirty(false))}>
            <Save className="size-4" /> {dirty ? 'Save loadout' : 'Saved'}
          </button>
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {simple('vest', 'Vest', SLOT_KINDS.vest)}
          {simple('bag', 'Duffel bag', SLOT_KINDS.bag)}
          {simple('melee', 'Melee', SLOT_KINDS.melee)}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <GunSlot label="Primary" value={l.primary} guns={longs} cat={cat} owned={owned} onChange={(v) => set({ primary: v })} />
          <GunSlot label="Sidearm" value={l.sidearm} guns={pistols} cat={cat} owned={owned} onChange={(v) => set({ sidearm: v })} />
        </div>
      </div>
      <Panel title="Utility">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {util.map((u, i) => (
            <div key={i} className="flex items-center gap-2 border border-line-soft p-2">
              <select
                className="input flex-1 py-1 text-sm"
                value={u.item}
                onChange={(e) => {
                  const next = [...util];
                  next[i] = { item: e.target.value, qty: 1 };
                  set({ utility: next });
                }}
              >
                <option value="">— Empty —</option>
                {ofKind(SLOT_KINDS.utility).map((t) => (
                  <option key={t.id} value={t.id}>
                    {itemTitle(t, cat.byId)} ({owned.get(t.id)})
                  </option>
                ))}
              </select>
              {u.item && (
                <input
                  type="number"
                  min={1}
                  max={owned.get(u.item) ?? 1}
                  className="input w-16 py-1 font-mono"
                  value={u.qty}
                  onChange={(e) => {
                    const next = [...util];
                    next[i] = { ...u, qty: Math.max(1, Math.min(owned.get(u.item) ?? 1, +e.target.value || 1)) };
                    set({ utility: next });
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-smoke">Molotovs, pipe bombs, tablets, meds, ammo — anything you carry. Counts can't go over what's in your locker.</p>
      </Panel>
    </div>
  );
}

export function PublicPill({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-ok/20 text-ok ring-1 ring-ok/50' : 'bg-raised text-smoke ring-1 ring-line'}`}>
      {on ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {on ? 'Public' : 'Private'}
    </button>
  );
}

/** Read-only loadout for a profile. */
export function LoadoutCard({ memberId }: { memberId: string }) {
  const { me } = useHub();
  const cat = useCatalog();
  const l = useDoc<CharLoadout>(`loadouts/${memberId}`);
  const mine = memberId === me.id;
  const name = (id?: string | null) => (id ? itemTitle(cat.byId.get(id), cat.byId) : null);
  const gun = (c?: Carried | null) =>
    c ? (
      <>
        <span className="text-gold-100">{name(c.item)}</span>
        {Object.values(c.parts ?? {}).filter(Boolean).length > 0 && <span className="block text-[11px] text-smoke">{Object.values(c.parts).filter(Boolean).map((p) => cat.byId.get(p)?.name).join(' · ')}</span>}
      </>
    ) : (
      <span className="text-smoke">—</span>
    );
  return (
    <div className="hud p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 font-hud font-bold text-gold-200">
          <Swords className="size-5 text-gold-500" /> Loadout
        </p>
        {mine && l !== undefined && <PublicPill on={!!l?.public} onChange={(v) => setLoadoutPublic(me.id, v)} />}
      </div>
      {l === undefined ? null : l === null ? (
        <p className="flex items-center gap-1.5 text-sm text-smoke">{mine ? 'Nothing set up yet — Gear & Loadouts → My loadout.' : <><Lock className="size-3.5" /> Private, or not set up yet.</>}</p>
      ) : (
        <dl className="space-y-1.5 text-sm">
          {!l.public && !mine && <p className="text-xs text-gold-300">Private — you're seeing it as an admin.</p>}
          {[
            ['Vest', l.vest ? `${name(l.vest)}${l.plates ? ` · ${l.plates} plates` : ''}` : null],
            ['Primary', gun(l.primary)],
            ['Sidearm', gun(l.sidearm)],
            ['Melee', name(l.melee)],
            ['Bag', name(l.bag)],
          ].map(([k, v]) => (
            <div key={k as string} className="flex gap-3">
              <dt className="label w-16 shrink-0 pt-0.5">{k}</dt>
              <dd className="min-w-0">{v ?? <span className="text-smoke">—</span>}</dd>
            </div>
          ))}
          {(l.utility ?? []).length > 0 && (
            <div className="flex gap-3">
              <dt className="label w-16 shrink-0 pt-0.5">Utility</dt>
              <dd className="flex flex-wrap gap-1">
                {(l.utility ?? []).map((u, i) => (
                  <span key={i} className="chip bg-raised px-2 py-0.5 text-[11px] text-ash">
                    {name(u.item)} ×{u.qty}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

// ---------- page ----------

export default function Gear() {
  const cat = useCatalog();
  const [params, setParams] = useSearchParams();
  const tab = (['smith', 'builds', 'mine'].includes(params.get('tab') ?? '') ? params.get('tab') : 'smith') as 'smith' | 'builds' | 'mine';
  const [opened, setOpened] = useState<Build | null>(null);
  return (
    <>
      <PageHeader
        icon={Swords}
        kicker="War"
        title="Gear & Loadouts"
        sub="Build a weapon slot by slot and share it, then kit out your character from what's in your locker."
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
            { id: 'builds', label: 'Shared builds' },
            { id: 'mine', label: 'My loadout' },
          ]}
        />
      </div>
      {!cat.ready ? null : !cat.weapons.length ? (
        <Empty title="No weapons in the catalog yet">Load the standard catalog in Admin → Item catalog.</Empty>
      ) : (
        <>
          {tab === 'smith' && <Gunsmith cat={cat} initial={opened} onSaved={() => setParams({ tab: 'builds' })} />}
          {tab === 'builds' && <SharedBuilds cat={cat} onOpen={(b) => (setOpened(b), setParams({ tab: 'smith' }))} />}
          {tab === 'mine' && <MyLoadout cat={cat} />}
        </>
      )}
    </>
  );
}
