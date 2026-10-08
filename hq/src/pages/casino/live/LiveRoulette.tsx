import { useEffect, useRef, useState } from 'react';
import { useHub } from '../../../hooks/useHub';
import { chipsFmt, rand, stake } from '../../../lib/casino';
import { sfx } from '../../../lib/sound';
import { placeBets, setRound, type LiveTable } from '../../../lib/tables';
import { BetBar, Felt, fly, Result, useChips } from '../common';
import { Board, colorOf, History, payout, settleSpots, spotEl, useNarrow, WHEEL, WheelStage, type WheelHandle } from '../Roulette';
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
  const [, setTick] = useState(0);
  const upright = useNarrow();
  const wheel = useRef<WheelHandle>(null);
  const total = Object.values(spots).reduce((s, v) => s + v, 0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);
  useEffect(() => setSpots({}), [r.n]);
  // Spin the wheel up close when the dealer spins; then my chips pay out or get raked.
  const spun = useRef(-1);
  useEffect(() => {
    if (r.phase !== 'spin' || r.result == null || spun.current === r.n) return;
    spun.current = r.n;
    void wheel.current?.spin(r.result);
  }, [r.phase, r.result, r.n]);
  const paidRound = useRef(-1);
  useEffect(() => {
    if (r.phase !== 'paid' || r.result == null || !mine || paidRound.current === r.n) return;
    paidRound.current = r.n;
    void settleSpots(mine.spots ?? {}, r.result);
  }, [r.phase, r.result, r.n, mine]);
  // Everyone else's chips fly in from their seat as they bet.
  const seen = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [id, b] of Object.entries(t.bets)) {
      if (id === me.id || b.n !== r.n) continue;
      const k = `${id}:${b.n}`;
      if (seen.current[k]) continue;
      seen.current[k] = 1;
      Object.entries(b.spots ?? {}).forEach(([spot, a], i) => void fly(document.querySelector(`[data-seat="${id}"]`), spotEl(spot), a, { delay: i * 80, size: 26 }));
    }
  }, [t.bets, r.n, me.id]);
  useSettle(
    t,
    (x) => (x.bets[me.id]?.n === x.round.n ? x.bets[me.id]!.total : null),
    (x) => Object.entries(x.bets[me.id]?.spots ?? {}).reduce((s, [k, a]) => s + payout(k, a, x.round.result ?? -1), 0),
  );
  const myPaid = mine && r.phase === 'paid' ? Object.entries(mine.spots ?? {}).reduce((s, [k, a]) => s + payout(k, a, r.result ?? -1), 0) : 0;
  const left = Math.max(0, Math.ceil(((r.closesAt ?? 0) - now()) / 1000));
  const cap = Math.min(max, balance);
  // Everyone's chips on the board: mine, plus what the others have placed.
  const onBoard: Record<string, number> = { ...(mine?.spots ?? spots) };
  for (const [id, b] of Object.entries(t.bets)) if (id !== me.id && b.n === r.n) for (const [k, a] of Object.entries(b.spots ?? {})) onBoard[k] = (onBoard[k] ?? 0) + a;
  return (
    <div>
      <Felt>
        <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
          <WheelStage ref={wheel}>
            <History list={r.history ?? []} />
          </WheelStage>
          <div className="space-y-3">
            <p className="felt-label text-center">{r.phase === 'bets' ? `Place your bets · ${left}s` : r.phase === 'spin' ? 'No more bets' : r.phase === 'paid' ? `${r.result} ${colorOf(r.result ?? 0)}` : 'Opening the table…'}</p>
            {upright && <History list={(r.history ?? []).slice(0, 10)} />}
            <Board
              bets={onBoard}
              upright={upright}
              place={(k, el) => {
                if (r.phase !== 'bets' || mine || total + chip > cap) return;
                void fly(document.querySelector('.bb-chip.picked'), el, chip);
                setSpots({ ...spots, [k]: (spots[k] ?? 0) + chip });
              }}
              last={r.phase === 'paid' ? r.result : null}
            />
            {r.phase === 'paid' && mine && <Result text={myPaid > mine.total ? `You win +${chipsFmt(myPaid - mine.total)}` : myPaid === mine.total ? 'Even.' : `−${chipsFmt(mine.total - myPaid)}`} tone={myPaid > mine.total ? 'win' : myPaid === mine.total ? 'push' : 'lose'} />}
            <BetsAtTable t={t} />
          </div>
        </div>
      </Felt>
      <BetBar bet={mine ? mine.total : total} min={min} max={max} balance={balance} mode="pick" picked={chip} onPick={setChip} locked={!!mine || r.phase !== 'bets'} betLabel={mine ? 'Your bets' : 'On the table'} onClear={() => setSpots({})}>
        {mine ? (
          <button className="btn-ghost" disabled>
            Bets are in
          </button>
        ) : (
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
        )}
      </BetBar>
    </div>
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
