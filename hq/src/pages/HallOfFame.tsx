import { collection, query } from 'firebase/firestore';
import { Crown, Feather, Flame, Hourglass, Landmark, Luggage, Medal, Pencil, Plus, Scroll, Skull, Swords, Trash2, Trophy as TrophyIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Empty, Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { Trophy } from '../components/Trophy';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { monthKey, monthName } from '../lib/boards';
import { awardTrophy } from '../lib/cabinet';
import { fromET } from '../lib/calendar';
import { db } from '../lib/firebase';
import {
  addLegend,
  addMemory,
  HALL_BOARDS,
  lightCandle,
  removeLegend,
  removeMemory,
  setMonthMvp,
  useHall,
  usePastMembers,
  type Past,
  type HallBoardId,
  type Legend,
  type Memory,
  type MonthMvp,
  type Ranked,
  type Tribute,
} from '../lib/hall';
import type { Member } from '../lib/types';

/** Gold, silver and bronze steps for the top 3. Shared with the Dashboard. */
export function Podium({ rows, board, compact = false, flames }: { rows: Ranked[]; board: { unit: (v: number) => string }; compact?: boolean; flames?: Map<string, number> }) {
  const { memberById } = useHub();
  const order = [rows[1], rows[0], rows[2]];
  const heights = compact ? ['h-14', 'h-20', 'h-10'] : ['h-20', 'h-28', 'h-14'];
  const metal = ['podium-silver', 'podium-gold', 'podium-bronze'];
  return (
    <div className="podium relative flex items-end justify-center gap-2 pt-4 sm:gap-3">
      {rows[0] && <div className="podium-rays pointer-events-none absolute top-0 left-1/2 -translate-x-1/2" aria-hidden />}
      {order.map((r, i) => {
        const place = [2, 1, 3][i]!;
        const f = r ? (flames?.get(r.memberId) ?? 0) : 0;
        return (
          <div key={place} className="relative flex w-1/3 max-w-40 flex-col items-center text-center">
            {r ? (
              <>
                {place === 1 && <Crown className="podium-crown mb-1 size-6 text-gold-300" />}
                <span className={`podium-ring ${metal[i]} relative`}>
                  <Avatar member={memberById.get(r.memberId)} size={compact ? 'md' : 'lg'} />
                  {f >= 2 && (
                    <span className="absolute -right-2 -bottom-1 flex items-center rounded-full bg-black/80 px-1 text-[10px] font-bold text-orange-300" title={`Top 3 for ${f} months running`}>
                      <Flame className="size-3 fill-orange-400 text-orange-400" />
                      {f}
                    </span>
                  )}
                </span>
                <MemberName id={r.memberId} className="mt-1.5 max-w-full truncate text-sm" />
                <p className="mt-0.5 rounded-full border border-line-soft bg-black/40 px-2 font-mono text-[11px] text-gold-200">{board.unit(r.value)}</p>
              </>
            ) : (
              <p className="mb-2 text-xs text-smoke">—</p>
            )}
            <div className={`podium-block ${metal[i]} mt-2 flex w-full items-start justify-center ${heights[i]} pt-1.5`}>
              <span className="font-display text-xl font-bold">{place}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, '0')}`;
};

function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const [y, m] = monthKey().split('-').map(Number);
  const end = fromET(y!, m! + 1, 1).getTime();
  const left = Math.max(0, end - now);
  return `${Math.floor(left / 86400e3)}d ${Math.floor((left % 86400e3) / 3600e3)}h`;
}

/** A little burst of gold when you're #1 on something this month. */
function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 3800);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {Array.from({ length: 70 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 14) * 0.08}s`,
            background: ['#f6dd8a', '#d4af37', '#fff3c4', '#a8822a', '#ffffff'][i % 5],
            transform: `rotate(${i * 23}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function MvpPicker({ ym, onClose }: { ym: string; onClose: () => void }) {
  const { roster, me, can } = useHub();
  const [who, setWho] = useState('');
  const [why, setWhy] = useState('');
  return (
    <Modal title={`MVP of ${monthName(ym)}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!who) return;
          await setMonthMvp(ym, who, why.trim(), me.id);
          if (can('awardTrophies'))
            await awardTrophy(who, me, { design: 'crown', tier: 4, title: `MVP of ${monthName(ym, true)}`, note: why.trim().slice(0, 120) }).catch(() => {});
          onClose();
        }}
      >
        <Field label="Who">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Pick someone…</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why" hint="Shows on the Hall of Fame and the trophy.">
          <input className="input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={140} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Name the MVP</button>
        </div>
      </form>
    </Modal>
  );
}

