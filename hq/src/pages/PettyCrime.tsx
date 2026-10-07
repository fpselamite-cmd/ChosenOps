import { Check, Download, Flame, HandCoins, Minus, Pencil, Plus, Search, Send, Target, Trash2, Trophy, X } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { Empty, ErrorText, Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { notify } from '../lib/discord';
import { ago } from '../lib/format';
import {
  adjustRep,
  confirmTransfer,
  crimesIn,
  deleteCrime,
  hotStreak,
  jobsIn,
  logSession,
  rejectTransfer,
  requestTransfer,
  setFamilyGoal,
  setWeeklyGoal,
  weekStart,
  type FamilyGoal,
} from '../lib/petty';
import { PETTY_CRIMES, type PettyCrime as Crime, type PettyRep, type RepTransfer } from '../lib/types';

const n = (v: number) => v.toLocaleString('en-US');
const money = (v: number) => `$${v.toLocaleString('en-US')}`;
const digits = (v: string) => v.replace(/\D/g, '');
const DAY = 86400e3;

// ---------- logging a session ----------

/** Tally the jobs by type, then the rep (for the session, or mission by mission) and the dirty money. */
function LogSession({ memberId, onClose, onLogged }: { memberId: string; onClose: () => void; onLogged: (c: Omit<Crime, 'id'>) => void }) {
  const [tally, setTally] = useState<Record<string, number>>({});
  const [other, setOther] = useState('');
  const [mode, setMode] = useState<'session' | 'mission'>('session');
  const [rep, setRep] = useState('');
  const [perJob, setPerJob] = useState<string[]>([]);
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobs = Object.values(tally).reduce((s, v) => s + v, 0);
  const missionRep = perJob.slice(0, jobs).map((v) => Math.round(Number(v) || 0));
  const total = mode === 'session' ? Math.round(Number(rep) || 0) : missionRep.reduce((s, v) => s + v, 0);
  const bump = (k: string, d: number) => setTally((t) => ({ ...t, [k]: Math.max(0, Math.min(999, (t[k] ?? 0) + d)) }));
  const types = [...PETTY_CRIMES, ...(other.trim() ? [other.trim().slice(0, 30)] : [])];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!jobs) return setError('Tally at least one job.');
    const c = Math.round(Number(cash) || 0);
    setBusy(true);
    try {
      const crimes = Object.fromEntries(Object.entries(tally).filter(([k, v]) => v > 0 && types.includes(k)));
      await logSession(memberId, { crimes, perJob: mode === 'mission' ? missionRep : [], rep: total, cash: c, notes: notes.trim() });
      onLogged({ memberId, crime: '', crimes, rep: total, cash: c, notes: notes.trim() });
    } catch {
      setError('Couldn’t save that. Try again.');
      setBusy(false);
    }
  }
  return (
    <Modal title="Log a session" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Jobs done">
          <div className="divide-y divide-line-soft border border-line-soft">
            {types.map((k) => (
              <div key={k} className="flex items-center gap-2 px-3 py-1.5">
                <span className={`flex-1 text-sm ${tally[k] ? 'text-gold-100' : 'text-ash'}`}>{k}</span>
                <button type="button" className="btn-ghost btn-sm px-2" onClick={() => bump(k, -1)} disabled={!tally[k]} aria-label={`One less ${k}`}>
                  <Minus className="size-3" />
                </button>
                <input
                  className="input w-14 py-1 text-center font-mono"
                  inputMode="numeric"
                  value={tally[k] || ''}
                  placeholder="0"
                  onChange={(e) => setTally((t) => ({ ...t, [k]: Math.min(999, +digits(e.target.value) || 0) }))}
                  aria-label={`${k} count`}
                />
                <button type="button" className="btn-ghost btn-sm px-2" onClick={() => bump(k, 1)} aria-label={`One more ${k}`}>
                  <Plus className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <input className="input mt-2 py-1.5 text-sm" value={other} onChange={(e) => setOther(e.target.value)} maxLength={30} placeholder="Another kind of job? Name it to add a row" />
        </Field>

        <Field label="Rep earned">
          <div className="mb-2 flex overflow-hidden rounded-full ring-1 ring-line">
            {(
              [
                ['session', 'For the session'],
                ['mission', 'Mission by mission'],
              ] as const
            ).map(([v, l]) => (
              <button type="button" key={v} onClick={() => setMode(v)} className={`flex-1 px-3 py-1.5 text-xs font-bold ${mode === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'session' ? (
            <input className="input font-mono" inputMode="numeric" value={rep} onChange={(e) => setRep(digits(e.target.value))} placeholder="0" />
          ) : jobs ? (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {Array.from({ length: Math.min(jobs, 50) }, (_, i) => (
                <input
                  key={i}
                  className="input px-1 py-1 text-center font-mono text-sm"
                  inputMode="numeric"
                  placeholder={`#${i + 1}`}
                  value={perJob[i] ?? ''}
                  onChange={(e) => setPerJob((p) => Object.assign([...p], { [i]: digits(e.target.value) }))}
                  aria-label={`Rep for mission ${i + 1}`}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-smoke">Tally some jobs first, then fill in each one.</p>
          )}
          {mode === 'mission' && jobs > 0 && <p className="mt-1 text-xs text-smoke">Total: <span className="font-mono text-gold-200">{n(total)}</span> rep</p>}
        </Field>

        <Field label="Dirty money made" hint="Goes into your locker as dirty money">
          <input className="input font-mono" inputMode="numeric" value={cash} onChange={(e) => setCash(digits(e.target.value))} placeholder="$0" />
        </Field>
        <Field label="Notes">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={140} placeholder="Optional" />
        </Field>
        <ErrorText error={error} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-smoke">
            {n(jobs)} {jobs === 1 ? 'job' : 'jobs'} · {n(total)} rep · {money(Math.round(Number(cash) || 0))}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={busy || !jobs}>
              Log it
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

/** "Job done": a receipt for the session, to save as a picture. */
function Receipt({ c, streak, onClose }: { c: Omit<Crime, 'id'>; streak: number; onClose: () => void }) {
  const { me } = useHub();
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const lines = Object.entries(crimesIn({ ...c, id: '' }));
  return (
    <Modal title="Job done" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div ref={ref} className="petty-receipt">
          <p className="text-center font-display text-lg tracking-widest">THE CHOSEN</p>
          <p className="text-center text-[10px] tracking-[0.3em]">STREET WORK · RECEIPT</p>
          <p className="my-2 border-y border-dashed border-current py-1 text-center text-[11px]">
            {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {me.name}
          </p>
          {lines.map(([k, v]) => (
            <p key={k} className="flex justify-between">
              <span>{k}</span>
              <span>×{v}</span>
            </p>
          ))}
          <p className="mt-2 flex justify-between border-t border-dashed border-current pt-1 font-bold">
            <span>REP</span>
            <span>+{n(c.rep)}</span>
          </p>
          <p className="flex justify-between font-bold">
            <span>DIRTY $</span>
            <span>{money(c.cash)}</span>
          </p>
          {streak > 1 && <p className="mt-2 text-center text-[11px]">🔥 {streak} days in a row</p>}
          <p className="mt-2 text-center text-[10px] tracking-[0.25em]">NO REFUNDS · NO WITNESSES</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={async () => {
              if (!ref.current) return;
              const url = await toPng(ref.current, { pixelRatio: 2 });
              const a = document.createElement('a');
              a.href = url;
              a.download = 'job-done.png';
              a.click();
            }}
          >
            <Download className="size-4" /> Save as image
          </button>
          <button className="btn-gold" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The old +/− buttons, tucked away for fixing your total to match the city. */
function FixTotal({ memberId, rep, onClose }: { memberId: string; rep: number; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const bump = (d: number) => rep + d >= 0 && adjustRep(memberId, d);
  return (
    <Modal title="Fix my total" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ash">For when your total here doesn’t match the city. Logging sessions is the usual way.</p>
        <p className="text-center font-mono text-4xl text-gold-100">{n(rep)}</p>
        <div className="flex justify-center gap-1">
          {[-10, -1, 1, 10].map((d) => (
            <button key={d} className="btn-ghost btn-sm px-2 font-mono" onClick={() => bump(d)} disabled={rep + d < 0}>
              {d > 0 ? <Plus className="size-3" /> : <Minus className="size-3" />}
              {Math.abs(d)}
            </button>
          ))}
        </div>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Math.round(Number(custom));
            if (Number.isFinite(v) && v !== 0) bump(v);
            setCustom('');
          }}
        >
          <input className="input font-mono" placeholder="±amount" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d-]/g, ''))} />
          <button className="btn-ghost">Apply</button>
        </form>
      </div>
    </Modal>
  );
}

function SendToFamily({ memberId, available, onClose }: { memberId: string; available: number; onClose: () => void }) {
  const { memberById } = useHub();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const a = Math.round(Number(amount) || 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (a <= 0) return setError('Enter how much rep to send.');
    if (a > available) return setError(`You only have ${n(available)} petty rep.`);
    try {
      await requestTransfer(memberId, a);
      notify('rep.sent', { title: '🤝 Rep sent to the family', description: `**${memberById.get(memberId)?.name ?? 'A member'}** is sending **${n(a)}** petty rep. Waiting on a Lieutenant+ to confirm.` });
      onClose();
    } catch {
      setError('Couldn’t send that. Try again.');
    }
  }
  return (
    <Modal title="Send rep to the family" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ash">It leaves your petty rep now and waits for a Lieutenant or above to confirm it in the city. If they turn it down, you get it back.</p>
        <Field label={`Amount · you have ${n(available)}`}>
          <input className="input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[25, 50, 100].map((p) => (
            <button type="button" key={p} className="btn-ghost btn-sm" onClick={() => setAmount(String(Math.floor((available * p) / 100)))}>
              {p === 100 ? 'All' : `${p}%`}
            </button>
          ))}
        </div>
        <ErrorText error={error} />
        <button className="btn-gold w-full py-3">
          <Send className="size-4" /> Send {a > 0 ? n(a) : ''} rep
        </button>
      </form>
    </Modal>
  );
}

// ---------- goals ----------

function Bar({ value, max, tone = 'gold' }: { value: number; max: number; tone?: 'gold' | 'ok' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-raised ring-1 ring-line">
      <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 || tone === 'ok' ? 'bg-ok shadow-[0_0_10px_rgba(74,222,128,0.6)]' : 'bg-gradient-to-r from-gold-600 to-gold-300 shadow-[0_0_10px_rgba(212,175,55,0.5)]'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function WeeklyGoal({ memberId, week }: { memberId: string; week: number }) {
  const goal = useDoc<{ weekly?: number }>(`pettyGoals/${memberId}`);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const target = goal?.weekly ?? 0;
  return (
    <div className="hud flex flex-col justify-between gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="label">This week</p>
        <button className="text-[11px] text-smoke hover:text-gold-200" onClick={() => (setV(target ? String(target) : ''), setEditing(!editing))}>
          <Pencil className="mr-1 inline size-3" />
          {target ? 'Goal' : 'Set a goal'}
        </button>
      </div>
      <p className="font-mono text-2xl text-gold-100">
        {n(week)}
        {target > 0 && <span className="text-sm text-smoke"> / {n(target)} rep</span>}
      </p>
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void setWeeklyGoal(memberId, +v || 0);
            setEditing(false);
          }}
        >
          <input className="input py-1 font-mono text-sm" inputMode="numeric" value={v} onChange={(e) => setV(digits(e.target.value))} placeholder="Weekly rep goal" autoFocus />
          <button className="btn-gold btn-sm">Save</button>
        </form>
      ) : target > 0 ? (
        <>
          <Bar value={week} max={target} />
          <p className="text-[11px] text-smoke">{week >= target ? 'Goal hit. 👊' : `${n(target - week)} to go · resets Monday`}</p>
        </>
      ) : (
        <p className="text-[11px] text-smoke">Rep you’ve logged since Monday.</p>
      )}
    </div>
  );
}

