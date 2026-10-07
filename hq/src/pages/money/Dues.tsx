import { Check, Settings2, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Empty, ErrorText, Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { confirmDues, dinnerOf, excuse, openDinner, payDues, rejectDues, saveDuesSettings, type DuesAmounts, type DuesPay, type DuesSettings, type DuesWeek } from '../../lib/books';
import { et } from '../../lib/calendar';
import { feed } from '../../lib/adminData';
import { money } from '../../lib/money';
import { confirmTransfer, rejectTransfer, requestTransfer } from '../../lib/petty';
import type { RepTransfer } from '../../lib/types';
import type { Books } from './useBooks';
import { fmtDue, KINDS, lifetime, owedBefore, stateOf, type DueKind, type DueState } from './duesCalc';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PILL: Record<DueState, string> = {
  confirmed: 'border-gold-300 bg-gold-400/15 text-gold-100',
  waiting: 'border-dashed border-amber-400 text-amber-300',
  partial: 'border-dashed border-red-400/70 text-red-200',
  owed: 'border-red-500 bg-red-900/35 text-red-200',
  excused: 'border-line opacity-40 text-smoke',
  none: 'border-line-soft opacity-30 text-smoke',
};
const LABEL: Record<DueState, string> = { confirmed: 'confirmed', waiting: 'waiting', partial: 'part paid', owed: 'owed', excused: 'excused', none: '—' };
const dayLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** High Table: the dinner day and what each rank owes. */
function DuesSettingsDialog({ current, onClose }: { current: DuesSettings | null; onClose: () => void }) {
  const { ranks, me } = useHub();
  const [day, setDay] = useState(current?.day ?? 0);
  const [rows, setRows] = useState<Record<string, Record<DueKind, string>>>(() =>
    Object.fromEntries(ranks.map((r) => [r.id, Object.fromEntries(KINDS.map((k) => [k, current?.byRank?.[r.id]?.[k] ? String(current.byRank[r.id]![k]) : ''])) as Record<DueKind, string>])),
  );
  return (
    <Modal title="Dinner dues" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const byRank: Record<string, DuesAmounts> = {};
          Object.entries(rows).forEach(([id, v]) => {
            const a = { rep: Number(v.rep) || 0, clean: Number(v.clean) || 0, dirty: Number(v.dirty) || 0 };
            if (a.rep || a.clean || a.dirty) byRank[id] = a;
          });
          await saveDuesSettings({ day, byRank });
          void feed(me, 'settings', `Set dinner dues (${DAYS[day]}s)`);
          onClose();
        }}
      >
        <Field label="Family dinner is every">
          <select className="input w-auto" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="label text-left">
                <th className="py-1.5">Rank</th>
                <th>Rep</th>
                <th>Clean $</th>
                <th>Dirty $</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 pr-2 text-gold-100">{r.name}</td>
                  {KINDS.map((k) => (
                    <td key={k} className="pr-2">
                      <input
                        className="input py-1 font-mono"
                        inputMode="numeric"
                        placeholder="0"
                        value={rows[r.id]?.[k] ?? ''}
                        onChange={(e) => setRows({ ...rows, [r.id]: { ...rows[r.id]!, [k]: e.target.value.replace(/\D/g, '') } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-smoke">Each dinner remembers what everyone owed that night, so changing these doesn’t rewrite past dinners.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** A member pays one kind of dues for a dinner: rep from their petty rep, cash from their safe. */
function PayDialog({ week, kind, left, onClose, b }: { week: string; kind: DueKind; left: number; onClose: () => void; b: Books }) {
  const { me } = useHub();
  const petty = useDoc<{ rep?: number }>(`petty/${me.id}`);
  const have = kind === 'rep' ? (petty?.rep ?? 0) : kind === 'dirty' ? b.m.mine.held : b.m.mine.clean;
  const [amount, setAmount] = useState(String(Math.min(left, have) || left));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = Math.round(Number(amount) || 0);
  return (
    <Modal title={`Pay ${kind === 'rep' ? 'rep' : `${kind} cash`} · dinner ${dayLabel(week)}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (a <= 0) return setError('Enter an amount.');
          if (a > have) return setError(kind === 'rep' ? `You only have ${have.toLocaleString()} petty rep.` : `Your safe only has ${money(have)} ${kind}.`);
          setBusy(true);
          try {
            if (kind === 'rep') await requestTransfer(me.id, a, week);
            else await payDues(me.id, week, kind, a);
            onClose();
          } catch {
            setError('That didn’t go through. Try again.');
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-ash">
          {kind === 'rep' ? 'It leaves your petty rep now and counts once a Rep Keeper confirms it.' : 'It leaves your locker safe now and counts once the Treasurer confirms it. If they turn it down, it goes back in your safe.'}
        </p>
        <Field label={`Amount · ${left ? `${fmtDue(kind, left)} left for this dinner · ` : ''}you have ${kind === 'rep' ? have.toLocaleString() : money(have)}`}>
          <input className="input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            Mark paid
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Dues({ b }: { b: Books }) {
  const { me, roster, rankById, can, isLead, memberById, myRank } = useHub();
  const s = b.duesSettings;
  const now = et(Date.now());
  const thisWeek = s ? dinnerOf(s.day, now) : null;
  const [pick, setPick] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [paying, setPaying] = useState<{ week: string; kind: DueKind; left: number } | null>(null);
  const keeper = can('confirmRep');
  const treasurer = can('money');
  // Opens tonight's dinner with what everyone owes by their rank right now.
  useEffect(() => {
    if (!s || !thisWeek || b.weeks.some((w) => w.id === thisWeek) || !(isLead || keeper || treasurer)) return;
    const owe: Record<string, DuesAmounts> = {};
    roster.forEach((m) => {
      const a = s.byRank?.[m.rankId ?? ''];
      if (a && (a.rep || a.clean || a.dirty)) owe[m.id] = a;
    });
    if (Object.keys(owe).length) void openDinner(thisWeek, owe).catch(() => {});
  }, [s, thisWeek, b.weeks, roster, isLead, keeper, treasurer]);

  if (!b.duesReady) return null;
  if (!s)
    return (
      <Empty title="No dinner dues yet">
        {isLead ? (
          <>
            Pick the dinner day and what each rank owes.{' '}
            <button className="btn-gold btn-sm mt-3" onClick={() => setSettings(true)}>
              <Settings2 className="size-3.5" /> Set up dues
            </button>
            {settings && <DuesSettingsDialog current={null} onClose={() => setSettings(false)} />}
          </>
        ) : (
          'High Table sets the dinner day and what each rank owes.'
        )}
      </Empty>
    );

  const week: DuesWeek | undefined = b.weeks.find((w) => w.id === (pick ?? thisWeek)) ?? b.weeks[0];
  const members = week ? Object.keys(week.owe ?? {}).sort((a, x) => (rankById.get(memberById.get(a)?.rankId ?? '')?.order ?? 99) - (rankById.get(memberById.get(x)?.rankId ?? '')?.order ?? 99)) : [];
  const tot = { owe: { rep: 0, clean: 0, dirty: 0 }, ok: { rep: 0, clean: 0, dirty: 0 }, waiting: 0 };
  if (week)
    members.forEach((id) => {
      if (week.excused?.[id]) return;
      KINDS.forEach((k) => {
        const st = stateOf(week, id, k, b.transfers, b.duesPays);
        tot.owe[k] += st.owe;
        tot.ok[k] += Math.min(st.ok, st.owe);
        if (st.waiting) tot.waiting++;
      });
    });
  const pct = (() => {
    const all = KINDS.reduce((t, k) => t + (tot.owe[k] ? Math.min(1, tot.ok[k] / tot.owe[k]) : 0), 0);
    const n = KINDS.filter((k) => tot.owe[k]).length;
    return n ? Math.round((all / n) * 100) : 0;
  })();
  const givers = roster
    .map((m) => ({ m, l: lifetime(m.id, b.transfers, b.duesPays) }))
    .filter((x) => x.l.rep || x.l.clean || x.l.dirty)
    .sort((a, x) => x.l.clean + x.l.dirty + x.l.rep * 100 - (a.l.clean + a.l.dirty + a.l.rep * 100))
    .slice(0, 8);

  const pendingRep = (id: string) => b.transfers.filter((t) => t.dues === week?.id && t.memberId === id && t.status === 'pending');
  const pendingCash = (id: string, k: DueKind) => b.duesPays.filter((p) => p.week === week?.id && p.memberId === id && p.cash === k && p.status === 'pending');
  const canConfirm = (id: string, k: DueKind) => (k === 'rep' ? keeper : treasurer) && (id !== me.id || myRank?.order === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl text-gold-100">
          {DAYS[s.day]} dinner · {week ? dayLabel(week.id) : '—'}
          {week?.id === thisWeek && <span className="label ml-2 text-gold-400">this week</span>}
        </h2>
        <select className="input ml-auto w-auto py-1 text-sm" value={week?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
          {b.weeks.map((w) => (
            <option key={w.id} value={w.id}>
              {DAYS[s.day]} {dayLabel(w.id)}
            </option>
          ))}
        </select>
        {isLead && (
          <button className="btn-ghost btn-sm" onClick={() => setSettings(true)}>
            <Settings2 className="size-3.5" /> Dues by rank
          </button>
        )}
      </div>
      <p className="text-sm text-smoke">Each member marks their own dues paid. The Rep Keeper confirms rep; the Treasurer confirms clean and dirty. Owed from past dinners rides along.</p>

      {!week ? (
        <Empty title="No dinner yet">The dinner opens automatically on {DAYS[s.day]} for the Treasurer, Rep Keepers and leadership.</Empty>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="hud">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
              <span className="label">At the table · {members.length}</span>
              <span className="label">Rep · Clean · Dirty</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {members.map((id) => {
                const m = memberById.get(id);
                const back = owedBefore(b.weeks, id, week.id, b.transfers, b.duesPays);
                const backText = KINDS.filter((k) => back[k]).map((k) => `${fmtDue(k, back[k])} ${k}`);
                const excused = !!week.excused?.[id];
                return (
                  <li key={id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar member={m} />
                    <span className="min-w-[10rem] flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                      <b className="text-gold-100">{m?.name ?? 'Someone'}</b> <span className="text-xs text-smoke">{rankById.get(m?.rankId ?? '')?.name}</span>
                      {excused ? (
                        <span className="block text-[11px] text-smoke">Excused</span>
                      ) : backText.length ? (
                        <span className="block text-[11px] text-red-300">+ {backText.join(', ')} from past dinners</span>
                      ) : null}
                    </span>
                    <span className="grid flex-1 grid-cols-3 gap-2 sm:flex sm:flex-none">
                    {KINDS.map((k) => {
                      const st = stateOf(week, id, k, b.transfers, b.duesPays);
                      const mine = id === me.id && !excused && (st.state === 'owed' || st.state === 'partial');
                      const confirmable = canConfirm(id, k) && st.waiting > 0;
                      return (
                        <span key={k} className={`flex flex-col items-center rounded-lg border px-2 py-1.5 text-[11px] sm:min-w-[6.5rem] ${PILL[st.state]}`}>
                          <b className="font-mono text-sm">{st.owe ? fmtDue(k, st.owe) : '—'}</b>
                          <span>
                            {k} · {LABEL[st.state]}
                          </span>
                          {mine && (
                            <button className="mt-1 text-[10px] font-bold tracking-wider text-gold-300 uppercase hover:text-gold-100" onClick={() => setPaying({ week: week.id, kind: k, left: Math.max(0, st.owe - st.ok - st.waiting) })}>
                              Mark paid
                            </button>
                          )}
                          {confirmable && (
                            <span className="mt-1 flex gap-2">
                              <button
                                className="text-ok hover:brightness-125"
                                title="Confirm"
                                onClick={() => (k === 'rep' ? pendingRep(id).forEach((t: RepTransfer) => void confirmTransfer(t, me.id)) : pendingCash(id, k).forEach((p: DuesPay) => void confirmDues(p, me.id)))}
                              >
                                <Check className="size-4" />
                              </button>
                              <button
                                className="text-red-300 hover:brightness-125"
                                title="Turn it down"
                                onClick={() => (k === 'rep' ? pendingRep(id).forEach((t: RepTransfer) => void rejectTransfer(t, me.id)) : pendingCash(id, k).forEach((p: DuesPay) => void rejectDues(p, me.id)))}
                              >
                                <X className="size-4" />
                              </button>
                            </span>
                          )}
                        </span>
                      );
                    })}
                    </span>
                    {isLead && (
                      <button className="text-smoke hover:text-gold-200" title={excused ? 'Not excused' : 'Excuse them this dinner'} onClick={() => excuse(week.id, id, !excused)}>
                        <UserX className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-5">
            <div className="hud flex items-center gap-5 p-5">
              <div className="dues-ring" style={{ '--p': `${pct}%` } as React.CSSProperties}>
                <div>
                  <b className="font-mono text-2xl text-gold-100">{pct}%</b>
                  <span className="label block text-[9px]">collected</span>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  Rep <b className="font-mono text-gold-200">{tot.ok.rep.toLocaleString()} / {tot.owe.rep.toLocaleString()}</b>
                </p>
                <p>
                  Clean <b className="font-mono text-ok">{money(tot.ok.clean)} / {money(tot.owe.clean)}</b>
                </p>
                <p>
                  Dirty <b className="font-mono text-red-300">{money(tot.ok.dirty)} / {money(tot.owe.dirty)}</b>
                </p>
                {tot.waiting > 0 && <p className="text-amber-300">{tot.waiting} waiting to confirm</p>}
              </div>
            </div>
            <Panel title="Lifetime givers">
              {givers.length ? (
                <ul className="divide-y divide-line-soft text-sm">
                  {givers.map(({ m, l }) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <Avatar member={m} size="xs" /> {m.name}
                      </span>
                      <span className="font-mono text-xs">
                        {l.rep.toLocaleString()} rep · <span className="text-ok">{money(l.clean)}</span> · <span className="text-red-300">{money(l.dirty)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-smoke">Nobody has given yet.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
      {settings && <DuesSettingsDialog current={s} onClose={() => setSettings(false)} />}
      {paying && <PayDialog {...paying} b={b} onClose={() => setPaying(null)} />}
    </div>
  );
}

/** What I still owe across every dinner (for the Dashboard). */
export function myDuesOwed(memberId: string, weeks: DuesWeek[], transfers: RepTransfer[], pays: DuesPay[]) {
  return owedBefore(weeks, memberId, '9999-99-99', transfers, pays);
}
