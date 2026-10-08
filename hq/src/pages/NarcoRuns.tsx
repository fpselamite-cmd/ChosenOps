import { Banknote, Hand, Pencil, Plus, Route, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { fmtDate, fmtTime } from '../lib/format';
import type { BmSettings } from '../lib/money';
import type { Rival } from '../lib/rivals';
import { NARCO_ROLE } from '../lib/roles';
import {
  bankRunRest,
  collectRunCash,
  editRun,
  giveRunCash,
  logRun,
  OUTCOMES,
  outcomeOf,
  removeRun,
  RUN_PRODUCTS,
  runLeft,
  runProduct,
  type NarcoRun,
  type RunLine,
  type RunOutcome,
  type RunTaken,
} from '../lib/runs';
import { budCell, toCount, type StockDoc } from '../noel/data';
import { useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const digits = (v: string) => v.replace(/\D/g, '');
const lineText = (l: RunLine) => `${l.qty.toLocaleString()} × ${runProduct(l.product)?.name ?? l.product}`;
const DAY = 86_400_000;

/** How many of a product a stash holds right now. */
function have(stock: StockDoc | undefined, product: string) {
  const p = runProduct(product);
  if (!p || !stock) return 0;
  return p.strain ? budCell(stock, p.strain)[p.field as 'bricks'] : toCount(stock[p.field as 'meth']);
}

/** The people who can be on a run: Narco and High Table (the only ones who see runs at all). */
function useRunners() {
  const { roster, rankById, rolesOf } = useHub();
  return roster.filter((m) => {
    const r = rankById.get(m.rankId ?? '');
    return r?.order === 0 || r?.leadership || rolesOf(m.id).some((x) => x.id === NARCO_ROLE);
  });
}

function CrewPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const runners = useRunners();
  return (
    <div className="flex flex-wrap gap-1.5">
      {runners.map((m) => {
        const on = value.includes(m.id);
        return (
          <button key={m.id} type="button" className={`chip px-2.5 py-1 text-xs ${on ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])}>
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

function OutcomePicker({ value, onChange, lockOff }: { value: RunOutcome; onChange: (o: RunOutcome) => void; lockOff?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OUTCOMES.filter((o) => !lockOff || (o.id === 'off') === (value === 'off')).map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.hint}
          className="chip px-3 py-1.5 text-xs"
          style={value === o.id ? { borderColor: o.color, color: o.color, background: `${o.color}1a` } : undefined}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BadBits({ outcome, badNote, setBadNote, rivalId, setRivalId }: { outcome: RunOutcome; badNote: string; setBadNote: (v: string) => void; rivalId: string | null; setRivalId: (v: string | null) => void }) {
  const rivals = useCollection<Rival>('rivals') ?? [];
  if (outcome !== 'busted' && outcome !== 'robbed') return null;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
      <Field label="What happened">
        <input className="input" value={badNote} maxLength={200} placeholder={outcome === 'robbed' ? 'e.g. Ballas jumped us on Grove' : 'e.g. Pulled over on the highway'} onChange={(e) => setBadNote(e.target.value)} />
      </Field>
      {outcome === 'robbed' && (
        <Field label="Who robbed us">
          <select className="input" value={rivalId ?? ''} onChange={(e) => setRivalId(e.target.value || null)}>
            <option value="">Not sure</option>
            {rivals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

/** Logging a run once it's done: crew, product and where it came from, cash, place and how it went. */
function LogDialog({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const { storage, stock, locLabel } = useNarcotics();
  const ops = useOps('narcotics');
  const prices = useDoc<BmSettings>('settings/blackmarket')?.prices ?? {};
  const [crew, setCrew] = useState<string[]>([me.id]);
  const [from, setFrom] = useState(storage[0]?.id ?? 'main');
  const [lines, setLines] = useState<{ product: string; qty: string }[]>([{ product: RUN_PRODUCTS[0]!.id, qty: '' }]);
  const [cash, setCash] = useState('');
  const [postal, setPostal] = useState('');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<RunOutcome>('clean');
  const [badNote, setBadNote] = useState('');
  const [rivalId, setRivalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const clean = lines.map((l) => ({ product: l.product, qty: toCount(l.qty) })).filter((l) => l.qty > 0);
  const suggest = clean.reduce((t, l) => t + (prices[l.product] ?? 0) * l.qty, 0);
  const short = clean.filter((l) => have(stock.get(from), l.product) < l.qty);
  return (
    <Modal title="Log a run" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!crew.length) return setErr('Pick who went.');
          if (!clean.length) return setErr('Add what was on the run.');
          setBusy(true);
          setErr('');
          try {
            // A called-off run leaves the product where it was; anything else takes it off the stash.
            let taken: RunTaken[] = [];
            if (outcome !== 'off') {
              const applied = await ops.applyDeltas(clean.map((l) => ({ loc: from, strain: runProduct(l.product)!.strain, field: runProduct(l.product)!.field, delta: -l.qty })));
              taken = applied.map((d) => ({ loc: d.loc, field: d.field, delta: d.delta, ...(d.strain ? { strain: d.strain } : {}) }));
            }
            await logRun(me, { crew, lines: clean, from, cash: toCount(cash), postal, note, outcome, badNote, rivalId }, taken);
            onClose();
          } catch {
            setErr("That didn't save. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Who went">
          <CrewPicker value={crew} onChange={setCrew} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <div>
            <span className="label mb-1.5 block">What was on the run</span>
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto min-w-48 flex-1 py-1.5 text-sm" value={l.product} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, product: e.target.value } : x)))}>
                    {RUN_PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input className="input w-24 py-1.5 font-mono text-sm" inputMode="numeric" placeholder="How many" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: digits(e.target.value) } : x)))} />
                  <span className="w-20 text-[11px] text-smoke">{have(stock.get(from), l.product).toLocaleString()} there</span>
                  {lines.length > 1 && (
                    <button type="button" className="text-smoke hover:text-danger" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Remove">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {lines.length < 12 && (
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setLines([...lines, { product: RUN_PRODUCTS[0]!.id, qty: '' }])}>
                <Plus className="size-3.5" /> Another product
              </button>
            )}
          </div>
          <Field label="Taken from">
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              {storage.map((l) => (
                <option key={l.id} value={l.id}>
                  {locLabel(l.id)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {outcome !== 'off' && short.length > 0 && (
          <p className="text-xs text-yellow-200">
            {locLabel(from)} doesn’t hold that much {short.map((l) => runProduct(l.product)?.name).join(', ')}. Only what’s there comes off.
          </p>
        )}
        <Field label="How it went">
          <OutcomePicker value={outcome} onChange={setOutcome} />
        </Field>
        <BadBits outcome={outcome} badNote={badNote} setBadNote={setBadNote} rivalId={rivalId} setRivalId={setRivalId} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cash made (dirty)" hint={suggest ? `BlackMarket prices say about ${money(suggest)}` : undefined}>
            <div className="flex gap-1.5">
              <input className="input font-mono" inputMode="numeric" placeholder="0" value={cash} onChange={(e) => setCash(digits(e.target.value))} />
              {suggest > 0 && !cash && (
                <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setCash(String(suggest))}>
                  Use
                </button>
              )}
            </div>
          </Field>
          <Field label="Postal">
            <input className="input font-mono" value={postal} maxLength={10} placeholder="e.g. 8061" onChange={(e) => setPostal(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end">
          <button className="btn-gold" disabled={busy}>
            Log it
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditDialog({ r, onClose }: { r: NarcoRun; onClose: () => void }) {
  const [crew, setCrew] = useState(r.crew);
  const [cash, setCash] = useState(String(r.cash || ''));
  const [postal, setPostal] = useState(r.postal);
  const [note, setNote] = useState(r.note);
  const [outcome, setOutcome] = useState(r.outcome);
  const [badNote, setBadNote] = useState(r.badNote ?? '');
  const [rivalId, setRivalId] = useState<string | null>(r.rivalId ?? null);
  return (
    <Modal title="Edit run" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await editRun(r.id, { crew, cash: toCount(cash), postal, note, outcome, badNote, rivalId });
          onClose();
        }}
      >
        <p className="text-xs text-smoke">The product and stash stay as logged: delete the run and log it again to change them.</p>
        <Field label="Who went">
          <CrewPicker value={crew} onChange={setCrew} />
        </Field>
        <Field label="How it went">
          <OutcomePicker value={outcome} onChange={setOutcome} lockOff />
        </Field>
        <BadBits outcome={outcome} badNote={badNote} setBadNote={setBadNote} rivalId={rivalId} setRivalId={setRivalId} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cash made (dirty)">
            <input className="input font-mono" inputMode="numeric" value={cash} onChange={(e) => setCash(digits(e.target.value))} />
          </Field>
          <Field label="Postal">
            <input className="input font-mono" value={postal} maxLength={10} onChange={(e) => setPostal(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <button className="btn-gold" disabled={!crew.length}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The cash, handed out like a heist's: cuts to the crew's money, the rest to the gang bank. */
function RunCash({ r }: { r: NarcoRun }) {
  const { me, isLead, preview } = useHub();
  const toast = useToast();
  const [cut, setCut] = useState<Record<string, string>>({});
  const left = runLeft(r);
  const owed = (r.cashGiven?.[me.id] ?? 0) - (r.cashCollected?.[me.id] ?? 0);
  const lead = isLead && !preview;
  if (!(r.cash > 0)) return null;
  return (
    <div className="mt-3 border border-line-soft p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Banknote className="size-4 text-red-300" />
        <span className="font-semibold text-gold-100">Cash</span>
        <span className="font-mono text-xs text-red-200">{r.banked ? 'rest banked' : `${money(left)} not handed out`}</span>
        <span className="flex flex-wrap gap-x-2 text-xs text-smoke">
          {Object.entries(r.cashGiven ?? {})
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <span key={k}>
                <MemberName id={k} className="text-xs" /> {money(v)}
                {(r.cashCollected?.[k] ?? 0) >= v ? ' ✓' : ''}
              </span>
            ))}
        </span>
        {owed > 0 && !preview && (
          <button className="btn-gold btn-sm ml-auto" onClick={() => toast.run(collectRunCash(me, r).then((x) => ({ text: `${money(x)} dirty is in your Money.` })))}>
            <Hand className="size-3.5" /> Put my {money(owed)} in my Money
          </button>
        )}
      </div>
      {lead && !r.banked && left > 0 && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {r.crew.map((p) => (
            <label key={p} className="text-[11px] text-smoke">
              <MemberName id={p} className="text-[11px]" />
              <input className="input mt-0.5 w-24 py-1 font-mono text-xs" inputMode="numeric" placeholder="0" value={cut[p] ?? ''} onChange={(e) => setCut({ ...cut, [p]: digits(e.target.value) })} />
            </label>
          ))}
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              const n = r.crew.length;
              const each = Math.floor(left / n);
              let extra = left - each * n;
              setCut(Object.fromEntries(r.crew.map((p) => [p, String(each + (extra-- > 0 ? 1 : 0))])));
            }}
          >
            Even split
          </button>
          <button
            className="btn-gold btn-sm"
            onClick={() =>
              toast.run(
                giveRunCash(r, Object.fromEntries(Object.entries(cut).map(([k, v]) => [k, +v || 0]))).then(() => {
                  setCut({});
                  return { text: 'Cash handed out.' };
                }),
              )
            }
          >
            Hand out
          </button>
          <button className="btn-ghost btn-sm" onClick={() => confirm(`Send ${money(left)} to the gang bank? No more cash can be handed out after.`) && toast.run(bankRunRest(me, r).then((x) => ({ text: `${money(x)} went to the gang bank.` })))}>
            Bank the rest
          </button>
        </div>
      )}
    </div>
  );
}

function RunRow({ r }: { r: NarcoRun }) {
  const { me, isLead, preview, memberById } = useHub();
  const { locLabel } = useNarcotics();
  const ops = useOps('narcotics');
  const toast = useToast();
  const rivals = useCollection<Rival>('rivals') ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const o = outcomeOf(r.outcome);
  const mine = r.by === me.id || isLead;
  const owed = (r.cashGiven?.[me.id] ?? 0) - (r.cashCollected?.[me.id] ?? 0);
  return (
    <li className={`run-row ${open ? 'open' : ''}`}>
      <button className="run-head" onClick={() => setOpen(!open)}>
        <span className="run-date">
          {r.at ? fmtDate(r.at) : 'now'}
          <span>{r.at ? fmtTime(r.at) : ''}</span>
        </span>
        <span className="flex -space-x-2">
          {r.crew.slice(0, 4).map((id) => {
            const m = memberById.get(id);
            return m ? <Avatar key={id} member={m} /> : null;
          })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-gold-100">{r.lines.map(lineText).join(' · ')}</span>
          <span className="block truncate text-[11px] text-smoke">
            {r.crew.map((id) => memberById.get(id)?.name ?? '?').join(', ')} · from {locLabel(r.from)}
            {r.postal ? ` · postal ${r.postal}` : ''}
          </span>
        </span>
        {owed > 0 && <span className="run-owed">Your cut</span>}
        <span className="run-cash">{r.cash ? money(r.cash) : '—'}</span>
        <span className="run-outcome" style={{ color: o.color, borderColor: `${o.color}80` }}>
          {o.label}
        </span>
      </button>
      {open && (
        <div className="run-body">
          {r.note && <p className="text-sm text-ash">{r.note}</p>}
          {r.badNote && (
            <p className="mt-1 text-sm" style={{ color: o.color }}>
              {r.badNote}
              {r.rivalId && <span className="text-smoke"> · {rivals.find((x) => x.id === r.rivalId)?.name ?? 'a rival'}</span>}
            </p>
          )}
          <p className="mt-1 text-[11px] text-smoke">
            Logged by {r.byName}
            {r.outcome === 'off' ? ' · called off, nothing came off the stash' : r.taken.length ? ` · ${r.taken.reduce((t, x) => t - x.delta, 0).toLocaleString()} came off ${locLabel(r.from)}` : ''}
          </p>
          <RunCash r={r} />
          {mine && !preview && (
            <div className="mt-3 flex justify-end gap-1.5">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
              <button
                className="btn-ghost btn-sm hover:text-red-300"
                onClick={() =>
                  confirm(r.taken.length ? 'Delete this run? What came off the stash goes back.' : 'Delete this run?') &&
                  toast.run(
                    (r.taken.length ? ops.applyDeltas(r.taken.map((t) => ({ ...t, delta: -t.delta }))) : Promise.resolve([])).then(() => removeRun(r.id)).then(() => ({ text: 'Run deleted.' })),
                  )
                }
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
      {editing && <EditDialog r={r} onClose={() => setEditing(false)} />}
    </li>
  );
}

function Body() {
  const { preview } = useHub();
  const runs = useCollection<NarcoRun>('narcoRuns');
  const runners = useRunners();
  const [logging, setLogging] = useState(false);
  const [who, setWho] = useState('');
  const [out, setOut] = useState<RunOutcome | ''>('');
  const all = useMemo(() => [...(runs ?? [])].sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now())), [runs]);
  const shown = all.filter((r) => (!who || r.crew.includes(who)) && (!out || r.outcome === out));
  const since = (days: number) => all.filter((r) => r.outcome !== 'off' && (r.at?.toMillis() ?? Date.now()) > Date.now() - days * DAY);
  const week = since(7);
  const month = since(30);
  const sum = (rs: NarcoRun[]) => rs.reduce((t, r) => t + (r.cash ?? 0), 0);
  const clean = (rs: NarcoRun[]) => (rs.length ? Math.round((rs.filter((r) => r.outcome === 'clean').length / rs.length) * 100) : 0);
  const units = month.filter((r) => r.outcome === 'clean').reduce((t, r) => t + r.lines.reduce((s, l) => s + l.qty, 0), 0);
  return (
    <>
      <PageHeader
        icon={Route}
        kicker="Operations"
        title="Narco Runs"
        sub="Log a run once you're back: who went, what came off which stash, the cash and how it went. Narco and High Table only."
        actions={
          !preview && (
            <button className="btn-gold" onClick={() => setLogging(true)}>
              <Plus className="size-4" /> Log a run
            </button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Runs this week" value={week.length} sub={`${clean(week)}% clean`} />
        <Stat label="Cash this week" value={<span className="text-red-200">{money(sum(week))}</span>} />
        <Stat label="Runs · 30 days" value={month.length} sub={`${clean(month)}% clean`} />
        <Stat label="Moved · 30 days" value={units.toLocaleString()} sub={`${money(sum(month))} made`} />
      </div>
      <Panel
        title={`Run log · ${shown.length}`}
        right={
          <span className="flex flex-wrap items-center gap-1.5">
            <select className="input w-auto py-1 text-xs" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who">
              <option value="">Everyone</option>
              {runners.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select className="input w-auto py-1 text-xs" value={out} onChange={(e) => setOut(e.target.value as RunOutcome | '')} aria-label="Outcome">
              <option value="">Any outcome</option>
              {OUTCOMES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </span>
        }
      >
        {shown.length ? (
          <ul className="run-log">
            {shown.map((r) => (
              <RunRow key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <p className="p-4 text-center text-sm text-smoke">{all.length ? 'Nothing matches.' : 'No runs logged yet.'}</p>
        )}
      </Panel>
      {logging && <LogDialog onClose={() => setLogging(false)} />}
    </>
  );
}

export default function NarcoRuns() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

/** Narco members' Dashboard: this week's runs at a glance. */
export function RunsTile() {
  const { narco } = useHub();
  const runs = useCollection<NarcoRun>('narcoRuns', narco);
  if (!narco || !runs) return null;
  const week = runs.filter((r) => r.outcome !== 'off' && (r.at?.toMillis() ?? Date.now()) > Date.now() - 7 * DAY);
  return <Stat label="Narco runs · 7 days" value={week.length} sub={`${money(week.reduce((t, r) => t + (r.cash ?? 0), 0))} made`} />;
}