function FamilyGoalCard({ goal, transfers, familyRep, canSet }: { goal: FamilyGoal | null | undefined; transfers: RepTransfer[]; familyRep: number; canSet: boolean }) {
  const [editing, setEditing] = useState(false);
  const on = !!goal?.target && !!goal.by;
  const from = goal?.from?.toMillis() ?? 0;
  const end = goal?.by ? new Date(`${goal.by}T23:59:59`).getTime() : 0;
  const got = on ? transfers.filter((t) => t.status === 'confirmed' && (t.decidedAt?.toMillis() ?? 0) >= from && (t.decidedAt?.toMillis() ?? 0) <= end).reduce((s, t) => s + t.amount, 0) : 0;
  const left = Math.ceil((end - Date.now()) / DAY);
  return (
    <div className="hud flex flex-col justify-between gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="label flex items-center gap-1">
          <Target className="size-3" /> {on ? goal!.title || 'Family goal' : 'Family rep'}
        </p>
        {canSet && (
          <button className="text-[11px] text-smoke hover:text-gold-200" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 inline size-3" />
            {on ? 'Edit' : 'Set a goal'}
          </button>
        )}
      </div>
      {on ? (
        <>
          <p className="font-mono text-2xl text-gold-100">
            {n(got)} <span className="text-sm text-smoke">/ {n(goal!.target)}</span>
          </p>
          <Bar value={got} max={goal!.target} />
          <p className="text-[11px] text-smoke">
            {got >= goal!.target ? 'Done. The family delivered.' : left > 0 ? `${left} ${left === 1 ? 'day' : 'days'} left · by ${new Date(`${goal!.by}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Time’s up.'}
          </p>
        </>
      ) : (
        <>
          <p className="font-mono text-2xl text-gold-100">{n(familyRep)}</p>
          <p className="text-[11px] text-smoke">The Chosen’s gang rep</p>
        </>
      )}
      {editing && <FamilyGoalEditor goal={goal ?? null} onClose={() => setEditing(false)} />}
    </div>
  );
}

function FamilyGoalEditor({ goal, onClose }: { goal: FamilyGoal | null; onClose: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '');
  const [by, setBy] = useState(goal?.by ?? '');
  return (
    <Modal title="Family goal" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!+target || !by) return;
          await setFamilyGoal({ title: title.trim().slice(0, 60), target: +target, by });
          onClose();
        }}
      >
        <p className="text-sm text-ash">Counts rep confirmed to the family from now until the end of the day you pick. Saving starts the count fresh.</p>
        <Field label="Name">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. October push" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rep target">
            <input className="input font-mono" inputMode="numeric" value={target} onChange={(e) => setTarget(digits(e.target.value))} />
          </Field>
          <Field label="By">
            <input className="input" type="date" value={by} onChange={(e) => setBy(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-between gap-2">
          {goal?.target ? (
            <button type="button" className="btn-ghost text-red-300" onClick={async () => (await setFamilyGoal(null), onClose())}>
              <Trash2 className="size-4" /> Clear goal
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold" disabled={!+target || !by}>
            Save goal
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- my history ----------

function WeekChart({ sessions }: { sessions: Crime[] }) {
  const start = weekStart();
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = start + i * DAY;
    return { label: new Date(from).toLocaleDateString('en-US', { weekday: 'short' }), rep: sessions.filter((c) => (c.at?.toMillis() ?? Date.now()) >= from && (c.at?.toMillis() ?? Date.now()) < from + DAY).reduce((s, c) => s + c.rep, 0), today: Date.now() >= from && Date.now() < from + DAY };
  });
  const max = Math.max(1, ...days.map((d) => d.rep));
  return (
    <div>
      <p className="label mb-2">Rep this week</p>
      <div className="flex h-28 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${n(d.rep)} rep`}>
            {d.rep > 0 && <span className="font-mono text-[10px] text-gold-200">{n(d.rep)}</span>}
            <div className={`w-full rounded-t-sm ${d.today ? 'bg-gold-300' : 'bg-gold-600/70'}`} style={{ height: `${Math.max(d.rep ? 6 : 2, (d.rep / max) * 80)}%` }} />
            <span className={`text-[10px] ${d.today ? 'text-gold-200' : 'text-smoke'}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Breakdown({ sessions }: { sessions: Crime[] }) {
  const counts = new Map<string, number>();
  sessions.forEach((c) => Object.entries(crimesIn(c)).forEach(([k, v]) => counts.set(k, (counts.get(k) ?? 0) + v)));
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div>
      <p className="label mb-2">All-time jobs</p>
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between">
                <span className="text-ash">{k}</span>
                <span className="font-mono text-gold-200">{n(v)}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-raised">
                <div className="h-full rounded-full bg-gold-500" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Nothing yet.</p>
      )}
    </div>
  );
}

/** My sessions, filed like a rap sheet. */
function RapSheet({ me, sessions, myRep }: { me: { id: string; name: string }; sessions: Crime[]; myRep: number }) {
  const [type, setType] = useState('');
  const [range, setRange] = useState<'week' | 'month' | 'all'>('all');
  const [q, setQ] = useState('');
  const since = range === 'week' ? weekStart() : range === 'month' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : 0;
  const types = [...new Set(sessions.flatMap((c) => Object.keys(crimesIn(c))))];
  const list = sessions
    .filter((c) => (c.at?.toMillis() ?? Date.now()) >= since)
    .filter((c) => !type || crimesIn(c)[type])
    .filter((c) => !q || `${c.crime} ${c.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const totals = list.reduce((t, c) => ({ rep: t.rep + c.rep, cash: t.cash + c.cash, jobs: t.jobs + jobsIn(c) }), { rep: 0, cash: 0, jobs: 0 });
  return (
    <section className="rap-sheet">
      <header className="rap-head">
        <div>
          <p className="rap-kicker">Los Santos Police Department · Record of arrests &amp; prosecutions</p>
          <p className="rap-title">Rap sheet</p>
        </div>
        <div className="text-right">
          <p className="rap-kicker">Subject</p>
          <p className="font-mono text-sm text-bone">{me.name.toUpperCase()}</p>
          <p className="font-mono text-[10px] text-smoke">#{me.id.slice(0, 8).toUpperCase()}</p>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-line px-4 py-2.5">
        <div className="flex items-center gap-1.5 border-b border-line-soft">
          <Search className="size-3.5 text-smoke" />
          <input className="w-32 bg-transparent py-1 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Every charge</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-full ring-1 ring-line">
          {(
            [
              ['week', 'Week'],
              ['month', 'Month'],
              ['all', 'All'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} className={`px-2.5 py-1 text-[11px] font-bold ${range === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] text-smoke">
          {n(list.length)} entries · {n(totals.jobs)} jobs · +{n(totals.rep)} rep · {money(totals.cash)}
        </span>
      </div>
      {list.length ? (
        <ol>
          {list.map((c, i) => (
            <li key={c.id} className="rap-row">
              <span className="rap-no">{String(list.length - i).padStart(3, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] text-smoke">
                  {c.at ? new Date(c.at.toMillis()).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now'} · {ago(c.at)}
                </span>
                <span className="flex flex-wrap gap-1 py-0.5">
                  {Object.entries(crimesIn(c)).map(([k, v]) => (
                    <span key={k} className="rap-charge">
                      {k}
                      {v > 1 ? ` ×${v}` : ''}
                    </span>
                  ))}
                </span>
                {c.notes && <span className="block text-xs text-ash italic">“{c.notes}”</span>}
                {c.perJob && c.perJob.length > 0 && <span className="block font-mono text-[10px] text-smoke">per mission: {c.perJob.join(' · ')}</span>}
              </span>
              <span className="text-right font-mono text-sm">
                <span className="block text-gold-200">+{n(c.rep)}</span>
                {c.cash > 0 && <span className="block text-red-300">{money(c.cash)}</span>}
              </span>
              <button
                className="p-1 text-smoke hover:text-red-300"
                title="Remove (takes the rep and the locker money back off)"
                onClick={() => confirm('Remove this entry? Its rep and locker money come back off.') && deleteCrime(c, myRep)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="p-6">
          <Empty icon={<HandCoins className="size-7" />} title={sessions.length ? 'Nothing matches' : 'Clean record'}>
            {sessions.length ? 'Try another filter.' : 'Log a session to start your sheet.'}
          </Empty>
        </div>
      )}
    </section>
  );
}

// ---------- boards ----------

function Board({ title, rows, fmt = n, right }: { title: string; rows: [string, number][]; fmt?: (v: number) => string; right?: React.ReactNode }) {
  const { memberById } = useHub();
  return (
    <Panel title={title} right={right}>
      <ol className="space-y-2">
        {rows.map(([id, v], i) => (
          <li key={id} className="flex items-center gap-3">
            <span className="w-5 font-mono text-sm text-gold-500">{i + 1}</span>
            <Avatar member={memberById.get(id)} size="xs" />
            <MemberName id={id} className="flex-1 truncate" />
            <span className="font-mono text-sm text-gold-200">{fmt(v)}</span>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-smoke">Nobody yet.</li>}
      </ol>
    </Panel>
  );
}

const STATUS = {
  pending: 'bg-warn/20 text-amber-300',
  confirmed: 'bg-ok/15 text-green-300',
  rejected: 'bg-danger/20 text-red-300',
};

// ---------- page ----------

export default function PettyCrime() {
  const { me, can, familyRep, memberById, myRank } = useHub();
  const reps = useCollection<PettyRep>('petty') ?? [];
  const transfers = useCollection<RepTransfer>('repTransfers') ?? [];
  const all = useCollection<Crime>('pettyLog') ?? [];
  const goal = useDoc<FamilyGoal>('settings/pettyGoal');
  const [logging, setLogging] = useState(false);
  const [sending, setSending] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [receipt, setReceipt] = useState<Omit<Crime, 'id'> | null>(null);

  const mineQ = useMemo(() => query(collection(db, 'pettyLog'), where('memberId', '==', me.id)), [me.id]);
  const mineRows = useCollection<Crime>(mineQ);
  const sessions = useMemo(() => [...(mineRows ?? [])].sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now())), [mineRows]);
  const myRep = reps.find((r) => r.id === me.id)?.rep ?? 0;
  const week = sessions.filter((c) => (c.at?.toMillis() ?? Date.now()) >= weekStart()).reduce((s, c) => s + c.rep, 0);
  const streak = hotStreak(sessions);
  const mine = transfers.filter((t) => t.memberId === me.id).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const sent = mine.filter((t) => t.status === 'confirmed').reduce((s, t) => s + t.amount, 0);
  const waiting = mine.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const pending = transfers.filter((t) => t.status === 'pending').sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0));
  const confirmer = can('confirmRep');
  const active = (id: string) => memberById.get(id)?.status === 'active';

  // Boards
  const top = (m: Map<string, number>) => [...m].filter(([id, v]) => v > 0 && active(id)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const givers = top(transfers.filter((t) => t.status === 'confirmed').reduce((m, t) => m.set(t.memberId, (m.get(t.memberId) ?? 0) + t.amount), new Map<string, number>()));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const cashMonth = top(all.filter((c) => (c.at?.toMillis() ?? Date.now()) >= monthStart).reduce((m, c) => m.set(c.memberId, (m.get(c.memberId) ?? 0) + c.cash), new Map<string, number>()));
  const byType = new Map<string, Map<string, number>>();
  all.forEach((c) =>
    Object.entries(crimesIn(c)).forEach(([k, v]) => {
      if (!PETTY_CRIMES.includes(k)) return;
      const m = byType.get(k) ?? new Map<string, number>();
      m.set(c.memberId, (m.get(c.memberId) ?? 0) + v);
      byType.set(k, m);
    }),
  );

  return (
    <>
      <PageHeader
        icon={HandCoins}
        kicker="Street"
        title="Petty Crime"
        sub="Log your street work in sessions, chase your weekly goal, and send rep to the family. Every bit you send builds The Chosen’s gang rep."
        actions={
          <>
            <button className="btn-gold" onClick={() => setLogging(true)}>
              <Plus className="size-4" /> Log a session
            </button>
            <button className="btn-ghost" onClick={() => setSending(true)} disabled={myRep <= 0}>
              <Send className="size-4" /> Send to family
            </button>
          </>
        }
      />

      {/* my hustle */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="hud relative overflow-hidden px-4 py-3">
          <p className="label">Your petty rep</p>
          <p className="mt-1 font-mono text-4xl font-semibold text-gold-100">{n(myRep)}</p>
          <p className="mt-1 text-[11px] text-smoke">{streak > 1 ? `On a ${streak}-day streak` : 'Log a session a day to start a streak'}</p>
          <button className="mt-1 text-[11px] text-smoke underline-offset-2 hover:text-gold-200 hover:underline" onClick={() => setFixing(true)}>
            Fix my total
          </button>
          {streak > 1 && (
            <span className="petty-flame absolute top-3 right-3 flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-300 ring-1 ring-orange-400/40" title={`Logged ${streak} days in a row`}>
              <Flame className="size-3.5" /> {streak}
            </span>
          )}
        </div>
        <WeeklyGoal memberId={me.id} week={week} />
        <FamilyGoalCard goal={goal} transfers={transfers} familyRep={familyRep} canSet={confirmer || myRank?.order === 0 || !!myRank?.leadership} />
        <div className="hud px-4 py-3">
          <p className="label">You’ve sent</p>
          <p className="mt-1 font-mono text-2xl text-gold-100">{n(sent)}</p>
          <p className="text-[11px] text-smoke">{waiting ? `${n(waiting)} waiting on a confirm` : 'Confirmed to the family'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {confirmer && (
            <Panel title={`To confirm · ${pending.length}`}>
              {pending.length ? (
                <ul className="divide-y divide-line-soft">
                  {pending.map((t) => {
                    const own = t.memberId === me.id && myRank?.order !== 0;
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <Avatar member={memberById.get(t.memberId)} />
                        <span className="min-w-0 flex-1">
                          <MemberName id={t.memberId} /> <span className="text-ash">is sending</span> <span className="font-mono font-semibold text-gold-200">{n(t.amount)}</span> <span className="text-ash">rep</span>
                          <span className="block text-xs text-smoke">{ago(t.at)}</span>
                        </span>
                        {own ? (
                          <span className="text-xs text-smoke">Someone else confirms yours</span>
                        ) : (
                          <span className="flex gap-1.5">
                            <button
                              className="btn-gold btn-sm"
                              onClick={() =>
                                confirmTransfer(t, me.id).then(() =>
                                  notify('rep.confirmed', {
                                    title: '✅ Rep donation confirmed',
                                    description: `**${n(t.amount)}** rep from **${memberById.get(t.memberId)?.name ?? 'a member'}** is in. Confirmed by ${me.name}.`,
                                    fields: [{ name: 'Family rep', value: n(familyRep + t.amount), inline: true }],
                                  }),
                                )
                              }
                            >
                              <Check className="size-3.5" /> Confirm
                            </button>
                            <button className="btn-danger btn-sm" onClick={() => rejectTransfer(t, me.id)}>
                              <X className="size-3.5" /> Reject
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-smoke">Nothing waiting.</p>
              )}
            </Panel>
          )}

          <div className="hud grid gap-6 p-4 sm:grid-cols-2">
            <WeekChart sessions={sessions} />
            <Breakdown sessions={sessions} />
          </div>

          <RapSheet me={me} sessions={sessions} myRep={myRep} />

          <Panel title="Your transfers">
            {mine.length ? (
              <ul className="divide-y divide-line-soft">
                {mine.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <span className="font-mono font-semibold text-gold-200">{n(t.amount)}</span>
                    <span className="flex-1 text-sm text-smoke">
                      {ago(t.at)}
                      {t.decidedBy && (
                        <>
                          {' '}
                          · {t.status} by <MemberName id={t.decidedBy} />
                        </>
                      )}
                    </span>
                    <span className={`chip ${STATUS[t.status]}`}>{t.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">You haven’t sent any rep to the family yet.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Board title="Gave the most to the family" rows={givers} right={<Trophy className="size-4 text-gold-400" />} />
          <Board title="Dirty money made · this month" rows={cashMonth} fmt={money} />
          <Panel title="Kings of the street">
            <ul className="space-y-2.5">
              {PETTY_CRIMES.map((k) => {
                const lead = top(byType.get(k) ?? new Map())[0];
                return (
                  <li key={k} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-smoke">{k}</span>
                    {lead ? (
                      <>
                        <Avatar member={memberById.get(lead[0])} size="xs" />
                        <MemberName id={lead[0]} className="min-w-0 flex-1 truncate text-sm" />
                        <span className="font-mono text-xs text-gold-200">×{n(lead[1])}</span>
                      </>
                    ) : (
                      <span className="text-sm text-smoke">Up for grabs</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      {logging && (
        <LogSession
          memberId={me.id}
          onClose={() => setLogging(false)}
          onLogged={(c) => {
            setLogging(false);
            setReceipt(c);
          }}
        />
      )}
      {receipt && <Receipt c={receipt} streak={Math.max(streak, 1)} onClose={() => setReceipt(null)} />}
      {sending && <SendToFamily memberId={me.id} available={myRep} onClose={() => setSending(false)} />}
      {fixing && <FixTotal memberId={me.id} rep={myRep} onClose={() => setFixing(false)} />}
    </>
  );
}
