import { Crown, Medal, Trophy as TrophyIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { PageHeader, Panel, Stat } from '../components/Page';
import { Trophy } from '../components/Trophy';
import { useHub } from '../hooks/useHub';
import { BOARDS, monthKey, monthName, ranked, useBoards, type BoardDoc, type BoardId } from '../lib/boards';
import type { Tier } from '../lib/trophies';

type Row = ReturnType<typeof ranked>[number];

/** Gold, silver and bronze steps for the top 3. */
export function Podium({ rows, board, compact = false }: { rows: Row[]; board: (typeof BOARDS)[number]; compact?: boolean }) {
  const { memberById } = useHub();
  const order = [rows[1], rows[0], rows[2]];
  const heights = compact ? ['h-14', 'h-20', 'h-10'] : ['h-20', 'h-28', 'h-14'];
  const metal = ['podium-silver', 'podium-gold', 'podium-bronze'];
  return (
    <div className="podium relative flex items-end justify-center gap-2 pt-4 sm:gap-3">
      {rows[0] && <div className="podium-rays pointer-events-none absolute top-0 left-1/2 -translate-x-1/2" aria-hidden />}
      {order.map((r, i) => {
        const place = [2, 1, 3][i]!;
        return (
          <div key={place} className="relative flex w-1/3 max-w-40 flex-col items-center text-center">
            {r ? (
              <>
                {place === 1 && <Crown className="podium-crown mb-1 size-6 text-gold-300" />}
                <span className={`podium-ring ${metal[i]}`}>
                  <Avatar member={memberById.get(r.memberId)} size={compact ? 'md' : 'lg'} />
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

function BoardPanel({ doc, board, live }: { doc?: BoardDoc; board: (typeof BOARDS)[number]; live: boolean }) {
  const rows = ranked(doc, board.id);
  const total = rows.reduce((t, r) => t + r.value, 0);
  return (
    <Panel title={board.name} right={<span className="font-mono text-xs text-smoke">{board.unit(total)} total</span>}>
      {rows.length ? (
        <>
          <Podium rows={rows} board={board} />
          {rows.length > 3 && (
            <ol className="mt-4 divide-y divide-line-soft border-t border-line-soft">
              {rows.slice(3).map((r) => (
                <li key={r.memberId} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="w-6 text-right font-mono text-smoke">{r.place}</span>
                  <MemberName id={r.memberId} className="flex-1" />
                  <span className="font-mono text-gold-200">{board.unit(r.value)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-smoke">{live ? 'Live. Resets on the 1st; the top 3 get a trophy when the month ends.' : 'Final standings. The top 3 got a trophy.'}</p>
        </>
      ) : (
        <Empty title="Nothing yet">{live ? 'The first one on the board this month takes the lead.' : 'Nobody on this board that month.'}</Empty>
      )}
    </Panel>
  );
}

export default function HallOfFame() {
  const { months, byId, allTime } = useBoards();
  const [params, setParams] = useSearchParams();
  const now = monthKey();
  const keys = [now, ...months.map((m) => m.id).filter((k) => k !== now)];
  const ym = keys.includes(params.get('m') ?? '') ? params.get('m')! : now;
  const past = months.filter((m) => m.id < now);

  // Records across every month.
  const best = (b: BoardId) =>
    months
      .flatMap((m) => ranked(m, b).slice(0, 1).map((r) => ({ ...r, month: m.id })))
      .sort((a, c) => c.value - a.value)[0];
  const wins = (b: BoardId) => {
    const w: Record<string, number> = {};
    past.forEach((m) => {
      const top = ranked(m, b)[0];
      if (top) w[top.memberId] = (w[top.memberId] ?? 0) + 1;
    });
    return Object.entries(w).sort((a, c) => c[1] - a[1])[0];
  };
  const gangTotal = (m: BoardDoc, b: BoardId) => Object.values(m[b] ?? {}).reduce((t, v) => t + Math.max(0, v), 0);
  const peak = Math.max(1, ...months.map((m) => gangTotal(m, 'sales')));
  const peakB = Math.max(1, ...months.map((m) => gangTotal(m, 'bricks')));

  return (
    <>
      <PageHeader icon={TrophyIcon} kicker="HQ" title="Hall of Fame" sub="Monthly leaderboards for sales and bricks. Boards reset on the 1st (Eastern time); every past month is kept here." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <button key={k} onClick={() => setParams({ m: k })} className={`chip px-3 py-1.5 text-xs ${k === ym ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}>
            {k === now ? 'This month' : monthName(k, true)}
          </button>
        ))}
      </div>

      <h2 className="mb-3 font-display text-xl text-gold-200">{monthName(ym)}</h2>
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {BOARDS.map((b) => (
          <BoardPanel key={b.id} doc={byId.get(ym)} board={b} live={ym === now} />
        ))}
      </div>

      <h2 className="mb-3 font-display text-xl text-gold-200">All time</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BOARDS.map((b) => {
          const r = best(b.id);
          return <Stat key={b.id} label={`Best month · ${b.name}`} value={r ? b.unit(r.value) : '—'} sub={r ? <><MemberName id={r.memberId} /> · {monthName(r.month, true)}</> : 'No months yet'} />;
        })}
        {BOARDS.map((b) => {
          const w = wins(b.id);
          return <Stat key={b.id + 'w'} label={`Most #1 finishes · ${b.name}`} value={w ? `${w[1]}×` : '—'} sub={w ? <MemberName id={w[0]} /> : 'Decided when a month ends'} />;
        })}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {BOARDS.map((b) => {
          const rows = allTime(b.id);
          return (
            <Panel key={b.id} title={`${b.name} · all time`}>
              {rows.length ? (
                <ol className="divide-y divide-line-soft">
                  {rows.slice(0, 10).map((r) => (
                    <li key={r.memberId} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-6 text-right font-mono text-smoke">{r.place}</span>
                      {r.place <= 3 ? <Medal className={`size-4 ${['text-gold-300', 'text-zinc-300', 'text-amber-600'][r.place - 1]}`} /> : <span className="size-4" />}
                      <MemberName id={r.memberId} className="flex-1" />
                      <span className="font-mono text-gold-200">{b.unit(r.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="No history yet" />
              )}
            </Panel>
          );
        })}
      </div>

      <Panel title="Month by month" pad={false}>
        {months.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label border-b border-line-soft text-left">
                  <th className="px-4 py-2">Month</th>
                  <th className="px-2 py-2">Top seller</th>
                  <th className="px-2 py-2">Family sales</th>
                  <th className="px-2 py-2">Top presser</th>
                  <th className="px-4 py-2">Family bricks</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const s = ranked(m, 'sales')[0];
                  const k = ranked(m, 'bricks')[0];
                  return (
                    <tr key={m.id} className="border-b border-line-soft last:border-0 hover:bg-raised/40">
                      <td className="px-4 py-2">
                        <button className="font-semibold text-gold-100 hover:underline" onClick={() => setParams({ m: m.id })}>
                          {monthName(m.id, true)}
                        </button>
                        {m.id === now && <span className="ml-2 text-[10px] tracking-widest text-ok uppercase">live</span>}
                      </td>
                      <td className="px-2 py-2">
                        {s ? (
                          <span className="inline-flex items-center gap-1.5">
                            {m.id < now && <Trophy design="moneybag" tier={3 as Tier} size={18} />}
                            <MemberName id={s.memberId} />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded bg-raised">
                            <div className="h-full bg-gold-400" style={{ width: `${(gangTotal(m, 'sales') / peak) * 100}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gold-200">{BOARDS[0].unit(gangTotal(m, 'sales'))}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {k ? (
                          <span className="inline-flex items-center gap-1.5">
                            {m.id < now && <Trophy design="brick" tier={3 as Tier} size={18} />}
                            <MemberName id={k.memberId} />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded bg-raised">
                            <div className="h-full bg-emerald-500" style={{ width: `${(gangTotal(m, 'bricks') / peakB) * 100}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gold-200">{gangTotal(m, 'bricks')}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <Empty title="No months yet">Sales and pressed bricks start counting from today.</Empty>
          </div>
        )}
      </Panel>
    </>
  );
}
