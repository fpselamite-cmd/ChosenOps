import { ArrowDownLeft, ArrowUpRight, Banknote, Check, Download, HandCoins, PiggyBank, Plus, Send, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Empty, ErrorText, Field } from '../../components/Field';
import { MemberName } from '../../components/MemberName';
import { Modal } from '../../components/Modal';
import { PageHeader, Panel, Stat, Tabs } from '../../components/Page';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import {
  addEntry,
  addGoal,
  askToSpend,
  CASH,
  CATEGORIES,
  decideSpend,
  dropPayout,
  fundGoal,
  monthOf,
  owePayout,
  receivePayout,
  removeEntry,
  removeGoal,
  saveBudget,
  sendPayout,
  type Budget,
  type Cash,
} from '../../lib/books';
import { ago, fmtDate } from '../../lib/format';
import { money, saleKind, useMoneyOps } from '../../lib/money';
import { WashingView } from '../BlackMarket';
import { WashDialog, WashList } from '../Locker';
import Dues, { myDuesOwed } from './Dues';
import { fmtDue, KINDS } from './duesCalc';
import { useBooks, type Books } from './useBooks';

type View = 'overview' | 'dues' | 'ledger' | 'budget' | 'washing' | 'reports';
const digits = (v: string) => v.replace(/\D/g, '');
const CashTag = ({ c }: { c: Cash }) => <span className={`chip px-1.5 py-0.5 text-[10px] font-bold uppercase ${c === 'dirty' ? 'bg-red-900/40 text-red-200' : 'bg-emerald-900/40 text-emerald-200'}`}>{c}</span>;

function CashToggle({ value, onChange }: { value: Cash; onChange: (c: Cash) => void }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-line">
      {CASH.map((c) => (
        <button type="button" key={c} onClick={() => onChange(c)} className={`shrink-0 px-3 py-1 text-xs font-bold whitespace-nowrap capitalize ${value === c ? (c === 'dirty' ? 'bg-red-500/80 text-white' : 'bg-emerald-500/80 text-void') : 'bg-raised text-ash'}`}>
          {c}
        </button>
      ))}
    </span>
  );
}

// ---------- dialogs ----------

