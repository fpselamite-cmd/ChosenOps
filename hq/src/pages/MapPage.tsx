import { CalendarDays, Copy, Crosshair, Flag, ImagePlus, KeyRound, Lock, Map as MapIcon, Minus, Move, Pencil, Plus, Search, ShieldHalf, Swords, Trash2, Users, Warehouse, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react';
import { AudiencePicker } from '../components/AudiencePicker';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { audienceLabel, GANG, useVisible, type AudienceDraft, type Scope } from '../lib/audience';
import { ago, NIGHT } from '../lib/format';
import { addPin, pinType, pinTypesFor, removePin, savePin, usePins, type Pin } from '../lib/pins';
import { Link, useSearchParams } from 'react-router-dom';
import { useCollection } from '../hooks/useCollection';
import { spotOf, type Blacksite, type Spot } from '../lib/blacksites';
import { addDays, et, eventKind, keyOf, occurrences, timeLabel, type CalEvent } from '../lib/calendar';
import { shrinkImage } from '../lib/image';
import { thingsIn } from '../lib/locker';
import { freshSighting, type Rival, type Sighting } from '../lib/rivals';
import { ZoneLayer } from './rivals/common';
import { NarcoticsProvider, useNarcotics } from '../noel/store';

/** Your server's map goes in public/map/city.jpg; until then a placeholder shows. */
const MAP_SRC = '/map/city.jpg';
const PLACEHOLDER = '/map/placeholder.svg';
const MAX = 8;

function useLead() {
  const { isLead } = useHub();
  return isLead;
}

function PinDialog({ pin, at, onClose }: { pin?: Pin; at?: { x: number; y: number }; onClose: () => void }) {
  const { me, narco } = useHub();
  const lead = useLead();
  const [name, setName] = useState(pin?.name ?? '');
  const [type, setType] = useState(pin?.type ?? 'meet');
  const [note, setNote] = useState(pin?.note ?? '');
  const [postal, setPostal] = useState(pin?.postal ?? '');
  const [access, setAccess] = useState(pin?.access ?? '');
  const [photo, setPhoto] = useState<string | null>(pin?.photo ?? null);
  const [stashId, setStashId] = useState<string | null>(pin?.stashId ?? null);
  const { storage, locLabel } = useNarcotics();
  const photoRef = useRef<HTMLInputElement>(null);
  const [aud, setAud] = useState<AudienceDraft>(pin ? { scope: pin.scope, ranks: pin.ranks, crewIds: [], minRank: pin.minRank ?? null } : { ...GANG });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const data = { name: name.trim().slice(0, 40), type, note: note.trim().slice(0, 300), postal: postal.trim().slice(0, 10), access: access.trim().slice(0, 300), photo, stashId: type === 'stash' ? stashId : null, ...aud };
    if (pin) await savePin(pin, data);
    else await addPin(me, { ...data, x: at!.x, y: at!.y });
    onClose();
  }
  return (
    <Modal title={pin ? 'Edit pin' : 'New pin'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Docks warehouse" autoFocus />
        </Field>
        <div>
          <span className="label mb-1.5 block">Type</span>
          <div className="grid grid-cols-3 gap-1.5">
            {pinTypesFor(narco).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex items-center gap-1.5 border px-2 py-1.5 text-xs ${type === t.id ? 'border-gold-400 bg-gold-400/10 text-gold-100' : 'border-line-soft text-ash'}`}
              >
                <t.icon className="size-3.5" style={{ color: t.color }} /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Postal">
            <input className="input font-mono" value={postal} onChange={(e) => setPostal(e.target.value.replace(/[^\w-]/g, ''))} maxLength={10} placeholder="8021" />
          </Field>
          {type === 'stash' ? (
            <Field label="Which stash" hint="Shows its live counts on the pin">
              <select className="input" value={stashId ?? ''} onChange={(e) => setStashId(e.target.value || null)}>
                <option value="">Not linked</option>
                {storage.map((l) => (
                  <option key={l.id} value={l.id}>
                    {locLabel(l.id)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <span />
          )}
        </div>
        <Field label="Note">
          <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What it is, how to get there" />
        </Field>
        <Field label="Access" hint="Door codes, keys, who to ask. Same people as the pin can see it.">
          <input className="input" value={access} onChange={(e) => setAccess(e.target.value)} maxLength={300} />
        </Field>
        <div>
          <span className="label mb-1.5 block">Photo</span>
          <div className="flex items-center gap-2">
            {photo && <img src={photo} alt="" className="h-16 rounded object-cover ring-1 ring-line" />}
            <button type="button" className="btn-ghost btn-sm" onClick={() => photoRef.current?.click()}>
              <ImagePlus className="size-3.5" /> {photo ? 'Change' : 'Add a screenshot'}
            </button>
            {photo && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPhoto(null)}>
                Remove
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setPhoto(await shrinkImage(e.target.files[0], 900, 0.75))} />
          </div>
        </div>
        <div>
          <span className="label mb-1.5 block">Who can see it</span>
          <AudiencePicker value={aud} onChange={setAud} limited={lead} />
          {!lead && <p className="mt-1 text-xs text-smoke">Leadership can also limit pins to certain ranks.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy || !name.trim()}>
            {pin ? 'Save' : 'Drop pin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Marker({ pin, k, selected, fresh, onClick }: { pin: Pin; k: number; selected: boolean; fresh: boolean; onClick: () => void }) {
  const t = pinType(pin.type);
  return (
    <button
      className="absolute"
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / k})`, zIndex: selected ? 5 : 2 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={pin.name}
    >
      <span className={`map-pin ${selected ? 'on' : ''} ${fresh ? 'drop' : ''}`} style={{ '--c': t.color } as React.CSSProperties}>
        <t.icon className="size-4" />
        {pin.scope !== 'gang' && <span className="map-pin-lock">{pin.scope === 'personal' ? <Lock className="size-2.5" /> : <ShieldHalf className="size-2.5" />}</span>}
        {(selected || k >= 1.5) && <span className="map-pin-label">{pin.name}</span>}
      </span>
    </button>
  );
}

/** Something else on the map at a spot: a blacksite location or an upcoming event. */
function Extra({ x, y, k, kind, label, sub, tone }: { x: number; y: number; k: number; kind: 'spot' | 'event' | 'sighting'; label: string; sub?: string; tone?: string }) {
  const Icon = kind === 'event' ? CalendarDays : kind === 'sighting' ? Crosshair : tone === 'win' ? Flag : tone === 'loss' ? X : Swords;
  return (
    <span className="pointer-events-none absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(-50%, ${kind === 'event' ? '-130%' : '-50%'}) scale(${1 / k})`, transformOrigin: kind === 'event' ? '50% 130%' : undefined, zIndex: 3 }}>
      <span className={`map-extra ${kind} ${tone ?? ''}`}>
        <Icon className="size-3.5" />
        {(k >= 1.5 || kind !== 'spot') && (
          <span className="map-pin-label">
            {label}
            {sub && <small> · {sub}</small>}
          </span>
        )}
      </span>
    </span>
  );
}

/** City time is night: 8pm to 6am unless an admin changes it. */
function useNight() {
  const isNight = () => {
    const h = et(Date.now()).h;
    // Night can wrap past midnight (8pm–6am) or not (1am–5am).
    return NIGHT.from > NIGHT.to ? h >= NIGHT.from || h < NIGHT.to : h >= NIGHT.from && h < NIGHT.to;
  };
  const [night, setNight] = useState(isNight);
  useEffect(() => {
    const t = setInterval(() => setNight(isNight()), 60e3);
    return () => clearInterval(t);
  }, []);
  return night;
}

/** A stash pin's live counts. */
function StashCounts({ id }: { id: string }) {
  const { stock, locLabel } = useNarcotics();
  const items = useCollection<{ id: string; name: string }>('itemTypes') ?? [];
  const name = (i: string) => items.find((t) => t.id === i)?.name ?? i;
  const things = thingsIn(stock.get(id), name).sort((a, b) => b.qty - a.qty);
  return (
    <Link to={`/stash?place=${id}`} className="mt-2 block border border-line-soft p-2 text-xs hover:bg-raised/50">
      <span className="flex items-center gap-1.5 font-bold text-gold-200">
        <Warehouse className="size-3.5" /> {locLabel(id)}
      </span>
      {things.length ? (
        <span className="mt-1 flex flex-wrap gap-x-2 text-ash">
          {things.slice(0, 6).map((t) => (
            <span key={t.label}>
              {t.label} <b className="font-mono text-gold-100">{t.qty}</b>
            </span>
          ))}
          {things.length > 6 && <span className="text-smoke">+{things.length - 6} more</span>}
        </span>
      ) : (
        <span className="mt-1 block text-smoke">Empty right now.</span>
      )}
    </Link>
  );
}

const layersFor = (narco: boolean) => [
  ...pinTypesFor(narco).map((t) => ({ id: t.id, label: t.label, color: t.color, icon: t.icon })),
  { id: '_spots', label: 'Blacksite locations', color: '#ef4444', icon: Swords },
  { id: '_events', label: 'Events · 7 days', color: '#a78bfa', icon: CalendarDays },
  { id: '_turf', label: 'Rival turf', color: '#f97316', icon: ShieldHalf },
  { id: '_sightings', label: 'Rival sightings · 6h', color: '#dc2626', icon: Crosshair },
];

function MapPage() {
  const { me, rankById, narco } = useHub();
  const LAYERS = layersFor(narco);
  const lead = useLead();
  // Grows, stash houses and labs never reach anyone without the Narco role.
  const pins = usePins();
  const rivals = useCollection<Rival>('rivals') ?? [];
  const sightings = useCollection<Sighting>('sightings') ?? [];
  const [src, setSrc] = useState(MAP_SRC);
  const [aspect, setAspect] = useState(1.5);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [mode, setMode] = useState<'look' | 'add' | 'move'>('look');
  const [selected, setSelected] = useState<string | null>(null);
  const [newAt, setNewAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Pin | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [bigPhoto, setBigPhoto] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const night = useNight();
  const spots = (useCollection<Spot>('blacksiteSpots') ?? []).filter((x) => x.x != null && x.y != null);
  const fights = useCollection<Blacksite>('blacksites') ?? [];
  const events = useVisible<CalEvent>('events') ?? [];
  // Pins that show up after the page opened drop in.
  const firstIds = useRef<Set<string> | null>(null);
  if (pins && !firstIds.current) firstIds.current = new Set(pins.map((p) => p.id));
  const [scope, setScope] = useState<Scope | 'all'>('all');
  const [search, setSearch] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; dist?: number; k?: number } | null>(null);

  const shown = useMemo(
    () =>
      (pins ?? [])
        .filter((p) => !hidden.has(p.type) && (scope === 'all' || p.scope === scope))
        .filter((p) => !search || `${p.name} ${p.note ?? ''} ${p.postal ?? ''}`.toLowerCase().includes(search.toLowerCase().replace(/^postal\s*/, '')))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [pins, hidden, scope, search],
  );
  const sel = (pins ?? []).find((p) => p.id === selected);
  // Opened from an event or a banner: ?pin=<id> centers on it.
  const [params] = useSearchParams();
  const opened = useRef(false);
  useEffect(() => {
    const id = params.get('pin');
    const p = id && (pins ?? []).find((x) => x.id === id);
    if (p && !opened.current && box.current) {
      opened.current = true;
      setTimeout(() => center(p), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, params]);
  // The week's events tied to a pin or a blacksite location.
  const today = keyOf(Date.now());
  const upcoming = events
    .filter((e) => e.pinId)
    .flatMap((e) => occurrences(e, today, addDays(today, 7)).slice(0, 1).map((o) => ({ e, o })))
    .map(({ e, o }) => {
      const at = e.pinId!.startsWith('spot:') ? spots.find((x) => `spot:${x.id}` === e.pinId) : (pins ?? []).find((p) => p.id === e.pinId);
      return at ? { id: e.id, x: at.x!, y: at.y!, label: e.title, sub: `${o.at.toLocaleDateString('en-US', { weekday: 'short' })} ${timeLabel(o.at)}`, color: eventKind(e.kind).color } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const canEdit = (p: Pin) => p.owner === me.id || (lead && p.scope !== 'personal');

  // Keep the map inside its frame.
  // Zoomed all the way out, the whole map fits in the frame.
  const fitK = () => {
    const el = box.current;
    return el ? Math.min(1, el.clientHeight / (el.clientWidth * aspect)) : 1;
  };
  const clamp = (v: { k: number; x: number; y: number }) => {
    const el = box.current;
    if (!el) return v;
    const w = el.clientWidth;
    const vh = el.clientHeight;
    const k = Math.min(MAX, Math.max(fitK(), v.k));
    const cw = w * k;
    const ch = w * aspect * k;
    const x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, v.x));
    const y = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, v.y));
    return { k, x, y };
  };
  useEffect(() => {
    setView(clamp({ k: 0, x: 0, y: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);
  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const k = Math.min(MAX, Math.max(fitK(), v.k * factor));
      const f = k / v.k;
      return clamp({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });
  const center = (p: Pin, k = Math.max(view.k, 3)) => {
    const el = box.current!;
    const w = el.clientWidth;
    setView(clamp({ k, x: el.clientWidth / 2 - p.x * w * k, y: el.clientHeight / 2 - p.y * w * aspect * k }));
    setSelected(p.id);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: RPointerEvent) {
    box.current!.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, local(e));
    const pts = [...ptrs.current.values()];
    if (pts.length === 2) drag.current = { x: 0, y: 0, vx: view.x, vy: view.y, moved: true, dist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y), k: view.k };
    else drag.current = { ...local(e), vx: view.x, vy: view.y, moved: false };
  }
  function move(e: RPointerEvent) {
    if (!ptrs.current.has(e.pointerId) || !drag.current) return;
    ptrs.current.set(e.pointerId, local(e));
    const pts = [...ptrs.current.values()];
    const d = drag.current;
    if (pts.length === 2 && d.dist) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      zoomAt((d.k! * (dist / d.dist)) / view.k, mid.x, mid.y);
      return;
    }
    const p = local(e);
    if (Math.hypot(p.x - d.x, p.y - d.y) > 5) d.moved = true;
    if (d.moved) setView((v) => clamp({ ...v, x: d.vx + p.x - d.x, y: d.vy + p.y - d.y }));
  }
  function up(e: RPointerEvent) {
    const d = drag.current;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size) return;
    drag.current = null;
    if (!d || d.moved) return;
    // A tap.
    const p = local(e);
    const w = box.current!.clientWidth;
    const at = { x: (p.x - view.x) / (w * view.k), y: (p.y - view.y) / (w * aspect * view.k) };
    if (at.x < 0 || at.x > 1 || at.y < 0 || at.y > 1) return;
    if (mode === 'add') {
      setNewAt(at);
      setMode('look');
    } else if (mode === 'move' && sel) {
      savePin(sel, at);
      setMode('look');
    } else setSelected(null);
  }

  const scopeChips: { id: Scope | 'all'; label: string; icon?: typeof Lock }[] = [
    { id: 'all', label: 'All' },
    { id: 'gang', label: 'Family', icon: Users },
    { id: 'personal', label: 'Mine', icon: Lock },
    { id: 'limited', label: 'Limited', icon: ShieldHalf },
  ];

  return (
    <>
      <PageHeader
        icon={MapIcon}
        kicker="City"
        title="Map"
        sub="Where our stuff is. Drop a pin with its postal, a photo and how to get in. Blacksite locations and the week’s events show too."
        actions={
          <button className={mode === 'add' ? 'btn-ghost' : 'btn-gold'} onClick={() => setMode(mode === 'add' ? 'look' : 'add')}>
            {mode === 'add' ? (
              <>
                <X className="size-4" /> Cancel
              </>
            ) : (
              <>
                <Plus className="size-4" /> Drop a pin
              </>
            )}
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <div
            ref={box}
            className={`relative h-[70dvh] touch-none overflow-hidden border border-line bg-[#05090c] select-none ${mode !== 'look' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: '100%', transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              <img
                src={src}
                alt="City map"
                draggable={false}
                className="block w-full"
                onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth || 1.5)}
                onError={() => src !== PLACEHOLDER && setSrc(PLACEHOLDER)}
              />
              {!hidden.has('_turf') && <ZoneLayer zones={rivals.flatMap((g) => (g.zones ?? []).map((zone) => ({ gang: g, zone })))} />}
              {!hidden.has('_sightings') &&
                sightings
                  .filter((s) => s.x != null && s.y != null && freshSighting(s))
                  .map((s) => {
                    const g = rivals.find((r) => r.id === s.gangId);
                    return <Extra key={s.id} x={s.x!} y={s.y!} k={view.k} kind="sighting" label={`${g?.name ?? 'Rivals'} spotted`} sub={ago(s.at)} />;
                  })}
              {!hidden.has('_spots') &&
                spots.map((x) => {
                  const last = fights.filter((f) => spotOf(f, spots)?.id === x.id).sort((a, b) => b.at.toMillis() - a.at.toMillis())[0];
                  return <Extra key={x.id} x={x.x!} y={x.y!} k={view.k} kind="spot" label={x.name} tone={last?.result} />;
                })}
              {!hidden.has('_events') && upcoming.map((u) => <Extra key={u.id} x={u.x} y={u.y} k={view.k} kind="event" label={u.label} sub={u.sub} />)}
              {shown.map((p) => (
                <Marker key={p.id} pin={p} k={view.k} selected={p.id === selected} fresh={!!firstIds.current && !firstIds.current.has(p.id)} onClick={() => (mode === 'look' ? setSelected(p.id) : null)} />
              ))}
            </div>

            {night && <div className="map-night" aria-hidden />}
            {mode !== 'look' && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="hud flex items-center gap-2 px-3 py-1.5 text-sm text-gold-100">
                  <Crosshair className="size-4 text-gold-400" /> {mode === 'add' ? 'Tap the map where the pin goes' : `Tap the new spot for ${sel?.name}`}
                </span>
              </div>
            )}

            <div className="absolute right-3 bottom-3 flex flex-col gap-1">
              <button className="btn-ghost size-9 justify-center bg-void/80 p-0" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(1.5, box.current!.clientWidth / 2, box.current!.clientHeight / 2)} aria-label="Zoom in">
                <Plus className="size-4" />
              </button>
              <button className="btn-ghost size-9 justify-center bg-void/80 p-0" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(1 / 1.5, box.current!.clientWidth / 2, box.current!.clientHeight / 2)} aria-label="Zoom out">
                <Minus className="size-4" />
              </button>
            </div>

            {sel && mode === 'look' && (
              <div className="hud absolute bottom-3 left-3 max-w-[calc(100%-5rem)] p-3 sm:max-w-sm" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-2">
                  {(() => {
                    const t = pinType(sel.type);
                    return <t.icon className="mt-0.5 size-5 shrink-0" style={{ color: t.color }} />;
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="font-hud text-lg leading-tight font-bold text-gold-100">{sel.name}</p>
                    <p className="text-xs text-smoke">
                      {pinType(sel.type).label} · {audienceLabel(sel, rankById)}
                    </p>
                    {sel.postal && (
                      <button
                        className="mt-1 inline-flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-gold-200 hover:text-gold-50"
                        onClick={() => navigator.clipboard?.writeText(`postal ${sel.postal}`).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
                        title="Copy for chat"
                      >
                        postal {sel.postal} <Copy className="size-3" /> {copied && <span className="text-ok">copied</span>}
                      </button>
                    )}
                    {sel.note && <p className="mt-1.5 text-sm whitespace-pre-wrap text-ash">{sel.note}</p>}
                    {sel.access && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-gold-100">
                        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-gold-400" /> {sel.access}
                      </p>
                    )}
                    {sel.photo && (
                      <button onClick={() => setBigPhoto(sel.photo!)} className="mt-2 block">
                        <img src={sel.photo} alt="" className="max-h-28 rounded object-cover ring-1 ring-line" />
                      </button>
                    )}
                    {sel.stashId && <StashCounts id={sel.stashId} />}
                    <p className="mt-1.5 text-xs text-smoke">
                      Dropped by <MemberName id={sel.owner} /> · {ago(sel.at)}
                    </p>
                  </div>
                  <button className="text-smoke hover:text-gold-200" onClick={() => setSelected(null)} aria-label="Close">
                    <X className="size-4" />
                  </button>
                </div>
                {canEdit(sel) && (
                  <div className="mt-2 flex gap-1.5">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(sel)}>
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setMode('move')}>
                      <Move className="size-3.5" /> Move
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        if (confirm(`Remove the pin “${sel.name}”?`)) {
                          await removePin(sel);
                          setSelected(null);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {src === PLACEHOLDER && <p className="mt-2 text-xs text-smoke">Placeholder map. Send the server’s map and it goes here; pins you drop now are kept.</p>}
        </div>

        <Panel title={`Pins · ${shown.length}`}>
          <form
            className="mb-3 flex items-center gap-2 border-b border-line-soft"
            onSubmit={(e) => {
              e.preventDefault();
              if (shown[0]) center(shown[0]);
            }}
          >
            <Search className="size-4 text-smoke" />
            <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Search a name or postal" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="mb-2 flex flex-wrap gap-1">
            {scopeChips.map((c) => (
              <button key={c.id} onClick={() => setScope(c.id)} className={`chip inline-flex items-center gap-1 px-2.5 py-1 text-xs ${scope === c.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {c.icon && <c.icon className="size-3" />} {c.label}
              </button>
            ))}
          </div>
          <p className="label mb-1 text-[10px]">Layers</p>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {LAYERS.map((t) => {
              const on = !hidden.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    const n = new Set(hidden);
                    if (on) n.add(t.id);
                    else n.delete(t.id);
                    setHidden(n);
                  }}
                  className={`flex items-center gap-1.5 border px-2 py-1 text-left text-[11px] transition ${on ? 'border-line text-gold-100' : 'border-line-soft text-smoke opacity-50'}`}
                >
                  <t.icon className="size-3.5 shrink-0" style={{ color: t.color }} /> <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
          <ul className="max-h-[50dvh] divide-y divide-line-soft overflow-y-auto">
            {shown.map((p) => {
              const t = pinType(p.type);
              return (
                <li key={p.id}>
                  <button className={`flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-raised/50 ${p.id === selected ? 'bg-gold-400/10' : ''}`} onClick={() => center(p)}>
                    <t.icon className="size-4 shrink-0" style={{ color: t.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gold-100">{p.name}</span>
                      <span className="block truncate text-[11px] text-smoke">
                        {p.postal ? `postal ${p.postal} · ` : ''}
                        {audienceLabel(p, rankById)}
                      </span>
                    </span>
                    {p.scope === 'personal' ? <Lock className="size-3.5 text-smoke" /> : p.scope === 'limited' ? <ShieldHalf className="size-3.5 text-smoke" /> : null}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="py-6 text-center text-sm text-smoke">No pins match.</li>}
          </ul>
        </Panel>
      </div>

      {newAt && <PinDialog at={newAt} onClose={() => setNewAt(null)} />}
      {editing && <PinDialog pin={editing} onClose={() => setEditing(null)} />}
      {bigPhoto && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4 cursor-zoom-out" onClick={() => setBigPhoto(null)}>
          <img src={bigPhoto} alt="" className="max-h-full max-w-full" />
        </div>
      )}
    </>
  );
}

export default function MapPageWithStash() {
  return (
    <NarcoticsProvider>
      <MapPage />
    </NarcoticsProvider>
  );
}
