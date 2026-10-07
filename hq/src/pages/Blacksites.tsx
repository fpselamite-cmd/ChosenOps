import { Check, Crosshair, Crown, Flag, Lock, MapPin, Package, Pencil, Plus, Swords, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
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
  addSpot,
  assignLoot,
  BROUGHT,
  CALL_IN_COST,
  closeDraw,
  decideRep,
  logFight,
  markCollected,
  markDumped,
  mergeSpots,
  mvps,
  netRep,
  records,
  removeSite,
  removeSpot,
  RESULTS,
  saveLine,
  saveSite,
  saveSpot,
  spotOf,
  vote,
  type Blacksite,
  type Loot,
  type Result,
  type Spot,
  type StatLine,
} from '../lib/blacksites';
import type { CalEvent } from '../lib/calendar';
import { notify } from '../lib/discord';
import { ago, fmtDate, fmtTime } from '../lib/format';
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
  const { me, roster, crews, memberById } = useHub();
  const { storage, locLabel } = useNarcotics();
  const { types, byId } = useItems();
  const pins = (useVisible<Pin>('pins') ?? []).filter((p) => p.type === 'blacksite');
  const spots = useCollection<Spot>('blacksiteSpots') ?? [];
  const names = [...new Set([...spots.map((x) => x.name), ...pins.map((p) => p.name)])];
  const [calledIn, setCalledIn] = useState(!!site?.calledIn);
  const events = (useVisible<CalEvent>('events') ?? []).filter((e) => e.kind === 'blacksite');
  const [zone, setZone] = useState(site?.zone ?? '');
  const [pinId, setPinId] = useState<string | null>(site?.pinId ?? null);
  const [at, setAt] = useState(toLocalInput(site?.at.toDate() ?? new Date()));
  const [result, setResult] = useState<Result>(site?.result ?? 'win');
  const [rivals, setRivals] = useState(site?.rivals.join(', ') ?? '');
  const [holdMins, setHold] = useState(String(site?.holdMins ?? 30));
  const [rep, setRep] = useState(String(site?.rep ?? 0));
  const [notes, setNotes] = useState(site?.notes ?? '');
  const [who, setWho] = useState<Set<string>>(new Set(site?.participants ?? [me.id]));
  const [stashTo, setStashTo] = useState(site?.stashTo ?? storage[0]?.id ?? 'main');
  const [loot, setLoot] = useState<Thing[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState('1');
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
    // A new place becomes a location; leadership can place it on the map later.
    const known = spots.find((x) => x.name.trim().toLowerCase() === zone.trim().toLowerCase());
    const spotId = known?.id ?? (await addSpot(me.id, zone).catch(() => null));
    const d = {
      zone: known?.name ?? zone.trim(),
      pinId,
      spotId,
      calledIn,
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
      } else {
        await logFight(me, d, loot);
        notify('blacksite.logged', {
          title: `${resultOf(d.result).label === 'Held it' ? '🏴' : '⚔️'} Blacksite: ${d.zone}`,
          description: `${resultOf(d.result).label}${d.rivals.length ? ` vs ${d.rivals.join(', ')}` : ''} · held ${hold(d.holdMins)}`,
          fields: [
            { name: 'Who was there', value: d.participants.map((p) => memberById.get(p)?.name ?? '?').join(', ').slice(0, 1000) || '—' },
            { name: 'Rep', value: `${netRep(d) >= 0 ? '+' : ''}${netRep(d).toLocaleString()}${d.calledIn ? ` (called in, −${CALL_IN_COST})` : ''} · waiting on Lieutenant+`, inline: true },
            ...(loot.length ? [{ name: 'Loot', value: loot.map((l) => `${l.qty}× ${l.label}`).join(', ').slice(0, 1000), inline: true }] : []),
          ],
        });
      }
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
          <Field label="Location" hint="Pick one, or type a new one">
            <input className="input" list="bs-zones" value={zone} onChange={(e) => (setZone(e.target.value), setPinId(pins.find((p) => p.name === e.target.value)?.id ?? null))} maxLength={60} placeholder="e.g. Docks" />
            <datalist id="bs-zones">
              {names.map((n) => (
                <option key={n} value={n} />
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
        <label className="flex items-center gap-2 text-sm text-ash">
          <input type="checkbox" className="accent-gold-400" checked={calledIn} onChange={(e) => setCalledIn(e.target.checked)} />
          We called it in <span className="text-xs text-smoke">(costs the family {CALL_IN_COST} rep)</span>
        </label>

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
              <Field label="Leftovers go to">
                <select className="input" value={stashTo} onChange={(e) => setStashTo(e.target.value)}>
                  {storage.map((l) => (
                    <option key={l.id} value={l.id}>
                      {locLabel(l.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-smoke">Leadership splits the loot between the people who were there; the rest goes into the stash.</p>
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

/** Loot from the fight: leadership splits it between the people who were there; the rest goes into the stash. */
function LootPanel({ s }: { s: Blacksite }) {
  const { me, can, canSee, isLead } = useHub();
  const { locLabel } = useNarcotics();
  const locker = useLocker();
  const ops = useOps('stash');
  const toast = useToast();
  const loot = useCollection<Loot>(`blacksites/${s.id}/loot`) ?? [];
  const [into, setInto] = useState('onme');
  const [give, setGive] = useState<Record<string, Record<string, string>>>({});
  const lead = can('manageOps') || isLead;
  const open = s.lootStatus === 'open';
  const leftovers = loot.filter((l) => l.qty > 0 && !l.dumped);
  const canStash = canSee('stash') || canSee('narcotics');
  const mine = loot.filter((l) => (l.assigned?.[me.id] ?? 0) > (l.collected?.[me.id] ?? 0));

  const even = (l: Loot) => {
    const n = s.participants.length;
    const each = Math.floor(l.qty / n);
    let extra = l.qty - each * n;
    setGive({ ...give, [l.id]: Object.fromEntries(s.participants.map((p) => [p, String(each + (extra-- > 0 ? 1 : 0))])) });
  };
  async function hand(l: Loot) {
    const g = Object.fromEntries(Object.entries(give[l.id] ?? {}).map(([k, v]) => [k, Math.round(+v || 0)]));
    const total = Object.values(g).reduce((t, v) => t + v, 0);
    if (!total) return;
    const done = await assignLoot(s.id, l.id, g);
    setGive({ ...give, [l.id]: {} });
    toast.done({ text: `Handed out ${done} × ${l.label}.` });
  }
  async function collect() {
    for (const l of mine) {
      const n = (l.assigned?.[me.id] ?? 0) - (l.collected?.[me.id] ?? 0);
      await ops.applyDeltas([{ loc: lockerPath(me.id, into), field: l.field as Thing['field'], strain: (l.strain ?? undefined) as Thing['strain'], item: l.item ?? undefined, delta: n }]);
      await markCollected(s.id, l.id, me.id, l.assigned![me.id]!);
    }
    toast.done({ text: `Your loot is in ${locker.storages.find((x) => x.id === into)?.name}.` });
  }
  // Drug loot isn't stashed here: NoelOps owns drug stock, so it's added there by hand.
  const dumpable = leftovers.filter((l) => !!l.item);
  async function dump() {
    for (const l of dumpable) {
      await ops.applyDeltas([{ loc: s.stashTo, field: l.field as Thing['field'], strain: (l.strain ?? undefined) as Thing['strain'], item: l.item ?? undefined, delta: l.qty }]);
      await markDumped(s.id, l.id);
    }
    toast.done({ text: `Leftovers are in ${locLabel(s.stashTo)}.` });
  }

  if (!loot.length) return null;
  return (
    <Panel title="Loot" right={<span className="text-xs text-smoke">{open ? (lead ? 'Hand it out below' : 'Leadership is splitting it') : <><Lock className="mr-1 inline size-3" />Done</>}</span>}>
      {mine.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border border-gold-600/40 bg-gold-400/5 p-2.5 text-sm">
          <Package className="size-4 text-gold-300" />
          <span className="flex-1 text-gold-100">
            You were given {mine.map((l) => `${(l.assigned?.[me.id] ?? 0) - (l.collected?.[me.id] ?? 0)} × ${l.label}`).join(', ')}
          </span>
          <select className="input w-auto py-1 text-xs" value={into} onChange={(e) => setInto(e.target.value)}>
            {locker.storages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
          <button className="btn-gold btn-sm" onClick={collect}>
            Put it in my locker
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {loot.map((l) => (
          <li key={l.id} className="border border-line-soft p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Package className="size-4 text-gold-400" />
              <span className="font-semibold text-gold-100">{l.label}</span>
              <span className="font-mono text-xs text-gold-300">{l.dumped ? 'rest stashed' : `${l.qty} in the pile`}</span>
              <span className="flex flex-wrap gap-x-2 text-xs text-smoke">
                {Object.entries({ ...(l.claims ?? {}), ...(l.assigned ?? {}) })
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <span key={k}>
                      <MemberName id={k} className="text-xs" /> ×{v}
                      {(l.collected?.[k] ?? 0) >= v && l.assigned?.[k] ? ' ✓' : ''}
                    </span>
                  ))}
              </span>
              {open && lead && l.qty > 0 && (
                <button className="btn-ghost btn-sm ml-auto" onClick={() => even(l)}>
                  Even split
                </button>
              )}
            </div>
            {open && lead && l.qty > 0 && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {s.participants.map((p) => (
                  <label key={p} className="text-[11px] text-smoke">
                    <MemberName id={p} className="text-[11px]" />
                    <input
                      className="input mt-0.5 w-16 py-1 font-mono text-xs"
                      inputMode="numeric"
                      placeholder="0"
                      value={give[l.id]?.[p] ?? ''}
                      onChange={(e) => setGive({ ...give, [l.id]: { ...(give[l.id] ?? {}), [p]: e.target.value.replace(/\D/g, '') } })}
                    />
                  </label>
                ))}
                <button className="btn-gold btn-sm" onClick={() => hand(l)}>
                  Hand out
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {open && lead && (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              await closeDraw(s.id, me.id);
              if (canStash) await dump();
            }}
          >
            <Lock className="size-3.5" /> Done splitting{canStash ? ' · stash the rest' : ''}
          </button>
        )}
        {!open && dumpable.length > 0 &&
          (canStash ? (
            <button className="btn-gold btn-sm" onClick={dump}>
              Put {dumpable.reduce((t, l) => t + l.qty, 0)} leftovers in {locLabel(s.stashTo)}
            </button>
          ) : (
            <span className="text-xs text-smoke">Waiting for someone with stash access to put the leftovers in {locLabel(s.stashTo)}.</span>
          ))}
        {!open && leftovers.length > dumpable.length && <span className="text-xs text-smoke">Leftover drugs go into a stash in NoelOps by hand.</span>}
      </div>
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
            {netRep(s) >= 0 ? '+' : ''}
            {netRep(s).toLocaleString()} rep{s.calledIn ? ` (+${s.rep.toLocaleString()} earned, −${CALL_IN_COST} to call it in)` : ''}
            {s.repStatus === 'pending' ? ' · waiting on Lieutenant+' : s.repStatus === 'rejected' ? ' · turned down' : ''}
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
              <button
                className="btn-gold btn-sm"
                onClick={() =>
                  decideRep(s, me.id, true).then(() =>
                    notify('blacksite.confirmed', {
                      title: `✅ ${s.zone}: ${netRep(s) >= 0 ? '+' : ''}${netRep(s).toLocaleString()} rep confirmed`,
                      description: `${resultOf(s.result).label}${s.rivals.length ? ` vs ${s.rivals.join(', ')}` : ''}. Confirmed by ${me.name}.`,
                      fields: m.ids.length ? [{ name: 'MVP', value: m.ids.map((id) => memberById.get(id)?.name ?? '?').join(' & '), inline: true }] : [],
                    }),
                  )
                }
              >
                <Check className="size-3.5" /> Confirm {netRep(s).toLocaleString()} rep
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
          <p className={`font-mono text-base ${s.repStatus === 'confirmed' ? 'text-ok' : s.repStatus === 'rejected' ? 'text-smoke line-through' : 'text-gold-300'}`}>
            {netRep(s) >= 0 ? '+' : ''}
            {netRep(s).toLocaleString()}
          </p>
          {s.calledIn && <p className="text-[10px] text-smoke">called in</p>}
          <p className="text-smoke">{s.repStatus === 'pending' ? 'rep pending' : s.repStatus === 'confirmed' ? 'rep in' : 'turned down'}</p>
          {s.lootStatus === 'open' && <p className="mt-1 text-gold-300">Loot to split</p>}
          {needsMe && <p className="mt-1 text-danger">Add your line</p>}
        </div>
      </div>
    </button>
  );
}

const MAP_SRC = '/map/city.jpg';
const PLACEHOLDER = '/map/placeholder.svg';

/** Our record at a set of fights. */
function tally(fights: Blacksite[]) {
  return {
    win: fights.filter((f) => f.result === 'win').length,
    draw: fights.filter((f) => f.result === 'draw').length,
    loss: fights.filter((f) => f.result === 'loss').length,
  };
}
/** Captures in a row, newest first. */
const streakOf = (fights: Blacksite[]) => {
  let n = 0;
  for (const f of fights) {
    if (f.result !== 'win') break;
    n++;
  }
  return n;
};

function WinLoss({ fights }: { fights: Blacksite[] }) {
  const t = tally(fights);
  return (
    <span className="font-mono text-xs">
      <span className="text-ok">{t.win}W</span> · <span className="text-gold-300">{t.draw}C</span> · <span className="text-red-300">{t.loss}L</span>
    </span>
  );
}

/** One location: its record, rivals seen there, top fighters, and leadership's notes. */
function SpotCard({ spot, fights, spots, lead, selected, onSelect, onPlace }: { spot: Spot; fights: Blacksite[]; spots: Spot[]; lead: boolean; selected: boolean; onSelect: () => void; onPlace: () => void }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(spot.notes ?? '');
  const [name, setName] = useState(spot.name);
  const [mergeInto, setMergeInto] = useState('');
  const streak = streakOf(fights);
  const rivals = new Map<string, Blacksite[]>();
  fights.forEach((f) => f.rivals.forEach((r) => rivals.set(r, [...(rivals.get(r) ?? []), f])));
  const recs = [...records(fights).values()].sort((a, b) => b.kills - a.kills || b.mvps - a.mvps).slice(0, 3);
  const last = fights[0];
  return (
    <div className={`hud cursor-pointer p-4 transition ${selected ? 'ring-1 ring-gold-400' : ''}`} onClick={onSelect}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <p className="font-hud text-lg font-bold text-gold-100">{spot.name}</p>
          <p className="text-xs text-smoke">
            {fights.length} {fights.length === 1 ? 'fight' : 'fights'} · <WinLoss fights={fights} />
            {streak > 1 && <span className="ml-1 text-ok">· {streak} held in a row</span>}
          </p>
        </span>
        {last && (
          <span className="text-right text-[11px] text-smoke">
            Last: <span style={{ color: resultOf(last.result).color }}>{resultOf(last.result).label}</span>
            <span className="block">{ago(last.at)}</span>
          </span>
        )}
      </div>
      {rivals.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...rivals].map(([r, fs]) => (
            <span key={r} className="chip bg-raised px-2 py-0.5 text-[11px] text-ash">
              vs {r} <WinLoss fights={fs} />
            </span>
          ))}
        </div>
      )}
      {recs.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-smoke">
          Top here:
          {recs.map((r) => (
            <span key={r.id}>
              <MemberName id={r.id} className="text-xs" /> {r.kills}k{r.mvps ? ` · ${r.mvps}★` : ''}
            </span>
          ))}
        </p>
      )}
      {spot.notes && !editing && <p className="mt-2 text-sm whitespace-pre-wrap text-ash">{spot.notes}</p>}
      {lead && !editing && (
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost btn-sm" onClick={onPlace}>
            <MapPin className="size-3.5" /> {spot.x != null ? 'Move on map' : 'Place on map'}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Notes
          </button>
        </div>
      )}
      {editing && (
        <form
          className="mt-2 space-y-2"
          onClick={(e) => e.stopPropagation()}
          onSubmit={async (e) => {
            e.preventDefault();
            await saveSpot(spot.id, { name: name.trim().slice(0, 60) || spot.name, notes: notes.slice(0, 1000) });
            setEditing(false);
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Good angles, where to park, choke points…" />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-gold btn-sm">Save</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <select className="input ml-auto w-auto py-1 text-xs" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
              <option value="">Same place as…</option>
              {spots
                .filter((x) => x.id !== spot.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
            {mergeInto && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  const into = spots.find((x) => x.id === mergeInto)!;
                  if (confirm(`Fold “${spot.name}” into “${into.name}”? Its ${fights.length} fights move over.`)) void mergeSpots(spot, into, fights);
                }}
              >
                Merge
              </button>
            )}
            {!fights.length && (
              <button type="button" className="btn-ghost btn-sm text-red-300" onClick={() => confirm(`Remove “${spot.name}”?`) && removeSpot(spot.id)}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function MapTab({ list, spots, lead }: { list: Blacksite[]; spots: Spot[]; lead: boolean }) {
  const [src, setSrc] = useState(MAP_SRC);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const fightsAt = (sp: Spot) => list.filter((f) => spotOf(f, spots)?.id === sp.id);
  const sorted = [...spots].sort((a, b) => fightsAt(b).length - fightsAt(a).length || a.name.localeCompare(b.name));
  const unplaced = list.filter((f) => !spotOf(f, spots));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="relative self-start overflow-hidden border border-line bg-[#05090c]">
        <div
          className={`relative ${placing ? 'cursor-crosshair' : ''}`}
          onClick={(e) => {
            if (!placing) return;
            const r = e.currentTarget.getBoundingClientRect();
            void saveSpot(placing, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
            setPlacing(null);
          }}
        >
          <img src={src} alt="City map" className="block w-full select-none" draggable={false} onError={() => src !== PLACEHOLDER && setSrc(PLACEHOLDER)} />
          {spots
            .filter((sp) => sp.x != null && sp.y != null)
            .map((sp) => {
              const fs = fightsAt(sp);
              const last = fs[0]?.result;
              return (
                <button
                  key={sp.id}
                  className={`bs-flag ${last ?? 'none'} ${selected === sp.id ? 'on' : ''}`}
                  style={{ left: `${sp.x! * 100}%`, top: `${sp.y! * 100}%` }}
                  onClick={(e) => (e.stopPropagation(), setSelected(sp.id))}
                  title={`${sp.name} · ${fs.length} fights`}
                >
                  {last === 'win' ? <Flag className="size-4" /> : last === 'loss' ? <X className="size-4" /> : <Swords className="size-3.5" />}
                  <span className="bs-flag-label">{sp.name}</span>
                </button>
              );
            })}
        </div>
        {placing && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="hud flex items-center gap-2 px-3 py-1.5 text-sm text-gold-100">
              <MapPin className="size-4 text-gold-400" /> Tap the map where {spots.find((x) => x.id === placing)?.name} is
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t border-line-soft px-3 py-2 text-[11px] text-smoke">
          <span className="flex items-center gap-1">
            <Flag className="size-3 text-gold-300" /> We held it last
          </span>
          <span className="flex items-center gap-1">
            <X className="size-3 text-red-400" /> We lost it last
          </span>
          <span className="flex items-center gap-1">
            <Swords className="size-3 text-ash" /> Contested
          </span>
        </div>
      </div>
      <div className="max-h-[75dvh] space-y-3 overflow-y-auto pr-1">
        {sorted.map((sp) => (
          <SpotCard key={sp.id} spot={sp} fights={fightsAt(sp)} spots={spots} lead={lead} selected={selected === sp.id} onSelect={() => setSelected(sp.id)} onPlace={() => setPlacing(sp.id)} />
        ))}
        {!spots.length && (
          <Empty icon={<MapPin className="size-6" />} title="No locations yet">
            Logging a fight adds its location here.
          </Empty>
        )}
        {unplaced.length > 0 && <p className="text-xs text-smoke">{unplaced.length} older fights aren’t tied to a location yet.</p>}
      </div>
    </div>
  );
}

function RivalsTab({ list }: { list: Blacksite[] }) {
  const rivals = new Map<string, Blacksite[]>();
  list.forEach((f) => f.rivals.forEach((r) => rivals.set(r, [...(rivals.get(r) ?? []), f])));
  const rows = [...rivals].sort((a, b) => b[1].length - a[1].length);
  return (
    <Panel title="Rival gangs" pad={false}>
      {rows.length ? (
        <ul className="divide-y divide-line-soft">
          {rows.map(([r, fs]) => {
            const places = [...new Set(fs.map((f) => f.zone))];
            return (
              <li key={r} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="font-hud text-lg font-bold text-gold-100">{r}</span>
                  <span className="block text-xs text-smoke">
                    {fs.length} {fs.length === 1 ? 'fight' : 'fights'} · last seen {ago(fs[0]!.at)} at {fs[0]!.zone}
                    {places.length > 1 ? ` · also at ${places.filter((p) => p !== fs[0]!.zone).join(', ')}` : ''}
                  </span>
                </span>
                <WinLoss fights={fs} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-4 text-sm text-smoke">No rivals logged yet. Add them when logging a fight.</p>
      )}
    </Panel>
  );
}

function Body() {
  const { can, isLead, memberById } = useHub();
  const sites = useCollection<Blacksite>('blacksites');
  const spots = useCollection<Spot>('blacksiteSpots') ?? [];
  const [tab, setTab] = useState<'map' | 'fights' | 'people' | 'rivals'>('map');
  const [logging, setLogging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Blacksite | null>(null);
  const [sortBy, setSortBy] = useState<'kills' | 'kd' | 'mvps' | 'fights' | 'logistics'>('kills');
  const list = useMemo(() => [...(sites ?? [])].sort((a, b) => b.at.toMillis() - a.at.toMillis()), [sites]);
  const recs = useMemo(() => records(list), [list]);
  const open = list.find((s) => s.id === openId);
  const lead = can('manageOps') || isLead;

  const wins = list.filter((s) => s.result === 'win').length;
  const repIn = list.filter((s) => s.repStatus === 'confirmed').reduce((t, s) => t + netRep(s), 0);
  const repWait = list.filter((s) => s.repStatus === 'pending').reduce((t, s) => t + netRep(s), 0);
  const kd = (p: { kills: number; downs: number }) => p.kills / Math.max(1, p.downs);
  const people = [...recs.values()].sort((a, b) => (sortBy === 'kd' ? kd(b) - kd(a) : b[sortBy] - a[sortBy]) || b.kills - a.kills);
  const streak = streakOf(list);
  // MVP spotlight: the newest fight with an MVP.
  const spot = list.find((s) => mvps(s).ids.length);
  const star = spot ? mvps(spot).ids[0] : undefined;

  return (
    <>
      <PageHeader
        icon={Crosshair}
        kicker="Operations"
        title="Blacksites"
        sub="The record of every King of the Hill fight, by location. Anyone who was there (or whoever called it in) logs it; everyone fills in their own line and votes the MVP; leadership splits the loot."
        actions={
          <button className="btn-gold" onClick={() => setLogging(true)}>
            <Plus className="size-4" /> Log a fight
          </button>
        }
      />
      {(streak > 1 || star) && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {streak > 1 && (
            <div className="bs-streak hud flex items-center gap-3 px-4 py-3">
              <Flag className="size-7 text-gold-300" />
              <span>
                <span className="block font-display text-2xl text-gold-100">{streak} captures in a row</span>
                <span className="text-xs text-smoke">Since {fmtDate(list[streak - 1]!.at)}</span>
              </span>
            </div>
          )}
          {star && spot && (
            <button className="hud flex items-center gap-3 px-4 py-3 text-left hover:bg-raised/40" onClick={() => setOpenId(spot.id)}>
              <span className="relative">
                <Avatar member={memberById.get(star)} size="lg" />
                <Crown className="absolute -top-3 left-1/2 size-5 -translate-x-1/2 text-gold-300 drop-shadow-[0_0_6px_#d4af37]" />
              </span>
              <span className="min-w-0">
                <span className="label block text-[10px]">Latest MVP</span>
                <MemberName id={star} className="font-display text-xl" />
                <span className="block text-xs text-smoke">
                  {spot.stats?.[star]?.kills ?? 0} kills at {spot.zone} · {ago(spot.at)}
                </span>
              </span>
            </button>
          )}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fights" value={list.length} sub={`${list.filter((s) => s.at.toMillis() > Date.now() - 30 * 86400e3).length} in the last 30 days`} />
        <Stat label="Held" value={list.length ? `${Math.round((wins / list.length) * 100)}%` : '—'} sub={`${wins} captures`} />
        <Stat label="Rep (net)" value={<span className={repIn >= 0 ? 'text-ok' : 'text-red-300'}>{repIn.toLocaleString()}</span>} sub={repWait ? `${repWait.toLocaleString()} waiting on Lieutenant+` : 'All confirmed'} />
        <Stat label="Locations" value={spots.length} sub={`${spots.filter((x) => x.x != null).length} on the map`} />
      </div>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'map', label: 'Map' },
            { id: 'fights', label: `Fights · ${list.length}` },
            { id: 'people', label: 'Fighters' },
            { id: 'rivals', label: 'Rivals' },
          ]}
        />
      </div>

      {tab === 'map' && <MapTab list={list} spots={spots} lead={lead} />}

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
              <option value="kd">Best K/D</option>
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
                    <td className="px-2 text-right font-mono">{kd(p).toFixed(2)}</td>
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

      {tab === 'rivals' && <RivalsTab list={list} />}

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
