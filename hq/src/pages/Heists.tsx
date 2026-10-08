import { Banknote, Gem, Hand, Package, Pencil, Plus, Radio, Square, Trash2, Undo2, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { ItemPicker } from '../components/ItemPicker';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { fmtDate, fmtTime } from '../lib/format';
import {
  assignItems,
  bankRest,
  collectCash,
  editHeist,
  finishHeist,
  giveCash,
  HEIST_ROLES,
  markItemsCollected,
  markItemsDumped,
  planHeist,
  removeHeist,
  requestJoin,
  setCrew,
  setLive,
  TARGETS,
  withdraw,
  type Heist,
  type HeistDraft,
  type HeistLoot,
  type HeistRole,
} from '../lib/heists';
import { itemTitle, type ItemType } from '../lib/items';
import { useLocker, type Thing } from '../lib/locker';
import { lockerPath, useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';
import { useWelcomeAccess } from './welcome/useWelcome';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const digits = (v: string) => v.replace(/\D/g, '');
/** A local date-time input value for a Date. */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const given = (h: Heist) => Object.values(h.cashGiven ?? {}).reduce((t, v) => t + v, 0);

function PlanDialog({ h, onClose }: { h?: Heist; onClose: () => void }) {
  const { me } = useHub();
  const [d, setD] = useState<HeistDraft>({ name: h?.name ?? '', target: h?.target ?? TARGETS[0]!, notes: h?.notes ?? '', size: h?.size ?? 4, when: h?.when?.toDate() ?? null });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={h ? 'Edit heist' : 'Plan a heist'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await (h ? editHeist(h.id, d) : planHeist(me, d));
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name">
          <input className="input" value={d.name} maxLength={60} required autoFocus placeholder="e.g. Friday Fleeca" onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Target">
          <div className="flex flex-wrap gap-1.5">
            {TARGETS.map((t) => (
              <button key={t} type="button" className={`chip px-2.5 py-1 text-xs ${d.target === t ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => setD({ ...d, target: t })}>
                {t}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When (optional)">
            <input type="datetime-local" className="input" value={d.when ? local(d.when) : ''} onChange={(e) => setD({ ...d, when: e.target.value ? new Date(e.target.value) : null })} />
          </Field>
          <Field label="Crew size (0 = no cap)">
            <input className="input w-24 font-mono" inputMode="numeric" value={d.size || ''} onChange={(e) => setD({ ...d, size: Number(digits(e.target.value)) || 0 })} />
          </Field>
        </div>
        <Field label="Plan & notes">
          <textarea className="input min-h-28 text-sm" value={d.notes} maxLength={1000} placeholder="Cars, gear, the way in and the way out…" onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold" disabled={busy || !d.name.trim()}>
            {h ? 'Save' : 'Plan it'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoleChips({ value, onChange }: { value: HeistRole; onChange: (r: HeistRole) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {HEIST_ROLES.map((r) => (
        <button key={r} type="button" className={`chip px-2.5 py-1 text-xs ${value === r ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => onChange(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** Asking to join: the role I'd take and a word for the planner. */
function RequestDialog({ h, onClose }: { h: Heist; onClose: () => void }) {
  const { me } = useHub();
  const mine = h.requests?.[me.id];
  const [role, setRole] = useState<HeistRole>(mine?.role ?? 'Any');
  const [note, setNote] = useState(mine?.note ?? '');
  return (
    <Modal title={`Ask to join ${h.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await requestJoin(h.id, me.id, role, note);
          onClose();
        }}
      >
        <Field label="The role you'd take">
          <RoleChips value={role} onChange={setRole} />
        </Field>
        <Field label="Note for the planner (optional)">
          <input className="input" value={note} maxLength={120} placeholder="e.g. I've got a fast car and a drill" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-smoke">The planner picks the crew. Anyone not picked stays on as a backup.</p>
        <div className="flex justify-end">
          <button className="btn-gold">{mine ? 'Update my request' : 'Ask to join'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The planner picks the crew from who asked (or adds anyone soldier and up) and sets their roles. */
function CrewDialog({ h, onClose }: { h: Heist; onClose: () => void }) {
  const { roster } = useHub();
  const { assocRank } = useWelcomeAccess();
  const [crew, setCrewIds] = useState<string[]>(h.crew);
  const [roles, setRoles] = useState<Record<string, HeistRole>>(() => ({
    ...Object.fromEntries(Object.entries(h.requests ?? {}).map(([k, r]) => [k, r.role])),
    ...(h.roles ?? {}),
  }));
  const [add, setAdd] = useState('');
  const asked = Object.keys(h.requests ?? {});
  const people = [...new Set([...asked, ...crew])];
  const others = roster.filter((m) => m.rankId !== assocRank?.id && !people.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  const full = !!h.size && crew.length >= h.size;
  const toggle = (id: string) => setCrewIds(crew.includes(id) ? crew.filter((x) => x !== id) : [...crew, id]);
  return (
    <Modal title={`Crew for ${h.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-ash">
          Tap someone to put them on the crew. Everyone else who asked stays as a backup.{' '}
          <b className="font-mono text-gold-200">
            {crew.length}
            {h.size ? `/${h.size}` : ''}
          </b>
        </p>
        <ul className="space-y-2">
          {people.map((id) => {
            const on = crew.includes(id);
            const req = h.requests?.[id];
            return (
              <li key={id} className={`heist-pick ${on ? 'heist-pick-on' : ''}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" disabled={!on && full} onClick={() => toggle(id)}>
                  <span className={`heist-tick ${on ? 'on' : ''}`} aria-hidden />
                  <MemberName id={id} />
                  {req ? <span className="truncate text-xs text-smoke">asked for {req.role}{req.note ? ` · “${req.note}”` : ''}</span> : <span className="text-xs text-smoke">added by you</span>}
                </button>
                {on && (
                  <select className="input w-auto py-1 text-xs" value={roles[id] ?? 'Any'} onChange={(e) => setRoles({ ...roles, [id]: e.target.value as HeistRole })} aria-label="Role">
                    {HEIST_ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
          {!people.length && <li className="p-3 text-center text-sm text-smoke">Nobody has asked yet.</li>}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add someone who didn't ask">
            <select className="input" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Choose…</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="btn-ghost btn-sm mb-1" disabled={!add || full} onClick={() => (setCrewIds([...crew, add]), setAdd(''))}>
            <UserPlus className="size-3.5" /> Add
          </button>
        </div>
        <div className="flex justify-end">
          <button
            className="btn-gold"
            onClick={async () => {
              await setCrew(h.id, crew, Object.fromEntries(crew.map((id) => [id, roles[id] ?? 'Any'])));
              onClose();
            }}
          >
            Save crew
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** How it went: outcome, the cash and items it brought home, and where leftover items go. */
function FinishDialog({ h, onClose }: { h: Heist; onClose: () => void }) {
  const { me } = useHub();
  const { storage, locLabel } = useNarcotics();
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const [outcome, setOutcome] = useState<'success' | 'failed'>('success');
  const [take, setTake] = useState(0);
  const [report, setReport] = useState('');
  const [items, setItems] = useState<{ item: string; label: string; qty: number }[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState('1');
  const [stashTo, setStashTo] = useState(storage[0]?.id ?? 'main');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`How did ${h.name} go?`} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await finishHeist(me, h, { outcome, take, report, items, stashTo });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex gap-1.5">
          {(['success', 'failed'] as const).map((o) => (
            <button key={o} type="button" className={`chip px-3 py-1.5 text-xs ${outcome === o ? (o === 'success' ? 'border-ok bg-ok/10 text-ok' : 'border-red-400 bg-red-500/10 text-red-300') : 'text-smoke'}`} onClick={() => setOutcome(o)}>
              {o === 'success' ? 'Got away with it' : 'Went wrong'}
            </button>
          ))}
        </div>
        <Field label="Cash brought home (dirty, optional)">
          <input className="input w-40 font-mono" inputMode="numeric" value={take || ''} placeholder="0" onChange={(e) => setTake(Number(digits(e.target.value)) || 0)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label mb-1.5 block">Items brought home (optional)</span>
            <ItemPicker types={types} value={pick} onChange={setPick} />
            <div className="mt-1.5 flex gap-2">
              <input className="input w-20 font-mono" inputMode="numeric" value={pickQty} onChange={(e) => setPickQty(digits(e.target.value))} />
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={!pick}
                onClick={() => {
                  const q = Math.max(1, Math.round(+pickQty || 1));
                  setItems([...items.filter((l) => l.item !== pick), { item: pick!, qty: q + (items.find((l) => l.item === pick)?.qty ?? 0), label: itemTitle(byId.get(pick!), byId) }]);
                }}
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <ul className="divide-y divide-line-soft border border-line-soft">
              {items.map((l) => (
                <li key={l.item} className="flex items-center gap-2 px-2 py-1 text-sm">
                  <span className="flex-1 text-gold-100">{l.label}</span>
                  <span className="font-mono text-gold-300">×{l.qty}</span>
                  <button type="button" className="text-smoke hover:text-danger" onClick={() => setItems(items.filter((x) => x !== l))} aria-label="Remove">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
              {!items.length && <li className="p-3 text-center text-xs text-smoke">No items.</li>}
            </ul>
            {items.length > 0 && (
              <Field label="Leftover items go to">
                <select className="input" value={stashTo} onChange={(e) => setStashTo(e.target.value)}>
                  {storage.map((l) => (
                    <option key={l.id} value={l.id}>
                      {locLabel(l.id)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </div>
        <Field label="What happened (optional)">
          <textarea className="input min-h-20 text-sm" value={report} maxLength={1000} onChange={(e) => setReport(e.target.value)} />
        </Field>
        <p className="text-xs text-smoke">You hand the cash and items out to the crew after this. Whatever cash isn't handed out goes to the gang bank.</p>
        <div className="flex justify-between">
          <button type="button" className="btn-ghost btn-sm" onClick={() => confirm('Call it off?') && finishHeist(me, h, 'cancel').then(onClose)}>
            Call it off instead
          </button>
          <button className="btn-gold" disabled={busy}>
            Close it out
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The take, handed out like Blacksite loot: cash to the crew's money, items to their lockers. */
function Rewards({ h }: { h: Heist }) {
  const { me, isLead, canSee, preview } = useHub();
  const { locLabel } = useNarcotics();
  const locker = useLocker();
  const ops = useOps('stash');
  const toast = useToast();
  const loot = useCollection<HeistLoot>(`heists/${h.id}/loot`) ?? [];
  const [cash, setCash] = useState<Record<string, string>>({});
  const [give, setGive] = useState<Record<string, Record<string, string>>>({});
  const [into, setInto] = useState('onme');
  const lead = isLead && !preview;
  const left = (h.take ?? 0) - given(h);
  const owed = (h.cashGiven?.[me.id] ?? 0) - (h.cashCollected?.[me.id] ?? 0);
  const mine = loot.filter((l) => (l.assigned?.[me.id] ?? 0) > (l.collected?.[me.id] ?? 0));
  const leftovers = loot.filter((l) => l.qty > 0 && !l.dumped);
  const canStash = canSee('stash') || canSee('narcotics');
  const n = h.crew.length;
  const split = (total: number) => {
    const each = Math.floor(total / n);
    let extra = total - each * n;
    return Object.fromEntries(h.crew.map((p) => [p, String(each + (extra-- > 0 ? 1 : 0))]));
  };
  if (!(h.take ?? 0) && !loot.length) return null;

  async function collectItems() {
    for (const l of mine) {
      const q = (l.assigned?.[me.id] ?? 0) - (l.collected?.[me.id] ?? 0);
      await ops.applyDeltas([{ loc: lockerPath(me.id, into), field: 'meth' as Thing['field'], item: l.item, delta: q }]);
      await markItemsCollected(h.id, l.id, me.id, l.assigned![me.id]!);
    }
    toast.done({ text: `Your cut is in ${locker.storages.find((x) => x.id === into)?.name}.` });
  }
  async function stash() {
    for (const l of leftovers) {
      await ops.applyDeltas([{ loc: h.stashTo ?? 'main', field: 'meth' as Thing['field'], item: l.item, delta: l.qty }]);
      await markItemsDumped(h.id, l.id);
    }
    toast.done({ text: `Leftovers are in ${locLabel(h.stashTo ?? 'main')}.` });
  }

  return (
    <div className="heist-rewards">
      {(owed > 0 || mine.length > 0) && !preview && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border border-gold-600/40 bg-gold-400/5 p-2.5 text-sm">
          <Hand className="size-4 text-gold-300" />
          <span className="flex-1 text-gold-100">
            Your cut: {[owed > 0 && money(owed), ...mine.map((l) => `${(l.assigned?.[me.id] ?? 0) - (l.collected?.[me.id] ?? 0)} × ${l.label}`)].filter(Boolean).join(', ')}
          </span>
          {owed > 0 && (
            <button className="btn-gold btn-sm" onClick={() => toast.run(collectCash(me, h).then((x) => ({ text: `${money(x)} dirty is in your Money.` })))}>
              <Banknote className="size-3.5" /> Put cash in my Money
            </button>
          )}
          {mine.length > 0 && (
            <>
              <select className="input w-auto py-1 text-xs" value={into} onChange={(e) => setInto(e.target.value)} aria-label="Locker">
                {locker.storages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
              <button className="btn-gold btn-sm" onClick={() => toast.run(collectItems().then(() => null))}>
                <Package className="size-3.5" /> Items to my locker
              </button>
            </>
          )}
        </div>
      )}

      {(h.take ?? 0) > 0 && (
        <div className="border border-line-soft p-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Banknote className="size-4 text-red-300" />
            <span className="font-semibold text-gold-100">Cash</span>
            <span className="font-mono text-xs text-red-200">{h.banked ? `rest banked` : `${money(left)} not handed out`}</span>
            <span className="flex flex-wrap gap-x-2 text-xs text-smoke">
              {Object.entries(h.cashGiven ?? {})
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <span key={k}>
                    <MemberName id={k} className="text-xs" /> {money(v)}
                    {(h.cashCollected?.[k] ?? 0) >= v ? ' ✓' : ''}
                  </span>
                ))}
            </span>
            {lead && !h.banked && left > 0 && n > 0 && (
              <button className="btn-ghost btn-sm ml-auto" onClick={() => setCash(split(left))}>
                Even split
              </button>
            )}
          </div>
          {lead && !h.banked && left > 0 && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {h.crew.map((p) => (
                <label key={p} className="text-[11px] text-smoke">
                  <MemberName id={p} className="text-[11px]" />
                  <input className="input mt-0.5 w-24 py-1 font-mono text-xs" inputMode="numeric" placeholder="0" value={cash[p] ?? ''} onChange={(e) => setCash({ ...cash, [p]: digits(e.target.value) })} />
                </label>
              ))}
              {n > 0 && (
                <button
                  className="btn-gold btn-sm"
                  onClick={() =>
                    toast.run(
                      giveCash(h, Object.fromEntries(Object.entries(cash).map(([k, v]) => [k, +v || 0]))).then(() => {
                        setCash({});
                        return { text: 'Cash handed out.' };
                      }),
                    )
                  }
                >
                  Hand out
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={() => confirm(`Send ${money(left)} to the gang bank? No more cash can be handed out after.`) && toast.run(bankRest(me, h).then((x) => ({ text: `${money(x)} went to the gang bank.` })))}>
                Bank the rest
              </button>
            </div>
          )}
        </div>
      )}

      {loot.length > 0 && (
        <ul className="mt-2 space-y-2">
          {loot.map((l) => (
            <li key={l.id} className="border border-line-soft p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="size-4 text-gold-400" />
                <span className="font-semibold text-gold-100">{l.label}</span>
                <span className="font-mono text-xs text-gold-300">{l.dumped ? 'rest stashed' : `${l.qty} in the pile`}</span>
                <span className="flex flex-wrap gap-x-2 text-xs text-smoke">
                  {Object.entries(l.assigned ?? {})
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span key={k}>
                        <MemberName id={k} className="text-xs" /> ×{v}
                        {(l.collected?.[k] ?? 0) >= v ? ' ✓' : ''}
                      </span>
                    ))}
                </span>
                {lead && l.qty > 0 && n > 0 && (
                  <button
                    className="btn-ghost btn-sm ml-auto"
                    onClick={() => {
                      const each = Math.floor(l.qty / n);
                      let extra = l.qty - each * n;
                      setGive({ ...give, [l.id]: Object.fromEntries(h.crew.map((p) => [p, String(each + (extra-- > 0 ? 1 : 0))])) });
                    }}
                  >
                    Even split
                  </button>
                )}
              </div>
              {lead && l.qty > 0 && n > 0 && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {h.crew.map((p) => (
                    <label key={p} className="text-[11px] text-smoke">
                      <MemberName id={p} className="text-[11px]" />
                      <input className="input mt-0.5 w-16 py-1 font-mono text-xs" inputMode="numeric" placeholder="0" value={give[l.id]?.[p] ?? ''} onChange={(e) => setGive({ ...give, [l.id]: { ...(give[l.id] ?? {}), [p]: digits(e.target.value) } })} />
                    </label>
                  ))}
                  <button
                    className="btn-gold btn-sm"
                    onClick={() =>
                      toast.run(
                        assignItems(h.id, l.id, Object.fromEntries(Object.entries(give[l.id] ?? {}).map(([k, v]) => [k, +v || 0]))).then(() => {
                          setGive({ ...give, [l.id]: {} });
                          return { text: `Handed out ${l.label}.` };
                        }),
                      )
                    }
                  >
                    Hand out
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {lead && leftovers.length > 0 && (
        <div className="mt-2">
          {canStash ? (
            <button className="btn-ghost btn-sm" onClick={() => confirm('Put every leftover item in the stash?') && toast.run(stash().then(() => null))}>
              Put {leftovers.reduce((t, l) => t + l.qty, 0)} leftover items in {locLabel(h.stashTo ?? 'main')}
            </button>
          ) : (
            <span className="text-xs text-smoke">Someone with stash access puts the leftovers in {locLabel(h.stashTo ?? 'main')}.</span>
          )}
        </div>
      )}
    </div>
  );
}

function HeistCard({ h }: { h: Heist }) {
  const { me, isLead, preview } = useHub();
  const [dialog, setDialog] = useState<'edit' | 'finish' | 'ask' | 'crew' | null>(null);
  const onCrew = h.crew.includes(me.id);
  const asked = !!h.requests?.[me.id];
  const backups = Object.entries(h.requests ?? {}).filter(([id]) => !h.crew.includes(id));
  const open = h.status === 'planned' || h.status === 'live';
  const lead = isLead && !preview;
  return (
    <article className={`heist ${h.status === 'live' ? 'heist-live' : ''} ${open ? '' : 'heist-over'} ${onCrew ? 'heist-mine' : ''}`}>
      <header className="flex flex-wrap items-start gap-3">
        <span className="heist-icon">
          <Gem className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="label text-[10px] text-gold-500">{h.target}</span>
          <b className="block font-display text-xl text-gold-100">{h.name}</b>
          <span className="text-xs text-smoke">
            {h.when ? `${fmtDate(h.when)} · ${fmtTime(h.when)}` : 'No time set'} · planned by {h.byName}
          </span>
        </span>
        <span className={`heist-status s-${h.status === 'done' && h.outcome === 'failed' ? 'failed' : h.status}`}>
          {h.status === 'live' ? (
            <>
              <Radio className="size-3" /> Live
            </>
          ) : h.status === 'done' ? (
            h.outcome === 'success' ? 'Success' : 'Failed'
          ) : h.status === 'cancelled' ? (
            'Called off'
          ) : (
            'Planned'
          )}
        </span>
      </header>
      {h.notes && <p className="mt-3 text-sm whitespace-pre-line text-ash">{h.notes}</p>}
      {h.status === 'done' && (
        <p className="mt-3 text-sm">
          <span className="text-smoke">Take </span>
          <b className="font-mono text-red-200">{money(h.take ?? 0)}</b>
          {h.report && <span className="mt-1 block text-ash">{h.report}</span>}
        </p>
      )}

      <div className="mt-4 border-t border-line-soft pt-3">
        <p className="label mb-1.5 flex items-center gap-1.5 text-[10px] text-smoke">
          <Users className="size-3" /> Crew
          <span className="font-mono">
            {h.crew.length}
            {h.size ? `/${h.size}` : ''}
          </span>
        </p>
        {h.crew.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {h.crew.map((id) => (
              <li key={id} className={`heist-member ${id === me.id ? 'me' : ''}`}>
                <MemberName id={id} className="text-xs" />
                <span className="heist-role">{h.roles?.[id] ?? 'Any'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-smoke">{open ? 'Not picked yet.' : 'No crew.'}</p>
        )}
        {open && backups.length > 0 && (
          <>
            <p className="label mt-3 mb-1.5 text-[10px] text-smoke">{h.crew.length ? 'Backups' : 'Asked to join'} · {backups.length}</p>
            <ul className="space-y-1">
              {backups.map(([id, r]) => (
                <li key={id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <MemberName id={id} className="text-xs" />
                  <span className="text-gold-400">{r.role}</span>
                  {r.note && <span className="text-smoke">“{r.note}”</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {h.status === 'done' && <Rewards h={h} />}

      {!preview && (open || lead) && (
        <footer className="mt-4 flex flex-wrap items-center justify-end gap-1.5 border-t border-line-soft pt-3">
          {open && !onCrew && (
            <button className={asked ? 'btn-ghost btn-sm' : 'btn-gold btn-sm'} onClick={() => setDialog('ask')}>
              <Hand className="size-3.5" /> {asked ? 'Change my request' : 'Ask to join'}
            </button>
          )}
          {open && asked && !onCrew && (
            <button className="btn-ghost btn-sm" onClick={() => confirm('Take your request back?') && withdraw(h.id, me.id)}>
              <Undo2 className="size-3.5" /> Withdraw
            </button>
          )}
          {open && onCrew && <span className="mr-auto text-xs text-gold-300">You're on the crew. Ask leadership if you can't make it.</span>}
          {lead && open && (
            <>
              <button className="btn-ghost btn-sm" onClick={() => setDialog('crew')}>
                <Users className="size-3.5" /> Pick crew
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setLive(me, h, h.status !== 'live')} title="Going live turns on the heist radio and tells the crew">
                {h.status === 'live' ? (
                  <>
                    <Square className="size-3.5" /> Stand down
                  </>
                ) : (
                  <>
                    <Radio className="size-3.5" /> Go live
                  </>
                )}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setDialog('finish')}>
                Close it out
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setDialog('edit')} aria-label="Edit">
                <Pencil className="size-3.5" />
              </button>
            </>
          )}
          {lead && !open && (
            <button className="text-smoke hover:text-red-300" onClick={() => confirm(`Delete ${h.name}?`) && removeHeist(h.id)} aria-label="Delete">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </footer>
      )}
      {dialog === 'edit' && <PlanDialog h={h} onClose={() => setDialog(null)} />}
      {dialog === 'finish' && <FinishDialog h={h} onClose={() => setDialog(null)} />}
      {dialog === 'ask' && <RequestDialog h={h} onClose={() => setDialog(null)} />}
      {dialog === 'crew' && <CrewDialog h={h} onClose={() => setDialog(null)} />}
    </article>
  );
}

function Body() {
  const { isLead, preview } = useHub();
  const all = useCollection<Heist>('heists');
  const [planning, setPlanning] = useState(false);
  const { open, past, total } = useMemo(() => {
    const t = (h: Heist) => h.when?.toMillis() ?? h.at?.toMillis() ?? Date.now();
    const rows = all ?? [];
    const open = rows.filter((h) => h.status === 'planned' || h.status === 'live').sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || t(a) - t(b));
    const past = rows.filter((h) => h.status === 'done' || h.status === 'cancelled').sort((a, b) => (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0));
    return { open, past, total: past.filter((h) => h.status === 'done').reduce((s, h) => s + (h.take ?? 0), 0) };
  }, [all]);
  return (
    <>
      <PageHeader
        icon={Gem}
        kicker="Operations"
        title="Heists"
        sub="Leadership plans the job and picks the crew from who asks. When it goes live, the heist radio lights up and the crew gets the call."
        actions={
          isLead &&
          !preview && (
            <button className="btn-gold" onClick={() => setPlanning(true)}>
              <Plus className="size-4" /> Plan a heist
            </button>
          )
        }
      />
      <div className="space-y-6">
        {open.length ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {open.map((h) => (
              <HeistCard key={h.id} h={h} />
            ))}
          </div>
        ) : (
          <p className="hud p-6 text-center text-sm text-smoke">Nothing planned. {isLead ? 'Plan the next job.' : 'Leadership will put the next job up here.'}</p>
        )}
        {past.length > 0 && (
          <Panel title={`Past jobs · ${past.length}`} right={<span className="font-mono text-xs text-red-200">{money(total)} taken</span>}>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {past.map((h) => (
                <HeistCard key={h.id} h={h} />
              ))}
            </div>
          </Panel>
        )}
      </div>
      {planning && <PlanDialog onClose={() => setPlanning(false)} />}
    </>
  );
}

export default function Heists() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

/** The live heist on the Dashboard: everyone soldier and up sees it; the crew's card is lit up. */
export function LiveHeistBanner() {
  const { me } = useHub();
  const { isAssoc } = useWelcomeAccess();
  const all = useCollection<Heist>('heists', !isAssoc);
  const live = (all ?? []).filter((h) => h.status === 'live');
  if (isAssoc || !live.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {live.map((h) => {
        const mine = h.crew.includes(me.id);
        return (
          <Link key={h.id} to="/heists" className={`heist-banner ${mine ? 'heist-banner-mine' : ''}`}>
            <span className="heist-icon">
              <Radio className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="label text-[10px] text-red-300">Heist live · {h.target}</span>
              <b className="block font-display text-lg text-gold-100">{h.name}</b>
              <span className="text-xs text-ash">{mine ? `You're on the crew as ${h.roles?.[me.id] ?? 'Any'}. Get on the heist radio.` : `${h.crew.length} on the crew. The heist radio is on.`}</span>
            </span>
            <span className="hidden -space-x-2 sm:flex">
              {h.crew.slice(0, 6).map((id) => (
                <CrewFace key={id} id={id} />
              ))}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
function CrewFace({ id }: { id: string }) {
  const { memberById } = useHub();
  const m = memberById.get(id);
  return m ? <Avatar member={m} /> : null;
}

/** Tells each crew member once when their heist goes live. Mounted in the shell. */
export function HeistCall() {
  const { me } = useHub();
  const { isAssoc } = useWelcomeAccess();
  const all = useCollection<Heist>('heists', !isAssoc);
  const [shut, setShut] = useState<string[]>([]);
  const key = (id: string) => `chosenops.heistCall.${id}`;
  const seen = (id: string) => {
    try {
      return !!localStorage.getItem(key(id));
    } catch {
      return false;
    }
  };
  const h = (all ?? []).find((x) => x.status === 'live' && x.crew.includes(me.id) && !shut.includes(x.id) && !seen(x.id));
  if (isAssoc || !h) return null;
  const close = () => {
    try {
      localStorage.setItem(key(h.id), '1');
    } catch {
      /* private window */
    }
    setShut([...shut, h.id]);
  };
  return (
    <Modal title="The heist is live" onClose={close}>
      <div className="space-y-3 text-center">
        <span className="heist-icon mx-auto">
          <Gem className="size-6" />
        </span>
        <p className="font-display text-2xl text-gold-100">{h.name}</p>
        <p className="text-sm text-ash">
          {h.target} · you're the <b className="text-gold-200">{h.roles?.[me.id] ?? 'Any'}</b>. Get on the heist radio (top of the page).
        </p>
        <Link to="/heists" className="btn-gold inline-flex" onClick={close}>
          Open Heists
        </Link>
      </div>
    </Modal>
  );
}
