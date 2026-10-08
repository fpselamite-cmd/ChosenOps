import { RotateCcw, Undo2 } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, rand, settle, stake } from '../../lib/casino';
import { pace, sfx } from '../../lib/sound';
import { BetBar, Felt, fly, payOut, rake, Result, Stack, useChips, wait } from './common';
import type { Wheel3D } from './wheel3d';

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n: number) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

/** What a bet pays (stake included) if `n` comes up, or 0. */
export function payout(key: string, amt: number, n: number) {
  if (key.startsWith('n:')) return Number(key.slice(2)) === n ? amt * 36 : 0;
  if (n === 0) return 0;
  const win =
    (key === 'red' && REDS.has(n)) ||
    (key === 'black' && !REDS.has(n)) ||
    (key === 'odd' && n % 2 === 1) ||
    (key === 'even' && n % 2 === 0) ||
    (key === 'low' && n <= 18) ||
    (key === 'high' && n >= 19);
  if (win) return amt * 2;
  if (key[0] === 'd' && Math.ceil(n / 12) === Number(key[1])) return amt * 3;
  if (key[0] === 'c' && ((n - 1) % 3) + 1 === Number(key[1])) return amt * 3;
  return 0;
}
export const BET_LABEL: Record<string, string> = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', d1: '1st 12', d2: '2nd 12', d3: '3rd 12', c1: '2 to 1', c2: '2 to 1', c3: '2 to 1' };

export function useNarrow(px = 640) {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setN(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return n;
}

export interface WheelHandle {
  /** Brings the wheel up close, spins it to `n`, shows the number, and puts it back. */
  spin: (n: number) => Promise<void>;
}
/**
 * The 3D wheel. It sits beside the board on bigger screens; on a spin it comes up close (on phones it only
 * appears for the spin).
 */
export const WheelStage = forwardRef<WheelHandle, { children?: ReactNode }>(function WheelStage({ children }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wheel = useRef<Wheel3D | null>(null);
  const [close, setClose] = useState<'' | 'in' | 'leaving'>('');
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    let gone = false;
    import('./wheel3d')
      .then((m) => {
        if (!gone && canvas.current) wheel.current = m.mountWheel(canvas.current);
      })
      .catch(() => {});
    return () => {
      gone = true;
      wheel.current?.dispose();
    };
  }, []);
  useImperativeHandle(ref, () => ({
    async spin(n) {
      setShown(null);
      setClose('in');
      await wait(250);
      const ms = pace(5200);
      // The ball's clatter, slowing down.
      let t = 0;
      const ticks: ReturnType<typeof setTimeout>[] = [];
      for (let d = 60; t < ms * 0.85; d *= 1.045) ticks.push(setTimeout(sfx.ball, (t += d)));
      await (wheel.current?.spin(n, ms) ?? wait(5200));
      ticks.forEach(clearTimeout);
      sfx.chip();
      setShown(n);
      await wait(1300);
      setClose('leaving');
      await wait(350);
      setClose('');
    },
  }));
  return (
    <div className={close ? `wheel-closeup ${close === 'leaving' ? 'leaving' : ''}` : 'wheel-side flex flex-col items-center gap-3'}>
      <div className="wheel-stage">
        <canvas ref={canvas} aria-label="Roulette wheel" />
      </div>
      {close && shown !== null && <span className={`wc-num ${colorOf(shown)}`}>{shown}</span>}
      {!close && children}
    </div>
  );
});

/** The betting board: tap a spot to put the picked chip there. Upright on phones. */
export function Board({ bets, place, last, upright }: { bets: Record<string, number>; place: (k: string, el: HTMLElement) => void; last?: number | null; upright?: boolean }) {
  const cell = (k: string, labelNode: ReactNode, cls = '') => (
    <button type="button" className={`rb-cell ${cls} ${last != null && k === `n:${last}` ? 'hit' : ''} ${last != null && k !== `n:${last}` && !k.startsWith('n:') && payout(k, 1, last) ? 'hit' : ''}`} data-spot={k} onClick={(e) => place(k, e.currentTarget)}>
      {labelNode}
      {bets[k] ? (
        <span className="rb-chip">
          <Stack amount={bets[k]!} size={upright ? 24 : 26} />
        </span>
      ) : null}
    </button>
  );
  const rows = upright ? Array.from({ length: 12 }, (_, r) => [r * 3 + 1, r * 3 + 2, r * 3 + 3]).flat() : [3, 2, 1].flatMap((row) => Array.from({ length: 12 }, (_, col) => col * 3 + row));
  return (
    <div className={`rb ${upright ? 'upright' : ''}`}>
      <div className="rb-zero">{cell('n:0', '0', 'green')}</div>
      <div className="rb-nums">
        {rows.map((n) => (
          <span key={n}>{cell(`n:${n}`, n, REDS.has(n) ? 'red' : 'black')}</span>
        ))}
      </div>
      <div className="rb-cols">
        {(upright ? ['c1', 'c2', 'c3'] : ['c3', 'c2', 'c1']).map((k) => (
          <span key={k}>{cell(k, '2:1')}</span>
        ))}
      </div>
      <div className="rb-dozens">
        {['d1', 'd2', 'd3'].map((k) => (
          <span key={k}>{cell(k, BET_LABEL[k])}</span>
        ))}
      </div>
      <div className="rb-outside">
        {['low', 'even', 'red', 'black', 'odd', 'high'].map((k) => (
          <span key={k}>{cell(k, k === 'red' ? <i className="rb-diamond red" /> : k === 'black' ? <i className="rb-diamond" /> : BET_LABEL[k], k === 'red' ? 'red' : k === 'black' ? 'black' : '')}</span>
        ))}
      </div>
    </div>
  );
}