function EntryDialog({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const [dir, setDir] = useState<'in' | 'out'>('out');
  const [cash, setCash] = useState<Cash>('dirty');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add to the books" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!Number(amount)) return;
          setBusy(true);
          await addEntry(me, { dir, cash, amount: Number(amount), category, note: note.trim().slice(0, 140), memberId: null, source: 'manual', ref: null });
          onClose();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-line">
            {(['in', 'out'] as const).map((d) => (
              <button type="button" key={d} onClick={() => setDir(d)} className={`px-3 py-1 text-xs font-bold ${dir === d ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {d === 'in' ? 'Money in' : 'Money out'}
              </button>
            ))}
          </span>
          <CashToggle value={cash} onChange={setCash} />
        </div>
        <Field label="Amount">
          <input className="input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} autoFocus />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...CATEGORIES, 'Income'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="What for">
          <input className="input" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy || !Number(amount)}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OweDialog({ onClose }: { onClose: () => void }) {
  const { me, roster } = useHub();
  const [who, setWho] = useState('');
  const [cash, setCash] = useState<Cash>('dirty');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const m = roster.find((x) => x.id === who);
  return (
    <Modal title="Someone is owed" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!m || !Number(amount)) return;
          await owePayout(me, { memberId: m.id, memberName: m.name, cash, amount: Number(amount), reason: reason.trim().slice(0, 80) || 'Payout' });
          onClose();
        }}
      >
        <Field label="Who">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Pick a member…</option>
            {roster.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-3">
          <Field label="Amount">
            <input className="input font-mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} />
          </Field>
          <CashToggle value={cash} onChange={setCash} />
        </div>
        <Field label="For">
          <input className="input" placeholder="Loot from the docks, team pay, cut…" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!m || !Number(amount)}>
            Add to owed
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SpendDialog({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const [cash, setCash] = useState<Cash>('dirty');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Ask for gang money" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!Number(amount) || why.trim().length < 3) return setError('Say how much and what for.');
          await askToSpend(me, { cash, amount: Number(amount), category, why: why.trim().slice(0, 140) });
          onClose();
        }}
      >
        <div className="flex items-end gap-3">
          <Field label="Amount">
            <input className="input font-mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} autoFocus />
          </Field>
          <CashToggle value={cash} onChange={setCash} />
        </div>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="What for">
          <input className="input" value={why} maxLength={140} onChange={(e) => setWhy(e.target.value)} placeholder="New plates for the hit squad" />
        </Field>
        <ErrorText error={error} />
        <p className="text-xs text-smoke">If the Treasurer or leadership says yes, it’s owed to you, and lands in your safe once paid.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Ask</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- overview ----------

function BankCard({ label, value, cash }: { label: string; value: number; cash: Cash }) {
  return (
    <div className={`money-bank ${cash} hud p-5`}>
      <p className="label">{label}</p>
      <p className={`mt-1 font-mono text-4xl font-bold ${cash === 'dirty' ? 'text-red-200' : 'text-emerald-200'}`}>{money(value)}</p>
    </div>
  );
}

function Overview({ b }: { b: Books }) {
  const { me, can } = useHub();
  const [dialog, setDialog] = useState<'entry' | 'owe' | 'spend' | null>(null);
  const month = monthOf();
  const monthEntries = b.entries.filter((e) => e.at && monthOf(e.at.toMillis()) === month);
  const mIn = (c: Cash) => monthEntries.filter((e) => e.dir === 'in' && e.cash === c).reduce((t, e) => t + e.amount, 0);
  const mOut = (c: Cash) => monthEntries.filter((e) => e.dir === 'out' && e.cash === c).reduce((t, e) => t + e.amount, 0);
  const owedPayouts = b.payouts.filter((p) => p.status === 'owed');
  const sent = b.payouts.filter((p) => p.status === 'sent');
  const openSpends = b.spends.filter((s) => s.status === 'open');
  const mySent = sent.filter((p) => p.memberId === me.id);
  const iOwe = myDuesOwed(me.id, b.weeks, b.transfers, b.duesPays);
  const owesText = KINDS.filter((k) => iOwe[k]).map((k) => `${fmtDue(k, iOwe[k])} ${k}`);
  const [fund, setFund] = useState<Record<string, string>>({});
  const [goal, setGoal] = useState({ name: '', target: '', cash: 'dirty' as Cash });

  return (
    <div className="space-y-6">
      {/* What's mine */}
      {(mySent.length > 0 || owesText.length > 0) && (
        <div className="hud space-y-2 border-gold-400/50 p-4">
          {owesText.length > 0 && (
            <p className="text-sm text-red-200">
              You owe dinner dues: <b>{owesText.join(', ')}</b>. Mark them paid on the Dues tab.
            </p>
          )}
          {mySent.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <HandCoins className="size-4 text-gold-300" /> The Treasurer sent you <b className="font-mono text-gold-100">{money(p.amount)}</b> <CashTag c={p.cash} /> for {p.reason}.
              <button className="btn-gold btn-sm ml-auto" onClick={() => receivePayout(p)}>
                <Check className="size-3.5" /> Got it
              </button>
            </div>
          ))}
        </div>
      )}

      {b.treasury ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <BankCard label="Gang bank · dirty" value={b.bank.dirty} cash="dirty" />
            <BankCard label="Gang bank · clean" value={b.bank.clean} cash="clean" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="In this month" value={<span className="text-base">{money(mIn('dirty'))} · <span className="text-ok">{money(mIn('clean'))}</span></span>} sub="dirty · clean, outside sales" />
            <Stat label="Out this month" value={<span className="text-base">{money(mOut('dirty'))} · <span className="text-ok">{money(mOut('clean'))}</span></span>} sub="dirty · clean" />
            <Stat label="Owed to members" value={money(owedPayouts.reduce((t, p) => t + p.amount, 0))} sub={`${owedPayouts.length} payouts`} />
            <Stat label="Out washing" value={money(b.washing.out)} sub="Gang dirty at the washers" />
          </div>
          <div className="flex flex-wrap gap-2">
            {can('money') && (
              <button className="btn-gold btn-sm" onClick={() => setDialog('entry')}>
                <Plus className="size-3.5" /> Add to the books
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={() => setDialog('owe')}>
              <HandCoins className="size-3.5" /> Someone is owed
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={`Payouts · ${owedPayouts.length + sent.length}`}>
              {owedPayouts.length + sent.length ? (
                <ul className="divide-y divide-line-soft text-sm">
                  {[...owedPayouts, ...sent].map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                      <MemberName id={p.memberId} />
                      <span className="text-xs text-smoke">{p.reason}</span>
                      <span className="ml-auto font-mono text-gold-100">{money(p.amount)}</span>
                      <CashTag c={p.cash} />
                      {p.status === 'owed' ? (
                        <>
                          {can('money') && (
                            <button className="btn-gold btn-sm" onClick={() => sendPayout(me, p)}>
                              <Send className="size-3.5" /> Pay
                            </button>
                          )}
                          <button className="text-smoke hover:text-red-300" onClick={() => confirm('Drop this payout?') && dropPayout(p.id)} aria-label="Drop">
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <span className="chip bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">Sent · waiting on them</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-smoke">Nobody is owed anything.</p>
              )}
            </Panel>
            <Panel title={`Spend requests · ${openSpends.length}`}>
              {openSpends.length ? (
                <ul className="divide-y divide-line-soft text-sm">
                  {openSpends.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <MemberName id={r.by} />
                      <span className="min-w-0 flex-1 text-xs text-ash">
                        {r.category} · {r.why}
                      </span>
                      <span className="font-mono text-gold-100">{money(r.amount)}</span>
                      <CashTag c={r.cash} />
                      <button className="btn-gold btn-sm" onClick={() => decideSpend(me, r, true)}>
                        <Check className="size-3.5" />
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => decideSpend(me, r, false)}>
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-smoke">No requests waiting.</p>
              )}
            </Panel>
          </div>

          <Panel title="Savings goals" right={<PiggyBank className="size-4 text-gold-500" />}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {b.goals.map((g) => {
                const pct = Math.min(100, Math.round((g.saved / Math.max(1, g.target)) * 100));
                return (
                  <div key={g.id} className={`border p-3 ${g.done ? 'border-gold-300' : 'border-line-soft'}`}>
                    <div className="flex items-center gap-2">
                      <b className="flex-1 text-gold-100">{g.name}</b>
                      <CashTag c={g.cash} />
                      <button className="text-smoke hover:text-red-300" onClick={() => confirm(`Remove “${g.name}”?`) && removeGoal(g.id)} aria-label="Remove">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
                      <div className="h-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-smoke">
                      {money(g.saved)} / {money(g.target)} · {pct}%{g.done ? ' · reached!' : ''}
                    </p>
                    {!g.done && can('money') && (
                      <div className="mt-2 flex gap-2">
                        <input className="input py-1 font-mono text-sm" placeholder="Put in $" value={fund[g.id] ?? ''} onChange={(e) => setFund({ ...fund, [g.id]: digits(e.target.value) })} />
                        <button className="btn-ghost btn-sm" disabled={!Number(fund[g.id])} onClick={() => fundGoal(me, g, Number(fund[g.id])).then(() => setFund({ ...fund, [g.id]: '' }))}>
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <form
                className="flex flex-col gap-2 border border-dashed border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!goal.name.trim() || !Number(goal.target)) return;
                  void addGoal({ name: goal.name.trim().slice(0, 40), cash: goal.cash, target: Number(goal.target) });
                  setGoal({ name: '', target: '', cash: 'dirty' });
                }}
              >
                <p className="label">New goal</p>
                <input className="input py-1" placeholder="A clubhouse on Grove St" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input className="input py-1 font-mono" placeholder="Target $" value={goal.target} onChange={(e) => setGoal({ ...goal, target: digits(e.target.value) })} />
                  <CashToggle value={goal.cash} onChange={(c) => setGoal({ ...goal, cash: c })} />
                </div>
                <button className="btn-ghost btn-sm self-start">
                  <Plus className="size-3.5" /> Add goal
                </button>
              </form>
            </div>
          </Panel>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-ash">Your own cash lives in your locker safe. Here you pay dinner dues, wash dirty money, and ask the gang for money.</p>
            <button className="btn-gold btn-sm" onClick={() => setDialog('spend')}>
              <Banknote className="size-3.5" /> Ask for gang money
            </button>
          </div>
          <Panel title="My requests">
            {b.spends.length ? (
              <ul className="divide-y divide-line-soft text-sm">
                {b.spends.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 text-ash">
                      {r.category} · {r.why}
                    </span>
                    <span className="font-mono text-gold-100">{money(r.amount)}</span>
                    <CashTag c={r.cash} />
                    <span className={`chip px-2 py-0.5 text-[11px] ${r.status === 'approved' ? 'bg-ok/15 text-green-300' : r.status === 'denied' ? 'bg-red-900/40 text-red-200' : 'bg-gold-400/15 text-gold-200'}`}>{r.status === 'open' ? 'Waiting' : r.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">Nothing asked yet.</p>
            )}
          </Panel>
          <Panel title="Goals the family is saving for">
            {b.goals.length ? (
              <ul className="space-y-3">
                {b.goals.map((g) => (
                  <li key={g.id}>
                    <p className="text-sm text-gold-100">{g.name}</p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
                      <div className="h-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${Math.min(100, (g.saved / Math.max(1, g.target)) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">No goals yet.</p>
            )}
          </Panel>
        </div>
      )}
      {b.treasury && (
        <div className="flex justify-end">
          <button className="btn-ghost btn-sm" onClick={() => setDialog('spend')}>
            <Banknote className="size-3.5" /> Ask for gang money
          </button>
        </div>
      )}
      {dialog === 'entry' && <EntryDialog onClose={() => setDialog(null)} />}
      {dialog === 'owe' && <OweDialog onClose={() => setDialog(null)} />}
      {dialog === 'spend' && <SpendDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

// ---------- ledger ----------

interface Line {
  key: string;
  at: number;
  dir: 'in' | 'out';
  cash: Cash;
  amount: number;
  what: string;
  category: string;
  who?: string;
  entryId?: string;
}

function useLines(b: Books): Line[] {
  const { memberById, narco } = useHub();
  return useMemo(() => {
    const t = (x?: { toMillis(): number }) => x?.toMillis() ?? Date.now();
    const out: Line[] = [];
    b.entries.forEach((e) => out.push({ key: e.id, at: t(e.at), dir: e.dir, cash: e.cash, amount: e.amount, what: e.note || e.category, category: e.category, who: e.memberId ?? e.by, entryId: e.source === 'manual' ? e.id : undefined }));
    b.m.sales.filter((x) => saleKind(x) === 'gang' && x.price).forEach((x) => out.push({ key: `s${x.id}`, at: t(x.at), dir: 'in', cash: 'dirty', amount: x.price!, what: narco ? `Narco: ${x.qty} × ${x.product}` : 'Gang sale', category: narco ? 'Narco' : 'Sales', who: x.sellerId }));
    b.m.pays.filter((p) => p.fromBank).forEach((p) => out.push({ key: `t${p.id}`, at: t(p.at), dir: 'out', cash: 'dirty', amount: p.fromBank, what: `Team pay to ${memberById.get(p.to)?.name ?? 'someone'}`, category: 'Payouts', who: p.from }));
    b.m.ledger.forEach((l) => out.push({ key: `l${l.id}`, at: t(l.at), dir: 'out', cash: 'dirty', amount: l.amount, what: l.note || (l.type === 'payout' ? `Payout to ${l.toName}` : 'Expense'), category: l.type === 'payout' ? 'Payouts' : 'Other' }));
    b.duesPays.filter((p) => p.status === 'confirmed').forEach((p) => out.push({ key: `d${p.id}`, at: t(p.at), dir: 'in', cash: p.cash, amount: p.amount, what: `Dinner dues ${p.week}`, category: 'Dues', who: p.memberId }));
    b.m.washReqs
      .filter((w) => w.memberId === 'gang' && w.status !== 'cancelled')
      .forEach((w) => {
        out.push({ key: `wo${w.id}`, at: t(w.at), dir: 'out', cash: 'dirty', amount: w.dirty, what: 'Sent to the washers', category: 'Washing' });
        if (w.status === 'done') out.push({ key: `wi${w.id}`, at: t(w.doneAt), dir: 'in', cash: 'clean', amount: w.clean, what: `Washed by ${w.claimerName ?? 'a washer'}`, category: 'Washing' });
      });
    return out.sort((a, x) => x.at - a.at);
  }, [b, memberById, narco]);
}

function Ledger({ b }: { b: Books }) {
  const { can } = useHub();
  const lines = useLines(b);
  const [cash, setCash] = useState<'' | Cash>('');
  const [dir, setDir] = useState<'' | 'in' | 'out'>('');
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);
  const cats = [...new Set(lines.map((l) => l.category))].sort();
  const list = lines.filter((l) => (!cash || l.cash === cash) && (!dir || l.dir === dir) && (!cat || l.category === cat));
  const csv = () => {
    const rows = [['Date', 'In/Out', 'Cash', 'Amount', 'Category', 'What'], ...list.map((l) => [new Date(l.at).toISOString(), l.dir, l.cash, String(l.amount), l.category, l.what.replace(/"/g, "'")])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `gang-books-${monthOf()}.csv`;
    a.click();
  };
  return (
    <Panel
      title={`Ledger · ${list.length}`}
      right={
        <span className="flex gap-2">
          {can('money') && (
            <button className="btn-gold btn-sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={csv}>
            <Download className="size-3.5" /> CSV
          </button>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto py-1 text-sm" value={dir} onChange={(e) => setDir(e.target.value as '' | 'in' | 'out')}>
          <option value="">In & out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </select>
        <select className="input w-auto py-1 text-sm" value={cash} onChange={(e) => setCash(e.target.value as '' | Cash)}>
          <option value="">Dirty & clean</option>
          <option value="dirty">Dirty</option>
          <option value="clean">Clean</option>
        </select>
        <select className="input w-auto py-1 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Every category</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line-soft text-sm">
          {list.slice(0, 200).map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-2 py-2">
              {l.dir === 'in' ? <ArrowDownLeft className="size-4 text-ok" /> : <ArrowUpRight className="size-4 text-red-300" />}
              {/* On a phone the description gets its own line instead of being squeezed to a word. */}
              <span className="min-w-0 flex-1 text-ash max-sm:basis-[calc(100%-2rem)] sm:truncate">
                {l.what} <span className="text-xs text-smoke">· {l.category}</span>
              </span>
              {l.who && <MemberName id={l.who} className="text-xs max-sm:ml-6" />}
              <span className="text-right text-xs text-smoke sm:w-20 max-sm:ml-auto">{fmtDate(new Date(l.at))}</span>
              <span className={`w-24 text-right font-mono ${l.dir === 'in' ? 'text-ok' : 'text-red-300'}`}>
                {l.dir === 'in' ? '+' : '−'}
                {money(l.amount)}
              </span>
              <CashTag c={l.cash} />
              {l.entryId && can('money') && (
                <button className="text-smoke hover:text-red-300" onClick={() => confirm('Remove this entry?') && removeEntry(l.entryId!)} aria-label="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing here yet">Money in and out shows up as it happens.</Empty>
      )}
      {adding && <EntryDialog onClose={() => setAdding(false)} />}
    </Panel>
  );
}

// ---------- budget ----------

function BudgetView({ b }: { b: Books }) {
  const [month, setMonth] = useState(monthOf());
  const budget = useDoc<Budget>(`budgets/${month}`);
  const lines = useLines(b);
  const [edit, setEdit] = useState<Record<string, { dirty: string; clean: string }> | null>(null);
  const spent = (cat: string, c: Cash) => lines.filter((l) => l.dir === 'out' && l.cash === c && l.category === cat && monthOf(l.at) === month).reduce((t, l) => t + l.amount, 0);
  const cats = [...new Set([...CATEGORIES, ...Object.keys(budget?.cats ?? {})])];
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i + 1);
    return d.toISOString().slice(0, 7);
  });
  const bar = (plan: number, used: number, c: Cash) => {
    const pct = plan ? Math.min(100, (used / plan) * 100) : used ? 100 : 0;
    const over = plan && used > plan;
    return (
      <div className="min-w-0 flex-1 sm:min-w-[9rem]">
        <div className="h-2 overflow-hidden rounded-full bg-raised">
          <div className={`h-full ${over ? 'bg-red-500' : c === 'dirty' ? 'bg-red-300/80' : 'bg-emerald-400/80'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className={`mt-0.5 font-mono text-[10px] sm:text-[11px] ${over ? 'text-red-300' : 'text-smoke'}`}>
          {money(used)} / {plan ? money(plan) : '—'}
        </p>
      </div>
    );
  };
  return (
    <Panel
      title="Monthly budget"
      right={
        <span className="flex gap-2">
          <select className="input w-auto py-1 text-sm" value={month} onChange={(e) => (setMonth(e.target.value), setEdit(null))}>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          {!edit ? (
            <button className="btn-ghost btn-sm" onClick={() => setEdit(Object.fromEntries(cats.map((c) => [c, { dirty: String(budget?.cats?.[c]?.dirty ?? ''), clean: String(budget?.cats?.[c]?.clean ?? '') }])))}>
              Plan
            </button>
          ) : (
            <button
              className="btn-gold btn-sm"
              onClick={async () => {
                await saveBudget(month, Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, { dirty: Number(v.dirty) || 0, clean: Number(v.clean) || 0 }])));
                setEdit(null);
              }}
            >
              <Check className="size-3.5" /> Save plan
            </button>
          )}
        </span>
      }
    >
      <div className="mb-2 grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[8rem_1fr_1fr] sm:gap-4 text-xs">
        <span />
        <span className="label text-red-300">Dirty</span>
        <span className="label text-emerald-300">Clean</span>
      </div>
      <ul className="space-y-3">
        {cats.map((c) => (
          <li key={c} className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[8rem_1fr_1fr] sm:gap-4 text-sm">
            <span className="text-gold-100">{c}</span>
            {(['dirty', 'clean'] as Cash[]).map((k) =>
              edit ? (
                <input key={k} className="input py-1 font-mono" placeholder="0" value={edit[c]?.[k] ?? ''} onChange={(e) => setEdit({ ...edit, [c]: { ...edit[c]!, [k]: digits(e.target.value) } })} />
              ) : (
                <span key={k}>{bar(budget?.cats?.[c]?.[k] ?? 0, spent(c, k), k)}</span>
              ),
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-smoke">Spent counts money out of the gang books in that category this month.</p>
    </Panel>
  );
}

// ---------- washing ----------

function Washing({ b }: { b: Books }) {
  const { can } = useHub();
  const mops = useMoneyOps();
  const [mine, setMine] = useState(false);
  const [gang, setGang] = useState('');
  const done = b.m.washReqs.filter((w) => w.status === 'done' && w.claimerId);
  const stats = [...done.reduce((m, w) => m.set(w.claimerId!, [...(m.get(w.claimerId!) ?? []), w]), new Map<string, typeof done>())].map(([id, ws]) => ({
    id,
    dirty: ws.reduce((t, w) => t + w.dirty, 0),
    n: ws.length,
    hrs: ws.reduce((t, w) => t + ((w.doneAt?.toMillis() ?? 0) - (w.at?.toMillis() ?? 0)), 0) / ws.length / 3600e3,
  }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button className="btn-gold btn-sm" onClick={() => setMine(true)}>
          <Banknote className="size-3.5" /> Wash my dirty money
        </button>
      </div>
      <WashList />
      {can('money') && (
        <Panel title="Wash the gang's money">
          <p className="mb-2 text-sm text-ash">
            Sends gang dirty to the washers. {100 - b.m.washPct}% comes back clean to the gang bank. Gang dirty now: <b className="font-mono text-red-200">{money(b.bank.dirty)}</b>
          </p>
          <div className="flex flex-wrap gap-2">
            <input className="input w-40 font-mono" placeholder="Amount $" value={gang} onChange={(e) => setGang(digits(e.target.value))} />
            <button className="btn-ghost btn-sm" disabled={!Number(gang) || Number(gang) > b.bank.dirty} onClick={() => mops.requestGangWash(Number(gang), b.m.washPct, 'Gang money').then(() => setGang(''))}>
              <Send className="size-3.5" /> Send to the washers
            </button>
          </div>
        </Panel>
      )}
      {(b.m.washer || can('money')) && <WashingView />}
      {stats.length > 0 && (
        <Panel title="Washers">
          <ul className="divide-y divide-line-soft text-sm">
            {stats
              .sort((a, x) => x.dirty - a.dirty)
              .map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <MemberName id={s.id} />
                  <span className="text-xs text-smoke">{s.n} washes</span>
                  <span className="ml-auto font-mono text-red-200">{money(s.dirty)} washed</span>
                  <span className="w-28 text-right text-xs text-smoke">~{s.hrs < 1 ? `${Math.round(s.hrs * 60)}m` : `${s.hrs.toFixed(1)}h`} each</span>
                </li>
              ))}
          </ul>
        </Panel>
      )}
      {mine && <WashDialog onClose={() => setMine(false)} />}
    </div>
  );
}

// ---------- reports ----------

function Reports({ b }: { b: Books }) {
  const { roster, narco } = useHub();
  const lines = useLines(b);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.now() - i * 7 * 86400e3;
    const start = end - 7 * 86400e3;
    const pick = (dir: 'in' | 'out', c: Cash) => lines.filter((l) => l.dir === dir && l.cash === c && l.at > start && l.at <= end).reduce((t, l) => t + l.amount, 0);
    return { label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), inD: pick('in', 'dirty'), inC: pick('in', 'clean'), outD: pick('out', 'dirty'), outC: pick('out', 'clean') };
  }).reverse();
  const max = Math.max(1, ...weeks.flatMap((w) => [w.inD + w.inC, w.outD + w.outC]));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const earners = roster
    .map((m) => ({ m, v: b.m.sales.filter((x) => x.sellerId === m.id && saleKind(x) === 'gang' && (x.at?.toMillis() ?? 0) >= monthStart).reduce((t, x) => t + (x.price ?? 0), 0) }))
    .filter((x) => x.v)
    .sort((a, x) => x.v - a.v)
    .slice(0, 8);
  const byCat = [...lines.filter((l) => l.dir === 'out' && l.at >= monthStart).reduce((m, l) => m.set(l.category, (m.get(l.category) ?? 0) + l.amount), new Map<string, number>())].sort((a, x) => x[1] - a[1]);
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Money in vs out · 8 weeks">
        <div className="flex h-56 items-end gap-3">
          {weeks.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-48 w-full items-end justify-center gap-1">
                <div className="flex w-1/2 flex-col justify-end" title={`In: ${money(w.inD)} dirty, ${money(w.inC)} clean`}>
                  <div className="bg-emerald-400/80" style={{ height: `${(w.inC / max) * 180}px` }} />
                  <div className="bg-red-300/80" style={{ height: `${(w.inD / max) * 180}px` }} />
                </div>
                <div className="flex w-1/2 flex-col justify-end opacity-60" title={`Out: ${money(w.outD)} dirty, ${money(w.outC)} clean`}>
                  <div className="bg-emerald-700" style={{ height: `${(w.outC / max) * 180}px` }} />
                  <div className="bg-red-800" style={{ height: `${(w.outD / max) * 180}px` }} />
                </div>
              </div>
              <span className="text-[10px] text-smoke">{w.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-smoke">Each week: in (bright) next to out (dim). Red is dirty, green is clean.</p>
      </Panel>
      <div className="space-y-6">
        {narco && <Panel title="Top gang sellers · this month">
          {earners.length ? (
            <ol className="space-y-1.5 text-sm">
              {earners.map(({ m, v }, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="w-4 text-xs text-smoke">{i + 1}</span>
                  <Avatar member={m} size="xs" /> <span className="flex-1">{m.name}</span> <span className="font-mono text-red-200">{money(v)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-smoke">No gang sales yet this month.</p>
          )}
        </Panel>}
        <Panel title="Spent by category · this month">
          {byCat.length ? (
            <ul className="space-y-1.5 text-sm">
              {byCat.map(([c, v]) => (
                <li key={c} className="flex justify-between">
                  <span>{c}</span>
                  <span className="font-mono text-gold-100">{money(v)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">Nothing spent yet this month.</p>
          )}
        </Panel>
        <p className="text-xs text-smoke">Last activity {b.entries[0] ? ago(b.entries[0].at) : 'never'}.</p>
      </div>
    </div>
  );
}

// ---------- page ----------

export default function Money() {
  const b = useBooks();
  const { can } = useHub();
  const [params, setParams] = useSearchParams();
  const tabs: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'dues', label: 'Dues' },
    ...(b.treasury ? [{ id: 'ledger' as View, label: 'Ledger' }, { id: 'budget' as View, label: 'Budget' }] : []),
    { id: 'washing', label: `Washing${b.m.washer || can('money') ? ` · ${b.m.washReqs.filter((w) => w.status === 'open').length}` : ''}` },
    ...(b.treasury ? [{ id: 'reports' as View, label: 'Reports' }] : []),
  ];
  const view = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'overview';
  return (
    <>
      <PageHeader icon={Banknote} kicker="Business" title="Money" sub="The gang’s books in dirty and clean, dinner dues, washing and the budget. Your own cash lives in your locker safe." />
      <div className="mb-5">
        <Tabs value={view} onChange={(v) => setParams(v === 'overview' ? {} : { tab: v })} tabs={tabs} />
      </div>
      {!b.ready ? null : (
        <>
          {view === 'overview' && <Overview b={b} />}
          {view === 'dues' && <Dues b={b} />}
          {view === 'ledger' && <Ledger b={b} />}
          {view === 'budget' && <BudgetView b={b} />}
          {view === 'washing' && <Washing b={b} />}
          {view === 'reports' && <Reports b={b} />}
        </>
      )}
    </>
  );
}
