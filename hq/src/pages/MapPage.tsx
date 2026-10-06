import { Crosshair, Lock, Map as MapIcon, Minus, Move, Pencil, Plus, ShieldHalf, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react';
import { AudiencePicker } from '../components/AudiencePicker';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { audienceLabel, GANG, useVisible, type AudienceDraft, type Scope } from '../lib/audience';
import { ago } from '../lib/format';
import { addPin, PIN_TYPES, pinType, removePin, savePin, type Pin } from '../lib/pins';

/** Your server's map goes in public/map/city.jpg; until then a placeholder shows. */
const MAP_SRC = '/map/city.jpg';
const PLACEHOLDER = '/map/placeholder.svg';
const MAX = 8;

function useLead() {
  const { myRank } = useHub();
  return !!myRank && (myRank.order === 0 || !!myRank.leadership);
}

function PinDialog({ pin, at, onClose }: { pin?: Pin; at?: { x: number; y: number }; onClose: () => void }) {
  const { me } = useHub();
  const lead = useLead();
  const [name, setName] = useState(pin?.name ?? '');
  const [type, setType] = useState(pin?.type ?? 'meet');
  const [note, setNote] = useState(pin?.note ?? '');
  const [aud, setAud] = useState<AudienceDraft>(pin ? { scope: pin.scope, ranks: pin.ranks, crewIds: pin.crewIds, minRank: pin.minRank ?? null } : { ...GANG });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const data = { name: name.trim().slice(0, 40), type, note: note.trim().slice(0, 300), ...aud };
    if (pin) await savePin(pin.id, data);
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
            {PIN_TYPES.map((t) => (
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
        <Field label="Note" hint="Postal, door code, who to ask for…">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <div>
          <span className="label mb-1.5 block">Who can see it</span>
          <AudiencePicker value={aud} onChange={setAud} limited={lead} />
          {!lead && <p className="mt-1 text-xs text-smoke">Leadership can also limit pins to certain ranks or crews.</p>}
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

function Marker({ pin, k, selected, onClick }: { pin: Pin; k: number; selected: boolean; onClick: () => void }) {
  const t = pinType(pin.type);
  return (
    <button
      className="absolute"
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: `translate(-50%, -100%) scale(${1 / k})`, transformOrigin: '50% 100%', zIndex: selected ? 5 : 2 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={pin.name}
    >
      <span className="relative flex flex-col items-center">
        <span
          className={`grid size-8 place-items-center rounded-full rounded-br-none rotate-45 shadow-lg ring-2 ${selected ? 'ring-white' : 'ring-black/60'}`}
          style={{ background: t.color }}
        >
          <t.icon className="size-4 -rotate-45 text-black/80" />
        </span>
        {pin.scope !== 'gang' && (
          <span className="absolute -top-1 -right-2 grid size-4 place-items-center rounded-full bg-void ring-1 ring-gold-500">
            {pin.scope === 'personal' ? <Lock className="size-2.5 text-gold-300" /> : <ShieldHalf className="size-2.5 text-gold-300" />}
          </span>
        )}
        {(selected || k >= 1.5) && (
          <span className="mt-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-gold-100">{pin.name}</span>
        )}
      </span>
    </button>
  );
}

export default function MapPage() {
  const { me, rankById, crewById } = useHub();
  const lead = useLead();
  const pins = useVisible<Pin>('pins');
  const [src, setSrc] = useState(MAP_SRC);
  const [aspect, setAspect] = useState(1.5);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [mode, setMode] = useState<'look' | 'add' | 'move'>('look');
  const [selected, setSelected] = useState<string | null>(null);
  const [newAt, setNewAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Pin | null>(null);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<Scope | 'all'>('all');
  const [search, setSearch] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; dist?: number; k?: number } | null>(null);

  const shown = useMemo(
    () =>
      (pins ?? [])
        .filter((p) => (types.size ? types.has(p.type) : true) && (scope === 'all' || p.scope === scope))
        .filter((p) => !search || `${p.name} ${p.note ?? ''}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [pins, types, scope, search],
  );
  const sel = (pins ?? []).find((p) => p.id === selected);
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
      savePin(sel.id, at);
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
        sub="Tap “Drop a pin”, then tap the map. Pins can be just yours, for the family, or (leadership) limited to ranks and crews."
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
              {shown.map((p) => (
                <Marker key={p.id} pin={p} k={view.k} selected={p.id === selected} onClick={() => (mode === 'look' ? setSelected(p.id) : null)} />
              ))}
            </div>

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
                      {pinType(sel.type).label} · {audienceLabel(sel, rankById, crewById)}
                    </p>
                    {sel.note && <p className="mt-1.5 text-sm whitespace-pre-wrap text-ash">{sel.note}</p>}
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
                          await removePin(sel.id);
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
          <input className="input mb-3" placeholder="Search pins" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mb-2 flex flex-wrap gap-1">
            {scopeChips.map((c) => (
              <button key={c.id} onClick={() => setScope(c.id)} className={`chip inline-flex items-center gap-1 px-2.5 py-1 text-xs ${scope === c.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {c.icon && <c.icon className="size-3" />} {c.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {PIN_TYPES.map((t) => {
              const on = types.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    const n = new Set(types);
                    if (on) n.delete(t.id);
                    else n.add(t.id);
                    setTypes(n);
                  }}
                  className="chip inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                  style={on ? { background: t.color, color: '#0a0a0b' } : { border: `1px solid ${t.color}55`, color: t.color }}
                >
                  <t.icon className="size-3" /> {t.label}
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
                      <span className="block truncate text-[11px] text-smoke">{audienceLabel(p, rankById, crewById)}</span>
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
    </>
  );
}
