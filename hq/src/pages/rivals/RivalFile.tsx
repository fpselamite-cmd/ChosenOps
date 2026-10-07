import { ArrowLeft, Car, Crosshair, Eye, ImagePlus, MapPin, Pencil, Plus, Shield, Skull, Trash2, Undo2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Empty, Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { ago, fmtDate } from '../../lib/format';
import { squareImage } from '../../lib/image';
import {
  addIncident,
  addNote,
  INCIDENT_KINDS,
  RELATIONS,
  relationOf,
  removeIncident,
  removeMember,
  removeNote,
  removeRival,
  saveMember,
  saveRival,
  saveZones,
  setRelation,
  THREATS,
  type IncidentKind,
  type Relation,
  type Rival,
  type RivalCar,
  type RivalMember,
  type Threat,
  type Zone,
} from '../../lib/rivals';
import { recordVs, useRivalData, ZoneLayer, ZoomMap } from './common';

export const threatOf = (t?: Threat) => THREATS.find((x) => x.id === t) ?? THREATS[0]!;

// ---------- dialogs ----------

export function GangDialog({ gang, onClose, onSaved }: { gang: Rival | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const [g, setG] = useState<Omit<Rival, 'id' | 'at'>>(
    gang ?? { name: '', color: '#a855f7', logo: null, relation: 'tense', relationLog: [], zones: [], turfNote: '', hangouts: '', cars: [], size: 0, weapons: '', danger: 3, notes: '' },
  );
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const cars = g.cars ?? [];
  const setCar = (i: number, p: Partial<RivalCar>) => setG({ ...g, cars: cars.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  return (
    <Modal title={gang ? `Edit ${gang.name}` : 'New case file'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!g.name.trim()) return;
          setBusy(true);
          const clean = { ...g, name: g.name.trim().slice(0, 40), cars: cars.filter((c) => c.model.trim() || c.plate.trim()) };
          const ref = await saveRival(gang?.id ?? null, clean);
          onSaved?.(gang?.id ?? (ref as { id: string }).id);
          onClose();
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => file.current?.click()} className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2" style={{ borderColor: g.color }} title="Logo">
            {g.logo ? <img src={g.logo} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-smoke" />}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setG({ ...g, logo: await squareImage(e.target.files[0], 160, 0.85) })} />
          <Field label="Gang name">
            <input className="input" value={g.name} maxLength={40} onChange={(e) => setG({ ...g, name: e.target.value })} autoFocus required />
          </Field>
          <Field label="Color">
            <input type="color" className="h-10 w-16 cursor-pointer bg-transparent" value={g.color} onChange={(e) => setG({ ...g, color: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Size (about)">
            <input className="input font-mono" inputMode="numeric" value={g.size || ''} onChange={(e) => setG({ ...g, size: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
          <Field label="Weapons">
            <input className="input" value={g.weapons ?? ''} maxLength={80} placeholder="SMGs, a few rifles" onChange={(e) => setG({ ...g, weapons: e.target.value })} />
          </Field>
          <Field label={`How dangerous · ${g.danger ?? 3}/5`}>
            <input type="range" min={1} max={5} value={g.danger ?? 3} onChange={(e) => setG({ ...g, danger: Number(e.target.value) })} className="w-full accent-red-500" />
          </Field>
        </div>
        <Field label="Hangouts">
          <input className="input" value={g.hangouts ?? ''} maxLength={200} placeholder="Grove St basketball court, the motel on Route 68" onChange={(e) => setG({ ...g, hangouts: e.target.value })} />
        </Field>
        <Field label="Turf (in words)">
          <input className="input" value={g.turfNote ?? ''} maxLength={200} placeholder="Davis down to the docks" onChange={(e) => setG({ ...g, turfNote: e.target.value })} />
        </Field>
        <div>
          <p className="label mb-1.5">Known cars</p>
          <div className="space-y-1.5">
            {cars.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="Model" value={c.model} onChange={(e) => setCar(i, { model: e.target.value })} />
                <input className="input w-32 font-mono uppercase" placeholder="Plate" value={c.plate} onChange={(e) => setCar(i, { plate: e.target.value.toUpperCase() })} />
                <input className="input w-28" placeholder="Color" value={c.color} onChange={(e) => setCar(i, { color: e.target.value })} />
                <button type="button" className="text-smoke hover:text-red-300" onClick={() => setG({ ...g, cars: cars.filter((_, k) => k !== i) })} aria-label="Remove">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setG({ ...g, cars: [...cars, { model: '', plate: '', color: '' }] })}>
              <Plus className="size-3.5" /> Add a car
            </button>
          </div>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={g.notes ?? ''} maxLength={1500} onChange={(e) => setG({ ...g, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            Save file
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MemberDialog({ gangId, m, onClose }: { gangId: string; m: RivalMember | null; onClose: () => void }) {
  const [v, setV] = useState<Omit<RivalMember, 'id'>>(m ?? { name: '', role: '', photo: null, threat: 'medium', lastSeenAt: null, lastSeenWhere: '', notes: '' });
  const file = useRef<HTMLInputElement>(null);
  return (
    <Modal title={m ? `Edit ${m.name}` : 'Add a known member'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!v.name.trim()) return;
          await saveMember(gangId, m?.id ?? null, { ...v, name: v.name.trim().slice(0, 40), role: v.role.trim().slice(0, 40) });
          onClose();
        }}
      >
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => file.current?.click()} className="mugshot grid size-24 shrink-0 place-items-center overflow-hidden" title="Mugshot">
            {v.photo ? <img src={v.photo} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-smoke" />}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setV({ ...v, photo: await squareImage(e.target.files[0], 200, 0.8) })} />
          <div className="flex-1 space-y-3">
            <Field label="Name">
              <input className="input" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus required />
            </Field>
            <Field label="Role in their gang">
              <input className="input" value={v.role} maxLength={40} placeholder="Shot caller, runner…" onChange={(e) => setV({ ...v, role: e.target.value })} />
            </Field>
          </div>
        </div>
        <div>
          <p className="label mb-1.5">Threat</p>
          <div className="flex flex-wrap gap-1.5">
            {THREATS.map((t) => (
              <button type="button" key={t.id} onClick={() => setV({ ...v, threat: t.id })} className={`chip px-2.5 py-1 text-xs font-bold ${v.threat === t.id ? 'text-void' : 'bg-raised text-ash'}`} style={v.threat === t.id ? { background: t.color } : undefined}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-16" value={v.notes ?? ''} maxLength={500} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
        <div className="flex justify-between gap-2">
          {m ? (
            <button type="button" className="btn-danger" onClick={() => confirm(`Remove ${m.name}?`) && removeMember(gangId, m.id).then(onClose)}>
              <Trash2 className="size-4" />
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold">Save</button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

/** High Table draws turf: tap corners on the map, close the shape, name it. */
function TurfDialog({ gang, others, onClose }: { gang: Rival; others: Rival[]; onClose: () => void }) {
  const [zones, setZones] = useState<Zone[]>(gang.zones ?? []);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [label, setLabel] = useState('');
  const shown = [...others.flatMap((o) => (o.zones ?? []).map((z) => ({ gang: { name: o.name, color: `${o.color}` }, zone: z }))), ...zones.map((z) => ({ gang, zone: z })), ...(pts.length > 1 ? [{ gang, zone: { label: '', points: pts } }] : [])];
  return (
    <Modal title={`${gang.name} turf`} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-sm text-ash">Tap the map to drop corners. Three or more, then close the shape. Other gangs’ turf shows too. Zoom in for city blocks.</p>
        <ZoomMap onPick={(x, y) => setPts([...pts, { x, y }])} focus={(gang.zones ?? [])[0]?.points}>
          <ZoneLayer zones={shown} />
          {pts.map(({ x, y }, i) => (
            <span key={i} className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white" style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: gang.color }} />
          ))}
        </ZoomMap>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-48 py-1" placeholder="Zone name (optional)" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-gold btn-sm" disabled={pts.length < 3} onClick={() => (setZones([...zones, { label: label.trim(), points: pts }]), setPts([]), setLabel(''))}>
            <Plus className="size-3.5" /> Close shape
          </button>
          <button className="btn-ghost btn-sm" disabled={!pts.length} onClick={() => setPts(pts.slice(0, -1))}>
            <Undo2 className="size-3.5" /> Undo point
          </button>
          <span className="ml-auto text-xs text-smoke">{zones.length === 1 ? '1 zone' : `${zones.length} zones`}</span>
        </div>
        {zones.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {zones.map((z, i) => (
              <li key={i} className="chip flex items-center gap-1 px-2 py-0.5 text-xs" style={{ boxShadow: `inset 0 0 0 1px ${gang.color}` }}>
                {z.label || `Zone ${i + 1}`}
                <button className="text-smoke hover:text-red-300" onClick={() => setZones(zones.filter((_, k) => k !== i))} aria-label="Remove">
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" onClick={() => saveZones(gang.id, zones).then(onClose)}>
            Save turf
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RelationDialog({ gang, onClose }: { gang: Rival; onClose: () => void }) {
  const { me } = useHub();
  const [rel, setRel] = useState<Relation>(gang.relation);
  const [note, setNote] = useState('');
  return (
    <Modal title={`Where we stand with ${gang.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {RELATIONS.map((r) => (
            <button key={r.id} onClick={() => setRel(r.id)} className={`chip px-3 py-1 text-xs font-bold ${rel === r.id ? 'text-void' : 'bg-raised text-ash'}`} style={rel === r.id ? { background: r.color } : { boxShadow: `inset 0 0 0 1px ${r.color}` }}>
              {r.label}
            </button>
          ))}
        </div>
        <Field label="Why (shows in the history)">
          <input className="input" value={note} maxLength={120} placeholder="They hit our grow on Route 68" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" onClick={() => setRelation(me, gang, rel, note).then(onClose)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- the file ----------

export default function RivalFile({ gang, onBack, onSpot }: { gang: Rival; onBack: () => void; onSpot: () => void }) {
  const { me, isLead } = useHub();
  const d = useRivalData();
  const membersQ = useMemo(() => `rivals/${gang.id}/members`, [gang.id]);
  const members = (useCollection<RivalMember>(membersQ) ?? []).sort((a, b) => THREATS.findIndex((t) => t.id === b.threat) - THREATS.findIndex((t) => t.id === a.threat));
  const [dialog, setDialog] = useState<'edit' | 'turf' | 'relation' | null>(null);
  const [member, setMember] = useState<RivalMember | 'new' | null>(null);
  const [inc, setInc] = useState({ kind: 'fight' as IncidentKind, title: '', where: '', notes: '', outcome: null as 'win' | 'loss' | 'draw' | null });
  const [note, setNote] = useState('');
  const rel = relationOf(gang.relation);
  const rec = recordVs(gang.name, d.fights);
  const incidents = d.incidents.filter((i) => i.gangId === gang.id);
  const notes = d.notes.filter((n) => n.gangId === gang.id);
  const seen = d.sightings.filter((s) => s.gangId === gang.id).slice(0, 6);
  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1.5 text-sm text-smoke hover:text-gold-200" onClick={onBack}>
        <ArrowLeft className="size-4" /> All case files
      </button>

      <div className="case-open relative overflow-hidden p-5 sm:p-6">
        <span className="case-stamp" style={{ color: rel.color, borderColor: rel.color }}>
          {rel.label}
        </span>
        <div className="flex flex-wrap items-center gap-5">
          <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 bg-black/40" style={{ borderColor: gang.color }}>
            {gang.logo ? <img src={gang.logo} alt="" className="size-full object-cover" /> : <Shield className="size-10" style={{ color: gang.color }} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="case-label">Case file · {gang.id.slice(0, 6).toUpperCase()}</p>
            <h2 className="font-display text-4xl font-bold" style={{ color: gang.color }}>
              {gang.name}
            </h2>
            <p className="mt-1 text-sm">
              Blacksites: <b className="text-green-700">{rec.w}W</b> · <b className="text-red-700">{rec.l}L</b> · {rec.n} fights · {members.length} known members
            </p>
          </div>
          <div className="flex basis-full flex-wrap gap-2 sm:justify-end">
            <button className="btn-ghost btn-sm" onClick={onSpot}>
              <Eye className="size-3.5" /> Spotted them
            </button>
            {isLead && (
              <>
                <button className="btn-ghost btn-sm" onClick={() => setDialog('relation')}>
                  Relation
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setDialog('turf')}>
                  <MapPin className="size-3.5" /> Draw turf
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setDialog('edit')}>
                  <Pencil className="size-3.5" /> Edit
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="case-label">Strength</p>
            <p>~{gang.size || '?'} members</p>
            <p className="flex gap-0.5" title={`${gang.danger ?? 3}/5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Skull key={i} className={`size-4 ${i < (gang.danger ?? 3) ? 'text-red-700' : 'opacity-20'}`} />
              ))}
            </p>
            {gang.weapons && <p className="text-xs">{gang.weapons}</p>}
          </div>
          <div>
            <p className="case-label">Turf</p>
            <p>{gang.turfNote || '—'}</p>
            <p className="text-xs">{(gang.zones ?? []).length === 1 ? '1 zone' : `${(gang.zones ?? []).length} zones`} on the Map</p>
          </div>
          <div>
            <p className="case-label">Hangouts</p>
            <p>{gang.hangouts || '—'}</p>
          </div>
          <div>
            <p className="case-label">Cars</p>
            {(gang.cars ?? []).length ? (
              <ul>
                {gang.cars!.map((c, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <Car className="size-3.5" /> {c.color} {c.model} <span className="case-plate">{c.plate}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>
        </div>
        {gang.notes && <p className="case-typed mt-4 whitespace-pre-wrap">{gang.notes}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title={`Known members · ${members.length}`}
          right={
            isLead && (
              <button className="btn-ghost btn-sm" onClick={() => setMember('new')}>
                <Plus className="size-3.5" /> Add
              </button>
            )
          }
        >
          {members.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {members.map((m) => {
                const t = threatOf(m.threat);
                return (
                  <button key={m.id} className="text-left" onClick={() => isLead && setMember(m)} disabled={!isLead}>
                    <div className="mugshot relative aspect-square overflow-hidden">
                      {m.photo ? <img src={m.photo} alt="" className="size-full object-cover grayscale-[40%]" /> : <span className="grid size-full place-items-center font-display text-3xl text-smoke">?</span>}
                      <span className="absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-[10px] font-black tracking-wider text-white uppercase" style={{ background: t.color }}>
                        {t.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-hud font-bold text-gold-100">{m.name}</p>
                    <p className="truncate text-xs text-smoke">{m.role || '—'}</p>
                    <p className="truncate text-[11px] text-smoke">{m.lastSeenAt ? `Seen ${ago(m.lastSeenAt)}${m.lastSeenWhere ? ` · ${m.lastSeenWhere}` : ''}` : 'Not seen yet'}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty title="Nobody on file">{isLead ? 'Add who you know: name, role, mugshot, threat.' : 'High Table adds who we know.'}</Empty>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Relation history">
            <ul className="space-y-1.5 text-sm">
              {(gang.relationLog ?? []).map((r, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2">
                  <span className="chip px-2 py-0.5 text-[10px] font-bold text-void" style={{ background: relationOf(r.rel).color }}>
                    {relationOf(r.rel).label}
                  </span>
                  <span className="text-ash">{r.note}</span>
                  <span className="ml-auto text-[11px] text-smoke">
                    {r.by} · {fmtDate(new Date(r.at))}
                  </span>
                </li>
              ))}
              {!(gang.relationLog ?? []).length && <li className="text-smoke">No changes logged.</li>}
            </ul>
          </Panel>
          <Panel title="Recent sightings">
            {seen.length ? (
              <ul className="space-y-1.5 text-sm">
                {seen.map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-2">
                    <Crosshair className="mt-0.5 size-3.5 text-red-300" />
                    <span className="text-ash">
                      {s.memberIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(', ') || 'Some of them'}
                      {s.postal && ` · postal ${s.postal}`}
                      {s.note && <span className="text-smoke"> · {s.note}</span>}
                    </span>
                    <span className="ml-auto text-[11px] text-smoke">
                      {s.byName} · {ago(s.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">No sightings yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={`Incidents · ${incidents.length + rec.n}`}>
          <form
            className="mb-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!inc.title.trim()) return;
              void addIncident(me, { gangId: gang.id, ...inc, title: inc.title.trim().slice(0, 80), notes: inc.notes.slice(0, 1000), where: inc.where.slice(0, 40) });
              setInc({ kind: 'fight', title: '', where: '', notes: '', outcome: null });
            }}
          >
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto py-1 text-sm" value={inc.kind} onChange={(e) => setInc({ ...inc, kind: e.target.value as IncidentKind })}>
                {INCIDENT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input className="input flex-1 py-1" placeholder="What happened" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input className="input w-36 py-1" placeholder="Where" value={inc.where} onChange={(e) => setInc({ ...inc, where: e.target.value })} />
              <select className="input w-auto py-1 text-sm" value={inc.outcome ?? ''} onChange={(e) => setInc({ ...inc, outcome: (e.target.value || null) as typeof inc.outcome })}>
                <option value="">Outcome…</option>
                <option value="win">We came out on top</option>
                <option value="draw">Even</option>
                <option value="loss">They did</option>
              </select>
              <input className="input flex-1 py-1" placeholder="Details (optional)" value={inc.notes} onChange={(e) => setInc({ ...inc, notes: e.target.value })} />
              <button className="btn-gold btn-sm">
                <Plus className="size-3.5" /> Log
              </button>
            </div>
          </form>
          <ul className="divide-y divide-line-soft text-sm">
            {[
              ...incidents.map((i) => ({ key: i.id, at: i.at?.toMillis() ?? Date.now(), kind: INCIDENT_KINDS.find((k) => k.id === i.kind)?.label ?? i.kind, title: i.title, where: i.where, outcome: i.outcome, notes: i.notes, by: i.byName, own: i.by === me.id, id: i.id })),
              ...rec.fights.map((f) => ({ key: `f${f.id}`, at: f.at.toMillis(), kind: 'Blacksite', title: f.zone, where: '', outcome: f.result === 'win' ? 'win' : f.result === 'loss' ? 'loss' : 'draw', notes: f.notes ?? '', by: '', own: false, id: '' })),
            ]
              .sort((a, b) => b.at - a.at)
              .slice(0, 40)
              .map((i) => (
                <li key={i.key} className="flex flex-wrap items-baseline gap-2 py-2">
                  <span className="label w-24 shrink-0 text-[9px] text-gold-500">{i.kind}</span>
                  <span className="min-w-0 flex-1 text-ash">
                    <b className="text-gold-100">{i.title}</b>
                    {i.where && <span className="text-smoke"> · {i.where}</span>}
                    {i.notes && <span className="block text-xs text-smoke">{i.notes}</span>}
                  </span>
                  {i.outcome && <span className={`text-xs font-bold ${i.outcome === 'win' ? 'text-ok' : i.outcome === 'loss' ? 'text-red-300' : 'text-gold-300'}`}>{i.outcome === 'win' ? 'Ours' : i.outcome === 'loss' ? 'Theirs' : 'Even'}</span>}
                  <span className="text-[11px] text-smoke">{fmtDate(new Date(i.at))}</span>
                  {i.id && (i.own || isLead) && (
                    <button className="text-smoke hover:text-red-300" onClick={() => removeIncident(i.id)} aria-label="Remove">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </Panel>
        <Panel title={`Notes from the family · ${notes.length}`}>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              void addNote(me, gang.id, note.trim());
              setNote('');
            }}
          >
            <input className="input" placeholder="Something you know about them…" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-gold btn-sm">Add</button>
          </form>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="case-sticky relative p-2.5 text-sm">
                {n.text}
                <span className="mt-1 block text-[11px] opacity-70">
                  {n.byName} · {ago(n.at)}
                </span>
                {(n.by === me.id || isLead) && (
                  <button className="absolute top-1.5 right-1.5 opacity-50 hover:opacity-100" onClick={() => removeNote(n.id)} aria-label="Remove">
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
            {!notes.length && <li className="text-sm text-smoke">No notes yet.</li>}
          </ul>
        </Panel>
      </div>

      {isLead && (
        <div className="flex justify-end">
          <button className="text-xs text-smoke hover:text-red-300" onClick={() => confirm(`Close the ${gang.name} file for good?`) && removeRival(gang.id).then(onBack)}>
            Delete this case file
          </button>
        </div>
      )}
      {dialog === 'edit' && <GangDialog gang={gang} onClose={() => setDialog(null)} />}
      {dialog === 'turf' && <TurfDialog gang={gang} others={d.gangs.filter((g) => g.id !== gang.id)} onClose={() => setDialog(null)} />}
      {dialog === 'relation' && <RelationDialog gang={gang} onClose={() => setDialog(null)} />}
      {member && <MemberDialog gangId={gang.id} m={member === 'new' ? null : member} onClose={() => setMember(null)} />}
    </div>
  );
}