function LegendForm({ onClose }: { onClose: () => void }) {
  const { roster, me } = useHub();
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  return (
    <Modal title="New legend plaque" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = who ? (roster.find((r) => r.id === who)?.name ?? '') : name.trim();
          if (!n || !title.trim()) return;
          await addLegend({ memberId: who || null, name: n, title: title.trim().slice(0, 60), text: text.trim().slice(0, 400), by: me.id });
          onClose();
        }}
      >
        <Field label="Who">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Someone not on the roster…</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        {!who && (
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
        )}
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. The Night the Docks Burned" />
        </Field>
        <Field label="The legend">
          <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Hang the plaque</button>
        </div>
      </form>
    </Modal>
  );
}

const PAST_ICON = { deceased: Feather, retired: Landmark, moved: Luggage, exiled: Skull } as const;
const PAST_WORD = { deceased: 'Rest in peace', retired: 'Retired', moved: 'Moved on', exiled: 'Exiled' } as const;

function PastPlaque({ m, past }: { m: Member; past: Past }) {
  const { me, can } = useHub();
  const t = useDoc<Tribute>(`tributes/${m.id}`);
  const memQ = useMemo(() => query(collection(db, 'tributes', m.id, 'memories')), [m.id]);
  const memories = (useCollection<Memory>(memQ) ?? []).sort((a, b) => (a.at?.toMillis() ?? Date.now()) - (b.at?.toMillis() ?? Date.now()));
  const [text, setText] = useState('');
  const kind = past.kind;
  const Icon = PAST_ICON[kind];
  const lit = !!t?.candles?.[me.id];
  const candles = Object.keys(t?.candles ?? {}).length;
  const years = m.joinedAt && past.day ? Math.max(0, (new Date(past.day).getTime() - m.joinedAt.toMillis()) / (365.25 * 86400e3)) : 0;
  return (
    <div className={`memoriam relative p-4 ${kind === 'deceased' ? 'is-deceased' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="memoriam-portrait shrink-0 rounded-full">
          <Avatar member={m} size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label flex items-center gap-1 text-gold-500/80">
            <Icon className="size-3" /> {PAST_WORD[kind]}
          </p>
          <Link to={`/members/${m.id}`} className="block truncate font-display text-lg text-gold-100 hover:underline" title="Their character sheet">
            {m.name}
          </Link>
          <p className="text-xs text-smoke">
            {m.joinedAt ? new Date(m.joinedAt.toMillis()).getFullYear() : '?'} – {past.day?.slice(0, 4) ?? '?'}
            {years >= 0.1 && ` · ${years < 1 ? `${Math.round(years * 12)} months` : `${years.toFixed(1)} years`} in the family`}
          </p>
        </div>
        <button
          onClick={() => lightCandle(m.id, me.id, !lit)}
          className={`flex flex-col items-center text-[10px] ${lit ? 'text-gold-200' : 'text-smoke hover:text-gold-300'}`}
          title={lit ? 'You paid your respects' : 'Pay respects'}
        >
          <span className={`candle ${lit ? 'lit' : ''}`} />
          {candles}
        </button>
      </div>
      {past.epitaph && <p className="mt-3 text-center font-display text-sm text-gold-200/90 italic">“{past.epitaph}”</p>}
      {memories.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line-soft pt-2">
          {memories.slice(-4).map((x) => (
            <li key={x.id} className="flex gap-1 text-xs text-ash">
              <span className="flex-1">
                “{x.text}” <span className="text-smoke">— {x.byName}</span>
              </span>
              {(x.by === me.id || can('manageMembers') || can('hallOfFame')) && (
                <button onClick={() => removeMemory(m.id, x.id)} aria-label="Remove">
                  <X className="size-3 text-smoke" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) addMemory(m.id, me, text.trim()).then(() => setText(''));
        }}
      >
        <input className="input py-1 text-xs" placeholder="Leave a memory…" maxLength={140} value={text} onChange={(e) => setText(e.target.value)} />
      </form>
    </div>
  );
}

export default function HallOfFame() {
  const { me, members, memberById, can } = useHub();
  const hall = useHall();
  const now = monthKey();
  const last = prevMonth(now);
  const countdown = useCountdown();
  const mvpNow = useDoc<MonthMvp>(`monthMvp/${now}`);
  const mvpList = useCollection<MonthMvp>('monthMvp') ?? [];
  const mvpBy = new Map(mvpList.map((x) => [x.id, x]));
  const legends = (useCollection<Legend>('legends') ?? []).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const [board, setBoard] = useState<HallBoardId>('sales');
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [legendForm, setLegendForm] = useState(false);
  const lead = can('manageMembers') || can('hallOfFame');
  const past = usePastMembers(lead);

  // Top 3 for several months running (counting back from the last finished month).
  const flames = useMemo(() => {
    const out = new Map<HallBoardId, Map<string, number>>();
    HALL_BOARDS.forEach((b) => {
      const f = new Map<string, number>();
      const counted = new Set<string>();
      let ym = now;
      for (let i = 0; i < 24; i++) {
        const top = new Set(hall.at(b.id, ym).slice(0, 3).map((r) => r.memberId));
        if (i === 0) top.forEach((id) => f.set(id, 1));
        else {
          f.forEach((n, id) => {
            if (counted.has(id)) return;
            if (top.has(id)) f.set(id, n + 1);
            else counted.add(id);
          });
        }
        ym = prevMonth(ym);
      }
      out.set(b.id, f);
    });
    return out;
  }, [hall, now]);

  if (!hall.ready) return null;
  const amFirst = HALL_BOARDS.some((b) => hall.at(b.id, now)[0]?.memberId === me.id);
  const pastMembers = members.filter((m) => past.has(m.id) && past.get(m.id)!.kind !== 'exiled');
  const exiled = members.filter((m) => past.get(m.id)?.kind === 'exiled');
  const total = (b: HallBoardId) => hall.at(b, now).reduce((t, r) => t + r.value, 0);
  const finished = hall.months.filter((m) => m < now);
  const best = (b: HallBoardId) =>
    hall.months
      .map((ym) => ({ ...hall.at(b, ym)[0], ym }))
      .filter((r) => r.memberId)
      .sort((a, c) => c.value! - a.value!)[0];
  const wins = (b: HallBoardId) => {
    const w: Record<string, number> = {};
    finished.forEach((ym) => {
      const top = hall.at(b, ym)[0];
      if (top) w[top.memberId] = (w[top.memberId] ?? 0) + 1;
    });
    return Object.entries(w).sort((a, c) => c[1] - a[1]);
  };
  const pastMark = (id: string) => {
    const p = past.get(id);
    if (!p || p.kind === 'exiled') return null;
    const I = PAST_ICON[p.kind];
    return <I className="ml-1 inline size-3 text-smoke" />;
  };

  return (
    <div className="hall">
      {amFirst && <Confetti />}
      <PageHeader
        icon={TrophyIcon}
        kicker="HQ"
        title="Hall of Fame"
        sub="This month's boards, the champions of every month before it, the legends, and the ones who came before us."
        actions={
          <span className="flex items-center gap-2 border border-line px-3 py-2 font-mono text-sm text-gold-200">
            <Hourglass className="size-4 text-gold-400" /> Resets in {countdown}
          </span>
        }
      />

      {/* Family totals this month */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {HALL_BOARDS.map((b) => (
          <Stat key={b.id} label={`${b.name} · ${monthName(now, true)}`} value={b.unit(total(b.id))} sub="family total" />
        ))}
      </div>

      {/* Reigning champions */}
      <section className="hud mb-6 overflow-hidden p-4">
        <p className="label mb-3 flex items-center gap-1.5 text-gold-400">
          <Crown className="size-3.5" /> Reigning champions · {monthName(last)}
        </p>
        <div className="flex flex-wrap gap-4">
          {HALL_BOARDS.map((b) => {
            const top = hall.at(b.id, last)[0];
            return (
              <div key={b.id} className="flex min-w-48 flex-1 items-center gap-3">
                <Trophy design={b.design} tier={3} size={42} />
                <div className="min-w-0">
                  <p className="label">{b.title}</p>
                  {top ? (
                    <p className="truncate text-gold-100">
                      <MemberName id={top.memberId} />
                      {pastMark(top.memberId)} <span className="font-mono text-xs text-gold-300">{b.unit(top.value)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-smoke">—</p>
                  )}
                </div>
              </div>
            );
          })}
          {mvpBy.get(last) && (
            <div className="flex min-w-48 flex-1 items-center gap-3">
              <Trophy design="crown" tier={4} size={42} />
              <div className="min-w-0">
                <p className="label">MVP of the month</p>
                <p className="truncate text-gold-100">
                  <MemberName id={mvpBy.get(last)!.memberId} />
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* This month */}
      <h2 className="hall-title mb-3">{monthName(now)}</h2>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {HALL_BOARDS.map((b) => {
          const rows = hall.at(b.id, now);
          const mine = rows.find((r) => r.memberId === me.id);
          const ahead = mine && mine.place > 1 ? rows[mine.place - 2] : undefined;
          const neck = rows[0] && rows[1] && rows[1].value >= rows[0].value * 0.9;
          return (
            <Panel
              key={b.id}
              title={b.name}
              right={
                neck ? (
                  <span className="rival flex items-center gap-1 text-[10px] font-bold tracking-wider text-red-300 uppercase">
                    <Swords className="size-3" /> Neck and neck
                  </span>
                ) : undefined
              }
            >
              {rows.length ? (
                <>
                  <Podium rows={rows} board={b} flames={flames.get(b.id)} />
                  {rows.length > 3 && (
                    <ol className="mt-4 divide-y divide-line-soft border-t border-line-soft">
                      {rows.slice(3, 8).map((r) => (
                        <li key={r.memberId} className={`flex items-center gap-3 py-1.5 text-sm ${r.memberId === me.id ? 'text-gold-200' : ''}`}>
                          <span className="w-6 text-right font-mono text-smoke">{r.place}</span>
                          <MemberName id={r.memberId} className="flex-1" />
                          <span className="font-mono text-gold-200">{b.unit(r.value)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-3 text-xs text-smoke">
                    {mine ? (
                      <>
                        You’re <b className="text-gold-200">#{mine.place}</b>
                        {ahead ? (
                          <>
                            , {b.unit(ahead.value - mine.value)} behind <MemberName id={ahead.memberId} />.
                          </>
                        ) : (
                          '. Hold the crown.'
                        )}
                      </>
                    ) : (
                      'You’re not on this board yet this month.'
                    )}
                  </p>
                </>
              ) : (
                <Empty title="Nobody yet">The first one on the board takes the lead.</Empty>
              )}
            </Panel>
          );
        })}
      </div>

      {/* MVP of the month */}
      <section className="hud mvp-card relative mb-10 flex flex-wrap items-center gap-4 overflow-hidden p-5">
        <Trophy design="crown" tier={4} size={64} />
        <div className="min-w-0 flex-1">
          <p className="label text-gold-400">MVP of {monthName(now)}</p>
          {mvpNow ? (
            <>
              <p className="font-display text-2xl text-gold-100">
                <MemberName id={mvpNow.memberId} />
              </p>
              {mvpNow.why && <p className="text-sm text-ash italic">“{mvpNow.why}”</p>}
            </>
          ) : (
            <p className="text-sm text-smoke">Leadership names one MVP each month. They get the Onyx crown.</p>
          )}
        </div>
        {lead && (
          <button className="btn-gold btn-sm" onClick={() => setPicking(true)}>
            <Pencil className="size-3.5" /> {mvpNow ? 'Change' : 'Name the MVP'}
          </button>
        )}
      </section>

      {/* Legends */}
      <h2 className="hall-title mb-3">Legends</h2>
      <div className="mb-4 flex flex-wrap gap-1">
        {HALL_BOARDS.map((b) => (
          <button key={b.id} onClick={() => setBoard(b.id)} className={`chip px-3 py-1.5 text-xs ${board === b.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}>
            {b.name}
          </button>
        ))}
      </div>
      {(() => {
        const b = HALL_BOARDS.find((x) => x.id === board)!;
        const rows = hall.allTime(board);
        const bm = best(board);
        const w = wins(board);
        return (
          <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <Panel title={`${b.name} · all time top 10`}>
              {rows.length ? (
                <ol className="divide-y divide-line-soft">
                  {rows.slice(0, 10).map((r) => (
                    <li key={r.memberId} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-6 text-right font-mono text-smoke">{r.place}</span>
                      {r.place <= 3 ? <Medal className={`size-4 ${['text-gold-300', 'text-zinc-300', 'text-amber-600'][r.place - 1]}`} /> : <span className="size-4" />}
                      <span className="flex-1">
                        <MemberName id={r.memberId} />
                        {pastMark(r.memberId)}
                      </span>
                      <span className="font-mono text-gold-200">{b.unit(r.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="No history yet" />
              )}
            </Panel>
            <div className="space-y-3">
              <Stat label="Best single month" value={bm ? b.unit(bm.value!) : '—'} sub={bm ? <><MemberName id={bm.memberId!} /> · {monthName(bm.ym, true)}</> : 'No months yet'} />
              <Stat label="Most #1 finishes" value={w[0] ? `${w[0][1]}×` : '—'} sub={w[0] ? <MemberName id={w[0][0]} /> : 'Decided when a month ends'} />
              {w.length > 1 && (
                <p className="px-1 text-xs text-smoke">
                  Then{' '}
                  {w.slice(1, 4).map(([id, n], i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <MemberName id={id} /> {n}×
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <p className="label flex items-center gap-1.5 text-gold-400">
            <Scroll className="size-3.5" /> Hall of Legends
          </p>
          {lead && (
            <button className="btn-ghost btn-sm" onClick={() => setLegendForm(true)}>
              <Plus className="size-3.5" /> New plaque
            </button>
          )}
        </div>
        {legends.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {legends.map((l) => {
              const m = l.memberId ? memberById.get(l.memberId) : undefined;
              return (
                <div key={l.id} className="legend-plaque relative p-5 text-center">
                  {m && (
                    <div className="mb-2 flex justify-center">
                      <Avatar member={m} size="md" />
                    </div>
                  )}
                  <p className="font-display text-lg text-[#2a1f05]">{l.title}</p>
                  <p className="text-xs font-bold tracking-[0.25em] text-[#4a3a10] uppercase">{m?.name ?? l.name}</p>
                  {l.text && <p className="mt-2 text-sm text-[#3a2c0a]">{l.text}</p>}
                  {lead && (
                    <button className="absolute top-2 right-2 text-[#5c4513] hover:text-red-800" onClick={() => confirm('Take this plaque down?') && removeLegend(l.id)} aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-smoke">No plaques yet. {lead ? 'Hang the first one.' : 'Leadership hangs these for the stories worth keeping.'}</p>
        )}
      </div>

      {/* Wall of past champions */}
      <h2 className="hall-title mb-3">Champions of every month</h2>
      {finished.length ? (
        <div className="mb-10 space-y-3">
          {finished.map((ym) => (
            <button key={ym} onClick={() => setOpen(ym)} className="hud flex w-full flex-wrap items-center gap-4 p-3 text-left transition hover:bg-white/[0.02]">
              <span className="w-24 shrink-0 font-display text-lg text-gold-200">{monthName(ym, true)}</span>
              {HALL_BOARDS.map((b) => {
                const top = hall.at(b.id, ym)[0];
                return (
                  <span key={b.id} className="flex min-w-36 flex-1 items-center gap-2">
                    <span className="champ-frame">{top ? <Avatar member={memberById.get(top.memberId)} size="sm" /> : <span className="block size-8" />}</span>
                    <span className="min-w-0">
                      <span className="label block text-[9px]">{b.title}</span>
                      <span className="block truncate text-sm text-gold-100">{top ? memberById.get(top.memberId)?.name ?? '—' : '—'}</span>
                    </span>
                  </span>
                );
              })}
              {mvpBy.get(ym) && (
                <span className="flex items-center gap-1 text-xs text-gold-300">
                  <Crown className="size-3.5" /> MVP {memberById.get(mvpBy.get(ym)!.memberId)?.name}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-10 text-sm text-smoke">The first champions are crowned when this month ends.</p>
      )}

      {/* In Memoriam & Retired */}
      {(pastMembers.length > 0 || (lead && exiled.length > 0)) && (
        <section className="memoriam-hall relative mb-6 overflow-hidden p-6">
          <h2 className="mb-1 text-center font-display text-2xl text-gold-200/90">In Memoriam & Retired</h2>
          <p className="mb-6 text-center text-xs text-smoke">The ones who came before us. Light a candle, leave a memory.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pastMembers.map((m) => (
              <PastPlaque key={m.id} m={m} past={past.get(m.id)!} />
            ))}
          </div>
          {lead && exiled.length > 0 && (
            <div className="mt-8 border-t border-red-900/40 pt-4">
              <p className="label mb-2 flex items-center gap-1.5 text-red-400/80">
                <Skull className="size-3.5" /> Burned · only leadership sees this
              </p>
              <ul className="flex flex-wrap gap-3">
                {exiled.map((m) => (
                  <li key={m.id}>
                    <Link to={`/members/${m.id}`} className="flex items-center gap-2 border border-red-900/50 bg-red-950/20 px-2 py-1 text-sm text-red-200/80 grayscale hover:grayscale-0">
                      <Avatar member={m} size="xs" /> <s>{m.name}</s>
                      <span className="text-[10px] text-smoke">{past.get(m.id)?.day}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {open && (
        <Modal title={monthName(open)} onClose={() => setOpen(null)} wide>
          <div className="grid gap-6 sm:grid-cols-2">
            {HALL_BOARDS.map((b) => (
              <div key={b.id}>
                <p className="label mb-2 text-center">{b.name}</p>
                <Podium rows={hall.at(b.id, open)} board={b} compact />
                <ol className="mt-3 space-y-0.5 text-sm">
                  {hall
                    .at(b.id, open)
                    .slice(3, 10)
                    .map((r) => (
                      <li key={r.memberId} className="flex gap-2">
                        <span className="w-5 text-right font-mono text-smoke">{r.place}</span>
                        <MemberName id={r.memberId} className="flex-1" />
                        <span className="font-mono text-gold-200">{b.unit(r.value)}</span>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
          {mvpBy.get(open) && (
            <p className="mt-4 text-center text-sm text-gold-200">
              <Crown className="mr-1 inline size-4" /> MVP: {memberById.get(mvpBy.get(open)!.memberId)?.name}
              {mvpBy.get(open)!.why && <span className="text-smoke"> · “{mvpBy.get(open)!.why}”</span>}
            </p>
          )}
        </Modal>
      )}
      {picking && <MvpPicker ym={now} onClose={() => setPicking(false)} />}
      {legendForm && <LegendForm onClose={() => setLegendForm(false)} />}
    </div>
  );
}
