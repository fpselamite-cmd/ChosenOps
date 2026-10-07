import { useEffect, useState } from 'react';
import { useHub } from '../../../hooks/useHub';
import { chipsFmt, rand, stake } from '../../../lib/casino';
import { sfx } from '../../../lib/sound';
import { placeBets, setRound, type LiveTable } from '../../../lib/tables';
import { Felt, Result, useChips } from '../common';
import { Board, colorOf, payout, Wheel, WHEEL } from '../Roulette';
import { now, useHostLoop, useSettle } from './useLive';

export interface RouletteRound {
  n: number;
  phase: 'idle' | 'bets' | 'spin' | 'paid';
  closesAt?: number;
  spinAt?: number;
  paidAt?: number;
  result?: number;
  history?: number[];
}

/** The dealer's side: open betting, spin when it closes, pay, repeat. */
function step(t: LiveTable<RouletteRound>) {
  const r = t.round;
  const time = now();
  if (r.phase === 'idle' || (r.phase === 'paid' && time > (r.paidAt ?? 0) + 6000)) return setRound(t.id, { ...r, n: r.n + 1, phase: 'bets', closesAt: time + 20_000, result: null });
  if (r.phase === 'bets' && time > (r.closesAt ?? 0)) {
    const anyone = Object.values(t.bets).some((b) => b.n === r.n && b.total > 0);
    if (!anyone) return setRound(t.id, { ...r, closesAt: time + 20_000 });
    const result = WHEEL[rand(WHEEL.length)]!;
    return setRound(t.id, { ...r, phase: 'spin', spinAt: time, result, history: [result, ...(r.history ?? [])].slice(0, 12) });
  }
  if (r.phase === 'spin' && time > (r.spinAt ?? 0) + 5500) return setRound(t.id, { ...r, phase: 'paid', paidAt: time });
}

export default function LiveRoulette({ t, isHost }: { t: LiveTable<RouletteRound>; isHost: boolean }) {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  useHostLoop(t, isHost, step);
  const r = t.round;
  const mine = t.bets[me.id]?.n === r.n ? t.bets[me.id] : undefined;
  const [chip, setChip] = useState(25);
  const [spots, setSpots] = useState<Record<string, number>>({});
  const [angle, setAngle] = useState(0);
  const [tick, setTick] = useState(0);
  const total = Object.values(spots).reduce((s, v) => s + v, 0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);
  useEffect(() => setSpots({}), [r.n]);
  // Spin the wheel to the result when the dealer spins.
  useEffect(() => {
    if (r.phase !== 'spin' || r.result == null) return;
    const step = 360 / WHEEL.length;
    const i = WHEEL.indexOf(r.result);
    setAngle((a) => a - (a % 360) + 360 * 6 + (360 - i * step));
    const ticks = setInterval(sfx.tick, 120);
    const stop = setTimeout(() => clearInterval(ticks), 4200);
    return () => (clearInterval(ticks), clearTimeout(stop));
  }, [r.phase, r.result]);
  useSettle(
    t,
    (x) => (x.bets[me.id]?.n === x.round.n ? x.bets[me.id]!.total : null),
    (x) => Object.entries(x.bets[me.id]?.spots ?? {}).reduce((s, [k, a]) => s + payout(k, a, x.round.result ?? -1), 0),
  );
  const myPaid = mine && r.phase === 'paid' ? Object.entries(mine.spots ?? {}).reduce((s, [k, a]) => s + payout(k, a, r.result ?? -1), 0) : 0;
  const left = Math.max(0, Math.ceil(((r.closesAt ?? 0) - now()) / 1000));
  void tick;
  return (
    <Felt className="space-y-5">
      <div className="grid items-center gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Wheel angle={angle} spinning={r.phase === 'spin'} />
          <div className="flex flex-wrap justify-center gap-1">
            {(r.history ?? []).map((n, i) => (
              <span key={i} className={`rb-hist ${colorOf(n)}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="felt-label text-center">{r.phase === 'bets' ? `Place your bets · ${left}s` : r.phase === 'spin' ? 'No more bets' : r.phase === 'paid' ? `${r.result} ${colorOf(r.result ?? 0)}` : 'Opening the table…'}</p>
          <Board bets={mine?.spots ?? spots} place={(k) => r.phase === 'bets' && !mine && total + chip <= Math.min(max, balance) && (sfx.chip(), setSpots({ ...spots, [k]: (spots[k] ?? 0) + chip }))} last={r.phase === 'paid' ? r.result : null} />
          {r.phase === 'paid' && mine && <Result text={myPaid > mine.total ? `You win +${chipsFmt(myPaid - mine.total)}` : myPaid === mine.total ? 'Even.' : `−${chipsFmt(mine.total - myPaid)}`} tone={myPaid > mine.total ? 'win' : myPaid === mine.total ? 'push' : 'lose'} />}
          <div className="flex flex-wrap items-center gap-2">
            {[10, 25, 50, 100, 250].map((v) => (
              <button key={v} className={`casino-chip v${v} ${chip === v ? 'picked' : ''}`} onClick={() => setChip(v)} disabled={!!mine}>
                {v}
              </button>
            ))}
            <span className="font-hud text-lg text-gold-100">
              {mine ? `Your bets are in: ${chipsFmt(mine.total)}` : `On the table ${chipsFmt(total)}`}
            </span>
            {!mine && (
              <>
                <button className="btn-ghost btn-sm ml-auto" onClick={() => setSpots({})} disabled={!total}>
                  Clear
                </button>
                <button
                  className="btn-gold"
                  disabled={r.phase !== 'bets' || total < min || total > balance}
                  onClick={async () => {
                    await stake(me.id, total);
                    await placeBets(t, me.id, r.n, total, spots);
                    sfx.chip();
                  }}
                >
                  Place bets
                </button>
              </>
            )}
          </div>
          <BetsAtTable t={t} />
        </div>
      </div>
    </Felt>
  );
}

function BetsAtTable({ t }: { t: LiveTable<RouletteRound> }) {
  const rows = Object.entries(t.bets).filter(([, b]) => b.n === t.round.n);
  if (!rows.length) return null;
  return (
    <p className="text-xs text-gold-100/80">
      {rows.map(([id, b]) => `${t.seats[id]?.name ?? '?'} ${chipsFmt(b.total)}`).join(' · ')}
    </p>
  );
}
