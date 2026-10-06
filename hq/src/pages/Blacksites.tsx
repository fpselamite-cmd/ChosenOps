import { Camera, Check, Clock, Crosshair, Crown, Flag, ImagePlus, Lock, Package, Pencil, Plus, Shield, Swords, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { Empty, ErrorText, Field } from '../components/Field';
import { ItemPicker } from '../components/ItemPicker';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat, Tabs } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { useVisible } from '../lib/audience';
import {
  addPhoto,
  BROUGHT,
  claimLoot,
  closeDraw,
  decideRep,
  logFight,
  markDumped,
  mvps,
  records,
  removePhoto,
  removeSite,
  RESULTS,
  saveLine,
  saveSite,
  vote,
  type Blacksite,
  type Loot,
  type Photo,
  type Result,
  type StatLine,
} from '../lib/blacksites';
import type { CalEvent } from '../lib/calendar';
import { ago, fmtDate, fmtTime } from '../lib/format';
import { shrinkImage } from '../lib/image';
import { itemTitle, type ItemType } from '../lib/items';
import { useLocker, type Thing } from '../lib/locker';
import type { Pin } from '../lib/pins';
import { lockerPath, useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';

const resultOf = (r: Result) => RESULTS.find((x) => x.id === r)!;
const hold = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

function useItems() {
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  return { types, byId };
}

// ---------- log / edit ----------

function LogDialog({ site, onClose }: { site?: Blacksite; onClose: () => void }) {
  const { me, roster, crews } = useHub();
  const { storage, locLabel } = useNarcotics();
  const { types, byId } = useItems();
  const pins = (useVisible<Pin>('pins') ?? []).filter((p) => p.type === 'blacksite');
  const events = (useVisible<CalEvent>('events') ?? []).filter((e) => e.kind === 'blacksite');
  const [zone, setZone] = useState(site?.zone ?? pins[0]?.name ?? '');
  const [pinId, setPinId] = useState<string | null>(site?.pinId ?? null);
  const [at, setAt] = useState(toLocalInput(site?.at.toDate() ?? new Date()));
  const [result, setResult] = useState<Result>(site?.result ?? 'win');
  const [rivals, setRivals] = useState(site?.rivals.join(', ') ?? '');
  const [holdMins, setHold] = useState(String(site?.holdMins ?? 30));
  const [rep, setRep] = useState(String(site?.rep ?? 0));
  const [notes, setNotes] = useState(site?.notes ?? '');
  const [who, setWho] = useState<Set<string>>(new Set(site?.participants ?? [me.id]));
  const [stashTo, setStashTo] = useState(site?.stashTo ?? storage[0]?.id ?? 'main');
  const [claimHours, setClaimHours] = useState(24);
  const [loot, setLoot] = useState<Thing[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState('1');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    const n = new Set(who);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setWho(n);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!zone.trim()) return setError('Where was it?');
    if (!who.size) return setError('Who was there?');
    setBusy(true);
    const d = {
      zone,
      pinId,
      at: new Date(at),
      result,
      rivals: rivals.split(',').map((r) => r.trim()).filter(Boolean),
      holdMins: Math.max(0, Math.round(+holdMins || 0)),
      rep: Math.max(0, Math.round(+rep || 0)),
      notes: notes.trim(),
      participants: [...who],
      stashTo,
    };
    try {
      if (site) {
        // Drop stat lines and votes of anyone taken off the list.
        const keep = (m: Record<string, unknown>) => Object.fromEntries(Object.entries(m).filter(([k]) => who.has(k)));
        await saveSite(site.id, { ...d, stats: keep(site.stats) as Blacksite['stats'] });
      } else await logFight(me, { ...d, claimHours }, loot, photos);
      onClose();
    } catch {
      setError("Couldn't save that.");
      setBusy(false);
    }
  }
  return (
    <Modal title={site ? 'Edit fight' : 'Log a blacksite'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Zone">
            <input className="input" list="bs-zones" value={zone} onChange={(e) => (setZone(e.target.value), setPinId(pins.find((p) => p.name === e.target.value)?.id ?? null))} maxLength={60} placeholder="e.g. Docks" />
            <datalist id="bs-zones">
              {pins.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field label="When">
            <input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RESULTS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setResult(r.id)}
              className="chip px-3 py-1.5 text-xs"
              style={result === r.id ? { background: r.color, color: '#0a0a0b' } : { border: `1px solid ${r.color}66`, color: r.color }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rival gangs" hint="Comma-separated">
            <input className="input" value={rivals} onChange={(e) => setRivals(e.target.value)} placeholder="Ballas, Vagos" />
          </Field>
          <Field label="Hold time (min)">
            <input className="input font-mono" inputMode="numeric" value={holdMins} onChange={(e) => setHold(e.target.value)} />
          </Field>
          <Field label="Rep gained" hint="Counts once Lieutenant+ confirms">
            <input className="input font-mono" inputMode="numeric" value={rep} onChange={(e) => setRep(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="label">Who was there · {who.size}</span>
            <span className="flex flex-wrap gap-1">
              {events.length > 0 && (
                <select
                  className="input w-auto py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    const ev = events.find((x) => x.id === e.target.value);
                    if (!ev) return;
                    setWho(new Set([...who, ...Object.entries(ev.rsvp ?? {}).filter(([, v]) => v === 'yes').map(([k]) => k)]));
                    if (ev.place && !zone) setZone(ev.place);
                  }}
                >
                  <option value="">From a calendar event…</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              )}
              {crews.map((c) => (
                <button key={c.id} type="button" className="chip px-2 py-1 text-[11px]" style={{ border: `1px solid ${c.color}66`, color: c.color }} onClick={() => setWho(new Set([...who, ...c.memberIds]))}>
                  + {c.name}
                </button>
              ))}
            </span>
          </div>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto border border-line-soft p-2">
            {roster.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs ${who.has(m.id) ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}
              >
                <Avatar member={m} size="xs" /> {m.name}
              </button>
            ))}
          </div>
        </div>

        {!site && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label mb-1.5 block">Loot</span>
              <ItemPicker types={types} value={pick} onChange={setPick} />
              <div className="mt-1.5 flex gap-2">
                <input className="input w-20 font-mono" inputMode="numeric" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={!pick}
                  onClick={() => {
                    const q = Math.max(1, Math.round(+pickQty || 1));
                    setLoot([...loot.filter((l) => l.item !== pick), { field: 'meth', item: pick!, qty: q + (loot.find((l) => l.item === pick)?.qty ?? 0), label: itemTitle(byId.get(pick!), byId) }]);
                  }}
                >
                  <Plus className="size-3.5" /> Add to loot
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <ul className="divide-y divide-line-soft border border-line-soft">
                {loot.map((l) => (
                  <li key={l.item} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <span className="flex-1 text-gold-100">{l.label}</span>
                    <span className="font-mono text-gold-300">×{l.qty}</span>
                    <button type="button" className="text-smoke hover:text-danger" onClick={() => setLoot(loot.filter((x) => x !== l))}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
                {!loot.length && <li className="p-3 text-center text-xs text-smoke">No loot added.</li>}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Leftovers go to">
                  <select className="input" value={stashTo} onChange={(e) => setStashTo(e.target.value)}>
                    {storage.map((l) => (
                      <option key={l.id} value={l.id}>
                        {locLabel(l.id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Claim window">
                  <select className="input" value={claimHours} onChange={(e) => setClaimHours(+e.target.value)}>
                    {[6, 12, 24, 48].map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-smoke">People who were there take loot into their lockers until the window closes; the rest goes into the stash.</p>
            </div>
          </div>
        )}

        {!site && (
          <div>
            <span className="label mb-1.5 block">Screenshots</span>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p} alt="" className="h-20 rounded object-cover" />
                  <button type="button" className="absolute top-0.5 right-0.5 rounded bg-black/70 p-0.5" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="grid h-20 w-28 cursor-pointer place-items-center border border-dashed border-line text-smoke hover:text-gold-200">
                  <ImagePlus className="size-5" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => setPhotos([...photos, ...(await Promise.all([...(e.target.files ?? [])].slice(0, 6 - photos.length).map((f) => shrinkImage(f))))])} />
                </label>
              )}
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="How it went, who pushed, what to do better" />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            {site ? 'Save' : 'Log fight'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- one fight ----------

function MyLine({ s }: { s: Blacksite }) {
  const { me, memberById } = useHub();
  const toast = useToast();
  const cur = s.stats?.[me.id] ?? {};
  const [kills, setKills] = useState(String(cur.kills ?? 0));
  const [downs, setDowns] = useState(String(cur.downs ?? 0));
  const [logi, setLogi] = useState(String(cur.logistics ?? 0));
  const [brought, setBrought] = useState<string[]>(cur.brought ?? []);
  const [mvp, setMvp] = useState(s.votes?.[me.id] ?? '');
  const n = (v: string) => Math.max(0, Math.min(999, Math.round(+v || 0)));
  return (
    <Panel title="Your line">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const line: StatLine = { kills: n(kills), downs: n(downs), logistics: n(logi), brought };
          await saveLine(s.id, me.id, line);
          if (mvp && mvp !== s.votes?.[me.id]) await vote(s.id, me.id, mvp);
          toast.done({ text: 'Saved your line.' });
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <Field label="Kills">
            <input className="input font-mono" inputMode="numeric" value={kills} onChange={(e) => setKills(e.target.value)} />
          </Field>
          <Field label="Downs / deaths">
            <input className="input font-mono" inputMode="numeric" value={downs} onChange={(e) => setDowns(e.target.value)} />
          </Field>
          <Field label="Supply runs">
            <input className="input font-mono" inputMode="numeric" value={logi} onChange={(e) => setLogi(e.target.value)} />
          </Field>
        </div>
        <div>
          <span className="label mb-1 block">Brought to the point</span>
          <div className="flex flex-wrap gap-1">
            {BROUGHT.map((b) => {
              const on = brought.includes(b.id);
              return (
                <button key={b.id} type="button" onClick={() => setBrought(on ? brought.filter((x) => x !== b.id) : [...brought, b.id])} className={`chip px-2.5 py-1 text-xs ${on ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Your MVP vote">
          <select className="input" value={mvp} onChange={(e) => setMvp(e.target.value)}>
            <option value="">Pick someone…</option>
            {s.participants
              .filter((p) => p !== me.id)
              .map((p) => (
                <option key={p} value={p}>
                  {memberById.get(p)?.name ?? 'Unknown'}
                </option>
              ))}
          </select>
        </Field>
        <button className="btn-gold">Save</button>
      </form>
    </Panel>
  );
}

function LootPanel({ s }: { s: Blacksite }) {
  const { me, canSee } = useHub();
  const { locLabel } = useNarcotics();
  const locker = useLocker();
  const ops = useOps('stash');
  const toast = useToast();
  const loot = useCollection<Loot>(`blacksites/${s.id}/loot`) ?? [];
  const [into, setInto] = useState('onme');
  const [n, setN] = useState<Record<string, string>>({});
  const open = s.lootStatus === 'open';
  const there = s.participants.includes(me.id);
  const expired = !!s.closesAt && s.closesAt.toMillis() < Date.now();
  const leftovers = loot.filter((l) => l.qty > 0 && !l.dumped);
  const canStash = canSee('stash') || canSee('narcotics');

  async function take(l: Loot) {
    const want = Math.max(1, Math.round(+(n[l.id] ?? '1') || 1));
    const got = await claimLoot(s.id, l.id, me.id, want);
    if (!got) return toast.done({ text: 'Someone beat you to it.' });
    await ops.applyDeltas([{ loc: lockerPath(me.id, into), field: l.field as Thing['field'], strain: (l.strain ?? undefined) as Thing['strain'], item: l.item ?? undefined, delta: got }]);
    toast.done({ text: `Took ${got} × ${l.label} into ${locker.storages.find((x) => x.id === into)?.name}.` });
  }
  async function dump() {
    for (const l of leftovers) {
      await ops.applyDeltas([{ loc: s.stashTo, field: l.field as Thing['field'], strain: (l.strain ?? undefined) as Thing['strain'], item: l.item ?? undefined, delta: l.qty }]);
      await markDumped(s.id, l.id);
    }
    toast.done({ text: `Leftovers are in ${locLabel(s.stashTo)}.` });
  }

  if (!loot.length) return null;
  return (
    <Panel
      title="Loot"
      right={
        <span className="text-xs text-smoke">
          {open ? (
            <>
              <Clock className="mr-1 inline size-3" />
              Claims close {s.closesAt ? `${fmtDate(s.closesAt)} ${fmtTime(s.closesAt)}` : 'when the logger closes them'}
            </>
          ) : (
            <>
              <Lock className="mr-1 inline size-3" />
              Closed
            </>
          )}
        </span>
      }
    >
      {open && there && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-smoke">Take into</span>
          <select className="input w-auto py-1" value={into} onChange={(e) => setInto(e.target.value)}>
            {locker.storages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="divide-y divide-line-soft border border-line-soft">
        {loot.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <Package className="size-4 text-gold-400" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-gold-100">{l.label}</span>
              <span className="ml-2 font-mono text-xs text-gold-300">{l.dumped ? 'rest stashed' : `${l.qty} left`}</span>
              <span className="block text-xs text-smoke">
                {Object.entries(l.claims ?? {})
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <span key={k} className="mr-2">
                      <MemberName id={k} className="text-xs" /> ×{v}
                    </span>
                  ))}
              </span>
            </span>
            {open && there && l.qty > 0 && (
              <span className="flex items-center gap-1">
                <input className="input w-14 py-1 font-mono" inputMode="numeric" value={n[l.id] ?? '1'} onChange={(e) => setN({ ...n, [l.id]: e.target.value })} />
                <button className="btn-gold btn-sm" onClick={() => take(l)}>
                  Take
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {open && (s.loggedBy === me.id || expired) && (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              await closeDraw(s.id, me.id);
              if (canStash) await dump();
            }}
          >
            <Lock className="size-3.5" /> Close claims{canStash ? ' & stash the rest' : ''}
          </button>
        )}
        {!open && leftovers.length > 0 &&
          (canStash ? (
            <button className="btn-gold btn-sm" onClick={dump}>
              Put {leftovers.reduce((t, l) => t + l.qty, 0)} leftovers in {locLabel(s.stashTo)}
            </button>
          ) : (
            <span className="text-xs text-smoke">Waiting for someone with stash access to put the leftovers in {locLabel(s.stashTo)}.</span>
          ))}
      </div>
    </Panel>
  );
}

function Photos({ s }: { s: Blacksite }) {
  const { me } = useHub();
  const photos = useCollection<Photo>(`blacksites/${s.id}/photos`) ?? [];
  const [big, setBig] = useState<string | null>(null);
  const can = s.loggedBy === me.id || s.participants.includes(me.id);
  if (!photos.length && !can) return null;
  return (
    <Panel title={`Screenshots · ${photos.length}`}>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="group relative">
            <button onClick={() => setBig(p.image)}>
              <img src={p.image} alt="" className="h-24 rounded object-cover ring-1 ring-line" />
            </button>
            {(p.by === me.id || s.loggedBy === me.id) && (
              <button className="absolute top-1 right-1 hidden rounded bg-black/70 p-0.5 group-hover:block" onClick={() => removePhoto(s.id, p.id)} aria-label="Remove">
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}
        {can && (
          <label className="grid h-24 w-32 cursor-pointer place-items-center border border-dashed border-line text-smoke hover:text-gold-200">
            <Camera className="size-5" />
            <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => [...(e.target.files ?? [])].slice(0, 6).forEach(async (f) => addPhoto(s.id, me.id, await shrinkImage(f)))} />
          </label>
        )}
      </div>
      {big && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4" onClick={() => setBig(null)}>
          <img src={big} alt="" className="max-h-full max-w-full" />
        </div>
      )}
    </Panel>
  );
}

function FightDetail({ s, onClose, onEdit }: { s: Blacksite; onClose: () => void; onEdit: () => void }) {
  const { me, can, memberById } = useHub();
  const r = resultOf(s.result);
  const m = mvps(s);
  const mine = s.participants.includes(me.id);
  return (
    <Modal title={s.zone} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="chip px-2.5 py-1 text-xs font-bold" style={{ background: r.color, color: '#0a0a0b' }}>
            {r.label}
          </span>
          <span className="text-ash">
            {fmtDate(s.at)} · {fmtTime(s.at)}
          </span>
          <span className="text-ash">Held {hold(s.holdMins)}</span>
          {s.rivals.length > 0 && <span className="text-ash">vs {s.rivals.join(', ')}</span>}
          <span className={s.repStatus === 'confirmed' ? 'text-ok' : s.repStatus === 'rejected' ? 'text-danger line-through' : 'text-gold-300'}>
            +{s.rep.toLocaleString()} rep{s.repStatus === 'pending' ? ' (waiting on Lieutenant+)' : s.repStatus === 'rejected' ? ' (turned down)' : ''}
          </span>
        </div>
        {s.notes && <p className="text-sm whitespace-pre-wrap text-ash">{s.notes}</p>}
        <div className="flex flex-wrap gap-2">
          {s.loggedBy === me.id && (
            <button className="btn-ghost btn-sm" onClick={onEdit}>
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
          {can('confirmRep') && s.repStatus === 'pending' && (
            <>
              <button className="btn-gold btn-sm" onClick={() => decideRep(s, me.id, true)}>
                <Check className="size-3.5" /> Confirm {s.rep.toLocaleString()} rep
              </button>
              <button className="btn-danger btn-sm" onClick={() => decideRep(s, me.id, false)}>
                <X className="size-3.5" /> Turn down
              </button>
            </>
          )}
          {(can('manageOps') || (s.loggedBy === me.id && s.repStatus === 'pending')) && (
            <button className="btn-ghost btn-sm" onClick={() => confirm('Delete this fight?') && removeSite(s.id).then(onClose)}>
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
        </div>

        <Panel title={`Who was there · ${s.participants.length}`} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label border-b border-line-soft text-left">
                  <th className="px-3 py-2">Member</th>
                  <th className="px-2 py-2 text-right">Kills</th>
                  <th className="px-2 py-2 text-right">Downs</th>
                  <th className="px-2 py-2 text-right">Supply</th>
                  <th className="px-2 py-2">Brought</th>
                  <th className="px-3 py-2 text-right">MVP votes</th>
                </tr>
              </thead>
              <tbody>
                {[...s.participants]
                  .sort((a, b) => (m.votes[b] ?? 0) - (m.votes[a] ?? 0) || (s.stats?.[b]?.kills ?? 0) - (s.stats?.[a]?.kills ?? 0))
                  .map((p) => {
                    const l = s.stats?.[p];
                    return (
                      <tr key={p} className="border-b border-line-soft last:border-0">
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-2">
                            <Avatar member={memberById.get(p)} size="xs" />
                            <MemberName id={p} />
                            {m.ids.includes(p) && <Crown className="size-4 text-gold-300" />}
                          </span>
                        </td>
                        <td className="px-2 text-right font-mono">{l ? (l.kills ?? 0) : <span className="text-smoke">—</span>}</td>
                        <td className="px-2 text-right font-mono">{l ? (l.downs ?? 0) : <span className="text-smoke">—</span>}</td>
                        <td className="px-2 text-right font-mono">{l ? (l.logistics ?? 0) : <span className="text-smoke">—</span>}</td>
                        <td className="px-2 text-xs text-ash">{(l?.brought ?? []).map((b) => BROUGHT.find((x) => x.id === b)?.label).join(', ')}</td>
                        <td className="px-3 text-right font-mono text-gold-300">{m.votes[p] ?? 0}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-xs text-smoke">
            {Object.keys(s.votes ?? {}).length} of {s.participants.length} voted. Each person fills in their own line.
          </p>
        </Panel>

        {mine && <MyLine key={s.id} s={s} />}
        <LootPanel s={s} />
        <Photos s={s} />
        <p className="text-xs text-smoke">
          Logged by <MemberName id={s.loggedBy} className="text-xs" /> {ago(s.createdAt)}
        </p>
      </div>
    </Modal>
  );
}

// ---------- page ----------

function FightCard({ s, onOpen }: { s: Blacksite; onOpen: () => void }) {
  const { memberById, me } = useHub();
  const r = resultOf(s.result);
  const m = mvps(s);
  const needsMe = s.participants.includes(me.id) && !s.stats?.[me.id];
  return (
    <button onClick={onOpen} className="hud block w-full p-4 text-left transition hover:bg-raised/40">
      <div className="flex items-start gap-3">
        <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-hud text-lg font-bold text-gold-100">{s.zone}</span>
            <span className="text-xs" style={{ color: r.color }}>
              {r.label}
            </span>
            {s.rivals.length > 0 && <span className="text-xs text-smoke">vs {s.rivals.join(', ')}</span>}
          </p>
          <p className="text-xs text-smoke">
            {fmtDate(s.at)} · {fmtTime(s.at)} · held {hold(s.holdMins)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="flex -space-x-1.5">
              {s.participants.slice(0, 10).map((p) => (
                <Avatar key={p} member={memberById.get(p)} size="xs" />
              ))}
            </span>
            <span className="text-xs text-smoke">{s.participants.length} there</span>
            {m.ids.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-gold-200">
                <Crown className="size-3.5 text-gold-300" /> {m.ids.map((id) => memberById.get(id)?.name).join(' & ')}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-xs">
          <p className={`font-mono text-base ${s.repStatus === 'confirmed' ? 'text-ok' : s.repStatus === 'rejected' ? 'text-smoke line-through' : 'text-gold-300'}`}>+{s.rep.toLocaleString()}</p>
          <p className="text-smoke">{s.repStatus === 'pending' ? 'rep pending' : s.repStatus === 'confirmed' ? 'rep in' : 'turned down'}</p>
          {s.lootStatus === 'open' && <p className="mt-1 text-gold-300">Loot open</p>}
          {needsMe && <p className="mt-1 text-danger">Add your line</p>}
        </div>
      </div>
    </button>
  );
}

function Body() {
  const { me, crews } = useHub();
  const sites = useCollection<Blacksite>('blacksites');
  const [tab, setTab] = useState<'fights' | 'people' | 'crews'>('fights');
  const [logging, setLogging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Blacksite | null>(null);
  const [sortBy, setSortBy] = useState<'kills' | 'mvps' | 'fights' | 'logistics'>('kills');
  const list = useMemo(() => [...(sites ?? [])].sort((a, b) => b.at.toMillis() - a.at.toMillis()), [sites]);
  const recs = useMemo(() => records(list), [list]);
  const open = list.find((s) => s.id === openId);

  // A claim window that ran out closes itself the next time anyone looks.
  useEffect(() => {
    list.filter((s) => s.lootStatus === 'open' && s.closesAt && s.closesAt.toMillis() < Date.now()).forEach((s) => closeDraw(s.id, me.id).catch(() => {}));
  }, [list, me.id]);

  const wins = list.filter((s) => s.result === 'win').length;
  const repIn = list.filter((s) => s.repStatus === 'confirmed').reduce((t, s) => t + s.rep, 0);
  const repWait = list.filter((s) => s.repStatus === 'pending').reduce((t, s) => t + s.rep, 0);
  const people = [...recs.values()].sort((a, b) => b[sortBy] - a[sortBy] || b.kills - a.kills);

  return (
    <>
      <PageHeader
        icon={Crosshair}
        kicker="War"
        title="Blacksites"
        sub="King of the Hill fights. Anyone logs one; everyone who was there fills in their own line and votes the MVP; the loot is shared out before the rest goes into the stash."
        actions={
          <button className="btn-gold" onClick={() => setLogging(true)}>
            <Plus className="size-4" /> Log a fight
          </button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fights" value={list.length} sub={`${list.filter((s) => s.at.toMillis() > Date.now() - 30 * 86400e3).length} in the last 30 days`} />
        <Stat label="Held" value={list.length ? `${Math.round((wins / list.length) * 100)}%` : '—'} sub={`${wins} wins`} />
        <Stat label="Rep earned" value={<span className="text-ok">{repIn.toLocaleString()}</span>} sub={repWait ? `${repWait.toLocaleString()} waiting on Lieutenant+` : 'All confirmed'} />
        <Stat label="Time on the hill" value={hold(list.reduce((t, s) => t + s.holdMins, 0))} />
      </div>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'fights', label: 'Fights' },
            { id: 'people', label: 'Fighters' },
            { id: 'crews', label: 'Crews' },
          ]}
        />
      </div>

      {tab === 'fights' &&
        (list.length ? (
          <div className="space-y-2">
            {list.map((s) => (
              <FightCard key={s.id} s={s} onOpen={() => setOpenId(s.id)} />
            ))}
          </div>
        ) : (
          <Empty icon={<Flag className="size-6" />} title="No fights logged yet">
            Log the first blacksite after the next fight.
          </Empty>
        ))}

      {tab === 'people' && (
        <Panel
          title="Fighters"
          pad={false}
          right={
            <select className="input w-auto py-1 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="kills">Most kills</option>
              <option value="mvps">Most MVPs</option>
              <option value="fights">Most fights</option>
              <option value="logistics">Most supply runs</option>
            </select>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label border-b border-line-soft text-left">
                  <th className="px-3 py-2">#</th>
                  <th className="px-2 py-2">Member</th>
                  <th className="px-2 py-2 text-right">Fights</th>
                  <th className="px-2 py-2 text-right">Held</th>
                  <th className="px-2 py-2 text-right">Kills</th>
                  <th className="px-2 py-2 text-right">Downs</th>
                  <th className="px-2 py-2 text-right">K/D</th>
                  <th className="px-2 py-2 text-right">Supply</th>
                  <th className="px-3 py-2 text-right">MVPs</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-1.5 font-mono text-smoke">{i + 1}</td>
                    <td className="px-2">
                      <MemberName id={p.id} />
                    </td>
                    <td className="px-2 text-right font-mono">{p.fights}</td>
                    <td className="px-2 text-right font-mono">{p.wins}</td>
                    <td className="px-2 text-right font-mono text-gold-100">{p.kills}</td>
                    <td className="px-2 text-right font-mono">{p.downs}</td>
                    <td className="px-2 text-right font-mono">{(p.kills / Math.max(1, p.downs)).toFixed(2)}</td>
                    <td className="px-2 text-right font-mono">{p.logistics}</td>
                    <td className="px-3 text-right font-mono text-gold-300">{p.mvps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!people.length && <p className="p-4 text-center text-sm text-smoke">No fights yet.</p>}
          </div>
        </Panel>
      )}

      {tab === 'crews' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crews.map((c) => {
            const fights = list.filter((s) => s.participants.some((p) => c.memberIds.includes(p)));
            const sum = (k: 'kills' | 'downs' | 'logistics') => fights.reduce((t, s) => t + c.memberIds.reduce((u, id) => u + (s.stats?.[id]?.[k] ?? 0), 0), 0);
            const top = c.memberIds.map((id) => recs.get(id)).filter(Boolean).sort((a, b) => b!.kills - a!.kills)[0];
            return (
              <div key={c.id} className="hud p-4" style={{ borderColor: `${c.color}55` }}>
                <p className="font-hud text-lg font-bold" style={{ color: c.color }}>
                  {c.name}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Fights', fights.length, Swords],
                    ['Held', fights.filter((s) => s.result === 'win').length, Shield],
                    ['Kills', sum('kills'), Crosshair],
                    ['Downs', sum('downs'), Users],
                    ['Supply', sum('logistics'), Package],
                    ['MVPs', c.memberIds.reduce((t, id) => t + (recs.get(id)?.mvps ?? 0), 0), Crown],
                  ].map(([l, v, I]) => {
                    const Icon = I as typeof Crown;
                    return (
                      <div key={l as string} className="bg-raised/40 py-1.5">
                        <Icon className="mx-auto size-3.5 text-smoke" />
                        <p className="font-mono text-lg text-gold-100">{v as number}</p>
                        <p className="label">{l as string}</p>
                      </div>
                    );
                  })}
                </div>
                {top && (
                  <p className="mt-2 text-xs text-smoke">
                    Top gun: <MemberName id={top.id} className="text-xs" /> · {top.kills} kills
                  </p>
                )}
              </div>
            );
          })}
          {!crews.length && <Empty title="No crews yet" />}
        </div>
      )}

      {logging && <LogDialog onClose={() => setLogging(false)} />}
      {editing && <LogDialog site={editing} onClose={() => setEditing(null)} />}
      {open && !editing && <FightDetail s={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
    </>
  );
}

export default function Blacksites() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}
