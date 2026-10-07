import { Crosshair, Eye, FolderOpen, Link2, Plus, Shield, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { PageHeader, Panel, Tabs } from '../../components/Page';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { ago } from '../../lib/format';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
import {
  cancelBounty,
  claimBounty,
  DEFAULT_LEGEND,
  freshSighting,
  payBounty,
  postBounty,
  rejectClaim,
  relationOf,
  removeSighting,
  saveBoard,
  spot,
  type Board,
  type BoardLink,
  type BoardNode,
  type Bounty,
  type Rival,
  type RivalMember,
} from '../../lib/rivals';
import { recordVs, useRivalData, ZoneLayer, ZoomMap } from './common';
import RivalFile, { GangDialog, threatOf } from './RivalFile';

type View = 'files' | 'board' | 'bounties' | 'sightings';

/** One gang's known members (empty until a gang is picked). */
function useGangMembers(gangId: string) {
  const path = useMemo(() => `rivals/${gangId || '_'}/members`, [gangId]);
  return (useCollection<RivalMember>(path, !!gangId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- spotted ----------

function SpotDialog({ gangs, gangId, onClose }: { gangs: Rival[]; gangId?: string; onClose: () => void }) {
  const { me } = useHub();
  const [g, setG] = useState(gangId ?? gangs[0]?.id ?? '');
  const members = useGangMembers(g);
  const [who, setWho] = useState<string[]>([]);
  const [postal, setPostal] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const gang = gangs.find((x) => x.id === g);
  return (
    <Modal title="Spotted them" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!g) return;
          setBusy(true);
          await spot(me, { gangId: g, memberIds: who.slice(0, 12), postal: postal.trim().slice(0, 10), note: note.trim(), x: at?.x ?? null, y: at?.y ?? null });
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Which gang">
            <select className="input" value={g} onChange={(e) => (setG(e.target.value), setWho([]))}>
              {gangs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Postal">
            <input className="input font-mono" value={postal} maxLength={10} placeholder="8042" onChange={(e) => setPostal(e.target.value)} />
          </Field>
        </div>
        {!!members.length && (
          <Field label="Who was there (tap)">
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = who.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setWho(on ? who.filter((x) => x !== m.id) : [...who, m.id])}
                    className={`chip px-2.5 py-1 text-xs ${on ? 'border-red-400 bg-red-500/20 text-red-100' : 'text-ash'}`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="What they were up to">
          <input className="input" value={note} maxLength={140} placeholder="Three cars outside the Pillbox, strapped" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Where on the map (optional, tap) · shows for 6 hours">
          <ZoomMap height="max-h-80" onPick={(x, y) => setAt({ x, y })} focus={gang?.zones?.[0]?.points}>
            {gang && <ZoneLayer zones={(gang.zones ?? []).map((zone) => ({ gang, zone }))} />}
            {at && (
              <span className="pointer-events-none absolute" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transform: 'translate(-50%, -50%)' }}>
                <span className="map-extra sighting">
                  <Crosshair className="size-3.5" />
                </span>
              </span>
            )}
          </ZoomMap>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy || !g}>
            <Eye className="size-4" /> Report it
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- case files ----------

function Files({ gangs, fights, onOpen }: { gangs: Rival[]; fights: ReturnType<typeof useRivalData>['fights']; onOpen: (id: string) => void }) {
  const { isLead } = useHub();
  if (!gangs.length) return <Empty icon={<FolderOpen className="size-8" />} title="No case files yet">{isLead ? 'Open a file on a gang with “New case file”.' : 'High Table opens files on the gangs we deal with.'}</Empty>;
  return (
    <div className="grid gap-x-5 gap-y-8 pt-3 sm:grid-cols-2 xl:grid-cols-3">
      {gangs.map((g) => {
        const rel = relationOf(g.relation);
        const rec = recordVs(g.name, fights);
        return (
          <button key={g.id} className="case-folder" data-tab={g.name} onClick={() => onOpen(g.id)}>
            <span className="clip" aria-hidden />
            <span className="case-stamp" style={{ color: rel.color, borderColor: rel.color }}>
              {rel.label}
            </span>
            <span className="flex items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border-[3px] bg-black/40" style={{ borderColor: g.color }}>
                {g.logo ? <img src={g.logo} alt="" className="size-full object-cover" /> : <Shield className="size-6" style={{ color: g.color }} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-xl font-bold" style={{ color: g.color }}>
                  {g.name}
                </span>
                <span className="case-label">
                  ~{g.size || '?'} strong · {rec.w}W {rec.l}L
                </span>
              </span>
            </span>
            <span className="case-typed mt-3 line-clamp-2 block min-h-[2lh] text-xs">{g.turfNote || g.hangouts || g.notes || 'Nothing typed up yet.'}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- bounties ----------

function PostBounty({ gangs, onClose }: { gangs: Rival[]; onClose: () => void }) {
  const { me } = useHub();
  const [g, setG] = useState(gangs[0]?.id ?? '');
  const members = useGangMembers(g);
  const [mid, setMid] = useState('');
  const [amount, setAmount] = useState(0);
  const [cash, setCash] = useState<'dirty' | 'clean'>('dirty');
  const [reason, setReason] = useState('');
  const m = members.find((x) => x.id === mid);
  return (
    <Modal title="Put out a bounty" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!m || amount <= 0) return;
          await postBounty(me, { gangId: g, memberId: m.id, memberName: m.name, photo: m.photo ?? null, amount, cash, reason: reason.trim().slice(0, 140) });
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gang">
            <select className="input" value={g} onChange={(e) => (setG(e.target.value), setMid(''))}>
              {gangs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Who" hint={!members.length ? 'Add them to the case file first.' : undefined}>
            <select className="input" value={mid} onChange={(e) => setMid(e.target.value)} required>
              <option value="">Pick…</option>
              {members.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reward">
            <input className="input font-mono" inputMode="numeric" value={amount || ''} placeholder="25000" onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} required />
          </Field>
          <Field label="Paid in">
            <select className="input" value={cash} onChange={(e) => setCash(e.target.value as 'dirty' | 'clean')}>
              <option value="dirty">Dirty</option>
              <option value="clean">Clean</option>
            </select>
          </Field>
        </div>
        <Field label="Why (on the poster)">
          <input className="input" value={reason} maxLength={140} placeholder="Shot up the lot on Grove" onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-xs text-smoke">When a claim is confirmed, the reward is owed from the gang bank and shows on the Money page as a payout.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!m || amount <= 0}>
            Post it
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Poster({ b, gang }: { b: Bounty; gang?: Rival }) {
  const { me, isLead, settings } = useHub();
  const [claiming, setClaiming] = useState(false);
  const [proof, setProof] = useState('');
  const done = b.status === 'paid' || b.status === 'cancelled';
  return (
    <div className={`wanted ${done ? 'opacity-60' : ''}`}>
      <p className="wanted-head">WANTED</p>
      <p className="wanted-by mt-1">by the Chosen</p>
      <div className="wanted-photo relative">
        {b.photo ? <img src={b.photo} alt="" /> : <span className="grid size-full place-items-center font-display text-5xl text-gold-700">?</span>}
        {b.status !== 'open' && (
          <span className="wanted-seal" style={{ color: b.status === 'paid' ? '#22c55e' : b.status === 'claimed' ? '#facc15' : '#94a3b8' }}>
            {b.status === 'paid' ? 'Paid' : b.status === 'claimed' ? 'Claimed' : 'Called off'}
          </span>
        )}
      </div>
      <p className="wanted-name">{b.memberName}</p>
      {gang && (
        <p className="text-xs font-bold tracking-wider uppercase" style={{ color: gang.color }}>
          {gang.name}
        </p>
      )}
      {b.reason && <p className="mt-1 text-xs text-gold-200/80 italic">“{b.reason}”</p>}
      <p className="wanted-reward">{money(b.amount)}</p>
      <p className="wanted-by">{b.cash} cash · posted {ago(b.at)}</p>

      {b.status === 'claimed' && (
        <p className="mt-2 border border-gold-700/50 bg-black/40 p-2 text-left text-xs text-ash">
          <b className="text-gold-200">{b.claimName}</b> claims it: {b.claimProof}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {b.status === 'open' && !claiming && (
          <button className="btn-gold btn-sm" onClick={() => setClaiming(true)}>
            Claim it
          </button>
        )}
        {b.status === 'claimed' && isLead && (
          <>
            <button className="btn-gold btn-sm" onClick={() => payBounty(me, b)}>
              Confirm & pay
            </button>
            <button className="btn-ghost btn-sm" onClick={() => rejectClaim(b)}>
              Reject
            </button>
          </>
        )}
        {(b.status === 'open' || b.status === 'claimed') && isLead && (
          <button className="btn-ghost btn-sm" onClick={() => confirm('Call off this bounty?') && cancelBounty(b)}>
            Call off
          </button>
        )}
      </div>
      {claiming && (
        <form
          className="mt-3 space-y-2 text-left"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!proof.trim()) return;
            await claimBounty(me, b, proof.trim());
            setClaiming(false);
          }}
        >
          <textarea className="input min-h-16 text-sm" value={proof} maxLength={300} placeholder="Proof: when, where, a clip or screenshot link" onChange={(e) => setProof(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setClaiming(false)}>
              Cancel
            </button>
            <button className="btn-gold btn-sm">Send claim</button>
          </div>
        </form>
      )}
      <p className="wanted-foot">{settings.motto || 'Chosen by blood. Bound in gold.'}</p>
    </div>
  );
}

function Bounties({ bounties, gangs }: { bounties: Bounty[]; gangs: Rival[] }) {
  const { isLead } = useHub();
  const [posting, setPosting] = useState(false);
  const [old, setOld] = useState(false);
  const live = bounties.filter((b) => b.status === 'open' || b.status === 'claimed');
  const past = bounties.filter((b) => b.status === 'paid' || b.status === 'cancelled');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-smoke">High Table puts out bounties, paid from the gang bank. Take one down, then claim it with proof.</p>
        {isLead && !!gangs.length && (
          <button className="btn-gold btn-sm ml-auto" onClick={() => setPosting(true)}>
            <Plus className="size-3.5" /> Put out a bounty
          </button>
        )}
      </div>
      {live.length ? (
        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {live.map((b) => (
            <Poster key={b.id} b={b} gang={gangs.find((g) => g.id === b.gangId)} />
          ))}
        </div>
      ) : (
        <Empty title="No bounties out">Nobody has a price on their head right now.</Empty>
      )}
      {!!past.length && (
        <div>
          <button className="text-sm text-smoke hover:text-gold-200" onClick={() => setOld(!old)}>
            {old ? 'Hide' : 'Show'} past bounties · {past.length}
          </button>
          {old && (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {past.map((b) => (
                <Poster key={b.id} b={b} gang={gangs.find((g) => g.id === b.gangId)} />
              ))}
            </div>
          )}
        </div>
      )}
      {posting && <PostBounty gangs={gangs} onClose={() => setPosting(false)} />}
    </div>
  );
}

// ---------- sightings ----------

function Sightings({ d, onSpot }: { d: ReturnType<typeof useRivalData>; onSpot: () => void }) {
  const { me, isLead } = useHub();
  const fresh = d.sightings.filter(freshSighting);
  const placed = fresh.filter((s) => s.x != null && s.y != null);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Panel title={`Last 6 hours · ${fresh.length}`} right={<button className="btn-gold btn-sm" onClick={onSpot} disabled={!d.gangs.length}><Eye className="size-3.5" /> Spotted</button>}>
        <ZoomMap height="max-h-[65vh]" focus={placed.length ? placed.map((s) => ({ x: s.x!, y: s.y! })) : undefined}>
          <ZoneLayer zones={d.gangs.flatMap((g) => (g.zones ?? []).map((zone) => ({ gang: g, zone })))} />
          {placed.map((s) => (
            <span key={s.id} className="pointer-events-none absolute" style={{ left: `${s.x! * 100}%`, top: `${s.y! * 100}%`, transform: 'translate(-50%, -50%)' }}>
              <span className="map-extra sighting">
                <Crosshair className="size-3.5" />
                <span className="map-pin-label">{d.gangs.find((g) => g.id === s.gangId)?.name ?? 'Rivals'}</span>
              </span>
            </span>
          ))}
        </ZoomMap>
        <p className="mt-2 text-xs text-smoke">Placed sightings also show on the Map for 6 hours (Rival sightings layer).</p>
      </Panel>
      <Panel title="Everything spotted">
        {d.sightings.length ? (
          <ul className="divide-y divide-line-soft text-sm">
            {d.sightings.slice(0, 50).map((s) => {
              const g = d.gangs.find((x) => x.id === s.gangId);
              return (
                <li key={s.id} className={`flex flex-wrap items-baseline gap-2 py-2 ${freshSighting(s) ? '' : 'opacity-55'}`}>
                  <Crosshair className={`size-3.5 shrink-0 self-center ${freshSighting(s) ? 'text-red-400' : 'text-smoke'}`} />
                  <b style={{ color: g?.color }}>{g?.name ?? 'Unknown'}</b>
                  <span className="min-w-0 flex-1 text-ash">
                    {s.memberIds.length ? `${s.memberIds.length} known · ` : ''}
                    {s.postal && `postal ${s.postal}`}
                    {s.note && <span className="text-smoke"> · {s.note}</span>}
                  </span>
                  <span className="text-[11px] text-smoke">
                    {s.byName} · {ago(s.at)}
                  </span>
                  {(s.by === me.id || isLead) && (
                    <button className="text-smoke hover:text-red-300" onClick={() => removeSighting(s.id)} aria-label="Remove">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-smoke">Nothing spotted yet.</p>
        )}
      </Panel>
    </div>
  );
}

// ---------- the red-string board ----------

const EMPTY_BOARD: Board = { nodes: [], links: [], legend: DEFAULT_LEGEND };

function AddNode({ gangs, onAdd, onClose }: { gangs: Rival[]; onAdd: (n: Omit<BoardNode, 'id' | 'x' | 'y'>) => void; onClose: () => void }) {
  const [kind, setKind] = useState<BoardNode['kind']>('member');
  const [g, setG] = useState(gangs[0]?.id ?? '');
  const members = useGangMembers(kind === 'member' ? g : '');
  const [mid, setMid] = useState('');
  const [text, setText] = useState('');
  const gang = gangs.find((x) => x.id === g);
  const m = members.find((x) => x.id === mid);
  const ok = kind === 'note' ? !!text.trim() : kind === 'gang' ? !!gang : !!m;
  return (
    <Modal title="Pin something up" onClose={onClose}>
      <div className="space-y-4">
        <Tabs value={kind} onChange={setKind} tabs={[{ id: 'member', label: 'A person' }, { id: 'gang', label: 'A gang' }, { id: 'note', label: 'A note' }]} />
        {kind !== 'note' && (
          <Field label="Gang">
            <select className="input" value={g} onChange={(e) => (setG(e.target.value), setMid(''))}>
              {gangs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'member' && (
          <Field label="Who">
            <select className="input" value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="">Pick…</option>
              {members.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'note' && (
          <Field label="Note">
            <input className="input" value={text} maxLength={80} placeholder="Who's supplying them?" onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-gold"
            disabled={!ok}
            onClick={() => {
              if (kind === 'note') onAdd({ kind, ref: '', label: text.trim() });
              else if (kind === 'gang' && gang) onAdd({ kind, ref: gang.id, label: gang.name, color: gang.color });
              else if (m && gang) onAdd({ kind, ref: `${gang.id}/${m.id}`, label: m.name, color: threatOf(m.threat).color });
              onClose();
            }}
          >
            Pin it
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RedStrings({ gangs }: { gangs: Rival[] }) {
  const { isLead } = useHub();
  const saved = useDoc<Board>('rivalBoard/main');
  const [b, setB] = useState<Board>(EMPTY_BOARD);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [pen, setPen] = useState(DEFAULT_LEGEND[0]!.color);
  const [legendEdit, setLegendEdit] = useState(false);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (saved && !drag.current) setB({ nodes: saved.nodes ?? [], links: saved.links ?? [], legend: saved.legend?.length ? saved.legend : DEFAULT_LEGEND });
  }, [saved]);
  const commit = (next: Board) => {
    setB(next);
    void saveBoard({ nodes: next.nodes, links: next.links, legend: next.legend });
  };
  const nodeById = new Map(b.nodes.map((n) => [n.id, n]));
  const gangOf = (n: BoardNode) => gangs.find((g) => g.id === (n.kind === 'gang' ? n.ref : n.ref.split('/')[0]));

  const down = (e: RPointerEvent, id: string) => {
    if (!isLead) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id, moved: false };
  };
  const move = (e: RPointerEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width));
    const y = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height));
    drag.current.moved = true;
    const id = drag.current.id;
    setB((cur) => ({ ...cur, nodes: cur.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) return commit(b);
    // A tap: start or finish a string.
    if (!linking) return setLinking(d.id);
    if (linking === d.id) return setLinking(null);
    const exists = b.links.some((l) => (l.a === linking && l.b === d.id) || (l.a === d.id && l.b === linking));
    if (!exists) commit({ ...b, links: [...b.links, { a: linking, b: d.id, color: pen }] });
    setLinking(null);
  };
  const removeNode = (id: string) => commit({ ...b, nodes: b.nodes.filter((n) => n.id !== id), links: b.links.filter((l) => l.a !== id && l.b !== id) });
  const removeLink = (l: BoardLink) => commit({ ...b, links: b.links.filter((x) => x !== l) });
  const meaning = (c: string) => b.legend.find((x) => x.color === c)?.meaning;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div>
        <div ref={box} className="rboard" onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {b.links.map((l, i) => {
              const a = nodeById.get(l.a);
              const c = nodeById.get(l.b);
              if (!a || !c) return null;
              return (
                <g key={i} className={isLead ? 'cursor-pointer' : ''} onClick={() => isLead && confirm(`Cut this ${meaning(l.color) ?? ''} string?`) && removeLink(l)}>
                  <line x1={a.x * 100} y1={a.y * 100} x2={c.x * 100} y2={c.y * 100} stroke="transparent" strokeWidth={3} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 14 }} />
                  <line x1={a.x * 100} y1={a.y * 100} x2={c.x * 100} y2={c.y * 100} stroke={l.color} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5, filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,.5))' }}>
                    <title>{meaning(l.color) ?? ''}</title>
                  </line>
                </g>
              );
            })}
          </svg>
          {b.nodes.map((n) => {
            const g = gangOf(n);
            return (
              <div
                key={n.id}
                className={`rboard-node ${n.kind} ${linking === n.id ? 'picked' : ''} ${isLead ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, ...(n.kind === 'gang' ? { background: n.color ?? g?.color } : {}), rotate: `${((n.id.charCodeAt(0) % 7) - 3) * 0.8}deg` }}
                onPointerDown={(e) => down(e, n.id)}
              >
                {n.kind === 'member' && (
                  <span className="mb-1 block h-1.5" style={{ background: n.color }} title="Threat" />
                )}
                <b className="block truncate">{n.label}</b>
                {n.kind === 'member' && g && <span className="block truncate text-[10px] opacity-70">{g.name}</span>}
                {isLead && (
                  <button className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-black/70 text-white opacity-60 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeNode(n.id)} aria-label="Unpin">
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
          {!b.nodes.length && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-amber-100/80">{isLead ? 'Pin people, gangs and notes up, then tap two to tie a string between them.' : 'Nothing pinned up yet.'}</p>}
        </div>
        {isLead && <p className="mt-2 text-xs text-smoke">Drag cards to move them. Tap one card, then another, to tie a string in the chosen color. Tap a string to cut it.</p>}
      </div>
      <div className="space-y-4">
        {isLead && (
          <button className="btn-gold w-full" onClick={() => setAdding(true)} disabled={!gangs.length}>
            <StickyNote className="size-4" /> Pin something up
          </button>
        )}
        <Panel
          title="What the strings mean"
          right={
            isLead && (
              <button className="text-xs text-smoke hover:text-gold-200" onClick={() => setLegendEdit(!legendEdit)}>
                {legendEdit ? 'Done' : 'Edit'}
              </button>
            )
          }
        >
          <ul className="space-y-1.5 text-sm">
            {b.legend.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                {legendEdit ? (
                  <>
                    <input type="color" className="h-7 w-9 shrink-0 cursor-pointer bg-transparent" value={l.color} onChange={(e) => setB({ ...b, legend: b.legend.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)), links: b.links.map((x) => (x.color === l.color ? { ...x, color: e.target.value } : x)) })} />
                    <input className="input py-1 text-sm" value={l.meaning} maxLength={30} onChange={(e) => setB({ ...b, legend: b.legend.map((x, k) => (k === i ? { ...x, meaning: e.target.value } : x)) })} />
                    <button className="text-smoke hover:text-red-300" onClick={() => setB({ ...b, legend: b.legend.filter((_, k) => k !== i) })} aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <button className={`flex w-full items-center gap-2 border px-2 py-1 text-left ${pen === l.color ? 'border-gold-400 bg-gold-500/10' : 'border-transparent'}`} onClick={() => setPen(l.color)} disabled={!isLead}>
                    <span className="h-1 w-8 shrink-0 rounded" style={{ background: l.color }} />
                    <span className="text-ash">{l.meaning}</span>
                    {isLead && pen === l.color && <Link2 className="ml-auto size-3.5 text-gold-300" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {legendEdit && (
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setB({ ...b, legend: [...b.legend, { color: '#a855f7', meaning: 'New string' }] })}>
                <Plus className="size-3.5" /> Add color
              </button>
              <button className="btn-gold btn-sm ml-auto" onClick={() => (commit({ ...b, legend: b.legend.filter((x) => x.meaning.trim()) }), setLegendEdit(false))}>
                Save
              </button>
            </div>
          )}
        </Panel>
      </div>
      {adding && (
        <AddNode
          gangs={gangs}
          onClose={() => setAdding(false)}
          onAdd={(n) => commit({ ...b, nodes: [...b.nodes, { ...n, id: Math.random().toString(36).slice(2, 10), x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 }].slice(-60) })}
        />
      )}
    </div>
  );
}

// ---------- page ----------

export default function Rivals() {
  const { isLead } = useHub();
  const d = useRivalData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<'new' | 'spot' | null>(null);
  const open = d.gangs.find((g) => g.id === params.get('gang'));
  const liveBounties = d.bounties.filter((b) => b.status === 'open' || b.status === 'claimed').length;
  const fresh = d.sightings.filter(freshSighting).length;
  const tabs: { id: View; label: string }[] = [
    { id: 'files', label: `Case files · ${d.gangs.length}` },
    { id: 'board', label: 'Red strings' },
    { id: 'bounties', label: `Bounties${liveBounties ? ` · ${liveBounties}` : ''}` },
    { id: 'sightings', label: `Sightings${fresh ? ` · ${fresh}` : ''}` },
  ];
  const view = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'files';
  return (
    <>
      <PageHeader
        icon={Crosshair}
        kicker="Operations"
        title="Rivals"
        sub="Case files on every gang we deal with: who they are, where they run, how we stand, and what happened."
        actions={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setDialog('spot')} disabled={!d.gangs.length}>
              <Eye className="size-4" /> Spotted
            </button>
            {isLead && (
              <button className="btn-gold" onClick={() => setDialog('new')}>
                <Plus className="size-4" /> New case file
              </button>
            )}
          </div>
        }
      />
      {open ? (
        <RivalFile gang={open} onBack={() => setParams({})} onSpot={() => setDialog('spot')} />
      ) : (
        <>
          <div className="mb-5">
            <Tabs value={view} onChange={(v) => setParams(v === 'files' ? {} : { tab: v })} tabs={tabs} />
          </div>
          {view === 'files' && <Files gangs={d.gangs} fights={d.fights} onOpen={(id) => setParams({ gang: id })} />}
          {view === 'board' && <RedStrings gangs={d.gangs} />}
          {view === 'bounties' && <Bounties bounties={d.bounties} gangs={d.gangs} />}
          {view === 'sightings' && <Sightings d={d} onSpot={() => setDialog('spot')} />}
        </>
      )}
      {dialog === 'new' && <GangDialog gang={null} onClose={() => setDialog(null)} onSaved={(id) => setParams({ gang: id })} />}
      {dialog === 'spot' && <SpotDialog gangs={d.gangs} gangId={open?.id} onClose={() => setDialog(null)} />}
    </>
  );
}