export const spotEl = (k: string) => document.querySelector(`[data-spot="${k}"]`);
/** After the spin: winners' chips slide back to the rack, the rest get raked. */
export async function settleSpots(bets: Record<string, number>, n: number) {
  let i = 0;
  for (const [k, a] of Object.entries(bets)) {
    const p = payout(k, a, n);
    if (p) void payOut(spotEl(k), p, i * pace(120));
    else void rake(spotEl(k), a, i * pace(80));
    i++;
  }
  await wait(900);
}

export function History({ list }: { list: number[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {list.map((n, i) => (
        <span key={i} className={`rb-hist ${colorOf(n)}`}>
          {n}
        </span>
      ))}
    </div>
  );
}

/** Single-zero roulette against the house. */
export default function Roulette() {
  const { me } = useHub();
  const { balance, min, max, bonus } = useChips();
  const upright = useNarrow();
  const wheel = useRef<WheelHandle>(null);
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState<{ k: string; v: number }[]>([]);
  const [lastBets, setLastBets] = useState<Record<string, number> | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  const total = Object.values(bets).reduce((t, v) => t + v, 0);
  const cap = Math.min(max, balance);
  const place = (k: string, el: HTMLElement) => {
    if (spinning || total + chip > cap) return;
    setLast(null);
    void fly(document.querySelector('.bb-chip.picked'), el, chip);
    setBets((b) => ({ ...b, [k]: (b[k] ?? 0) + chip }));
    setPlaced((p) => [...p, { k, v: chip }]);
  };
  const undo = () => {
    const p = placed[placed.length - 1];
    if (!p) return;
    void fly(spotEl(p.k), document.querySelector('[data-rack]'), p.v);
    setPlaced(placed.slice(0, -1));
    setBets((b) => {
      const n = { ...b, [p.k]: (b[p.k] ?? 0) - p.v };
      if (n[p.k]! <= 0) delete n[p.k];
      return n;
    });
  };
  const clear = () => {
    Object.entries(bets).forEach(([k, a], i) => void fly(spotEl(k), document.querySelector('[data-rack]'), a, { delay: i * 40 }));
    setBets({});
    setPlaced([]);
  };
  const rebet = () => {
    if (!lastBets) return;
    const sum = Object.values(lastBets).reduce((t, v) => t + v, 0);
    if (sum > cap) return;
    setLast(null);
    Object.entries(lastBets).forEach(([k, a], i) => void fly(document.querySelector('[data-rack]'), spotEl(k), a, { delay: i * 60 }));
    setBets(lastBets);
    setPlaced(Object.entries(lastBets).map(([k, v]) => ({ k, v })));
  };
  async function spin() {
    if (spinning || total < min || total > balance) return;
    setSpinning(true);
    setMsg({ text: '', tone: '' });
    await stake(me.id, total);
    const n = WHEEL[rand(WHEEL.length)]!;
    const round = bets;
    await wheel.current?.spin(n);
    const paid = Object.entries(round).reduce((t, [k, a]) => t + payout(k, a, n), 0);
    setLast(n);
    setHistory((h) => [n, ...h].slice(0, 14));
    const net = paid - total;
    setMsg({ text: `${n} ${colorOf(n)} · ${net > 0 ? `+${chipsFmt(net)}` : net === 0 ? 'even' : `−${chipsFmt(-net)}`}`, tone: net > 0 ? 'win' : net === 0 ? 'push' : 'lose' });
    if (net > 0) sfx.win();
    else if (net < 0) sfx.lose();
    await settleSpots(round, n);
    setLastBets(round);
    setBets({});
    setPlaced([]);
    setSpinning(false);
    await settle(me.id, total, paid, { bonus, game: 'roulette', name: me.name, note: `${n} ${colorOf(n)}` });
  }
  return (
    <div>
      <Felt>
        <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
          <WheelStage ref={wheel}>
            <History list={history} />
          </WheelStage>
          <div className="space-y-3">
            {upright && history.length > 0 && <History list={history.slice(0, 10)} />}
            <Board bets={bets} place={place} last={last} upright={upright} />
            <Result {...msg} />
          </div>
        </div>
      </Felt>
      <BetBar bet={total} min={min} max={max} balance={balance} mode="pick" picked={chip} onPick={setChip} locked={spinning} betLabel="On the table" onClear={clear}>
        {lastBets && !total && !spinning && (
          <button className="btn-ghost btn-sm" onClick={rebet} title="Same bets again">
            <RotateCcw className="size-4" /> Rebet
          </button>
        )}
        {placed.length > 0 && !spinning && (
          <button className="btn-ghost btn-sm px-3" onClick={undo} aria-label="Undo last chip">
            <Undo2 className="size-4" />
          </button>
        )}
        <button className="btn-gold" onClick={spin} disabled={spinning || total < min || total > balance}>
          {spinning ? 'No more bets…' : 'Spin'}
        </button>
      </BetBar>
    </div>
  );
}
