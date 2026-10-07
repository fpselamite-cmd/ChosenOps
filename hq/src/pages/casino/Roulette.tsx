import { useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, rand, settle, stake } from '../../lib/casino';
import { sfx } from '../../lib/sound';
import { Felt, Result, useChips } from './common';

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

/** The wheel: pockets around a disc that spins to land the result under the marker. */
export function Wheel({ angle, spinning }: { angle: number; spinning: boolean }) {
  const step = 360 / WHEEL.length;
  return (
    <div className="roulette">
      <span className="roulette-marker" />
      <svg viewBox="-110 -110 220 220" className="roulette-disc" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 5s cubic-bezier(.12,.6,.1,1)' : 'none' }}>
        <circle r="108" fill="#3a2a14" stroke="#d4af37" strokeWidth="3" />
        {WHEEL.map((n, i) => {
          const a0 = ((i * step - step / 2 - 90) * Math.PI) / 180;
          const a1 = ((i * step + step / 2 - 90) * Math.PI) / 180;
          const r = 100;
          const ri = 62;
          const path = `M ${ri * Math.cos(a0)} ${ri * Math.sin(a0)} L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} L ${ri * Math.cos(a1)} ${ri * Math.sin(a1)} A ${ri} ${ri} 0 0 0 ${ri * Math.cos(a0)} ${ri * Math.sin(a0)} Z`;
          const am = ((i * step - 90) * Math.PI) / 180;
          return (
            <g key={n}>
              <path d={path} fill={n === 0 ? '#15803d' : REDS.has(n) ? '#b91c1c' : '#111'} stroke="#d4af37" strokeWidth="0.6" />
              <text x={88 * Math.cos(am)} y={88 * Math.sin(am)} fill="#fff" fontSize="8" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * step} ${88 * Math.cos(am)} ${88 * Math.sin(am)})`}>
                {n}
              </text>
            </g>
          );
        })}
        <circle r="60" fill="url(#rg)" stroke="#d4af37" strokeWidth="2" />
        <defs>
          <radialGradient id="rg">
            <stop offset="0" stopColor="#5c4128" />
            <stop offset="1" stopColor="#1a120a" />
          </radialGradient>
        </defs>
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x="-2" y="-52" width="4" height="104" fill="#d4af37" transform={`rotate(${a})`} rx="2" />
        ))}
        <circle r="10" fill="#f8e7a8" stroke="#94741f" strokeWidth="2" />
      </svg>
    </div>
  );
}

/** The betting board: click a spot to add the chosen chip there. */
export function Board({ bets, place, last }: { bets: Record<string, number>; place: (k: string) => void; last?: number | null }) {
  const cell = (k: string, label: React.ReactNode, cls = '') => (
    <button type="button" className={`rb-cell ${cls} ${last != null && k === `n:${last}` ? 'hit' : ''}`} onClick={() => place(k)}>
      {label}
      {bets[k] ? <span className="rb-chip">{bets[k]! >= 1000 ? `${Math.round(bets[k]! / 100) / 10}K` : bets[k]}</span> : null}
    </button>
  );
  return (
    <div className="rb">
      <div className="rb-zero">{cell('n:0', '0', 'green')}</div>
      <div className="rb-nums">
        {[3, 2, 1].map((row) =>
          Array.from({ length: 12 }, (_, col) => {
            const n = col * 3 + row;
            return <span key={n}>{cell(`n:${n}`, n, REDS.has(n) ? 'red' : 'black')}</span>;
          }),
        )}
      </div>
      <div className="rb-cols">
        {['c3', 'c2', 'c1'].map((k) => (
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

/** Single-zero roulette against the house. */
export default function Roulette() {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  const total = Object.values(bets).reduce((t, v) => t + v, 0);
  const place = (k: string) => {
    if (spinning || total + chip > Math.min(max, balance)) return;
    sfx.chip();
    setBets({ ...bets, [k]: (bets[k] ?? 0) + chip });
  };
  async function spin() {
    if (spinning || total < min || total > balance) return;
    await stake(me.id, total);
    const n = WHEEL[rand(WHEEL.length)]!;
    const i = WHEEL.indexOf(n);
    const step = 360 / WHEEL.length;
    // Several full turns, ending with pocket i under the marker at the top.
    const target = angle - (angle % 360) + 360 * 6 + (360 - i * step);
    setSpinning(true);
    setMsg({ text: '', tone: '' });
    setAngle(target);
    const ticks = setInterval(sfx.tick, 120);
    setTimeout(() => clearInterval(ticks), 4200);
    setTimeout(async () => {
      const paid = Object.entries(bets).reduce((t, [k, a]) => t + payout(k, a, n), 0);
      setLast(n);
      setHistory((h) => [n, ...h].slice(0, 12));
      setSpinning(false);
      const net = paid - total;
      setMsg({ text: `${n} ${colorOf(n)}. ${net > 0 ? `+${chipsFmt(net)}` : net === 0 ? 'Even.' : `−${chipsFmt(-net)}`}`, tone: net > 0 ? 'win' : net === 0 ? 'push' : 'lose' });
      if (net > 0) sfx.win();
      else if (net < 0) sfx.lose();
      await settle(me.id, total, paid);
    }, 5100);
  }
  return (
    <Felt className="space-y-5">
      <div className="grid items-center gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Wheel angle={angle} spinning={spinning} />
          <div className="flex flex-wrap justify-center gap-1">
            {history.map((n, i) => (
              <span key={i} className={`rb-hist ${colorOf(n)}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Board bets={bets} place={place} last={last} />
          <Result {...msg} />
          <div className="flex flex-wrap items-center gap-2">
            {[10, 25, 50, 100, 250].map((v) => (
              <button key={v} className={`casino-chip v${v} ${chip === v ? 'picked' : ''}`} onClick={() => setChip(v)}>
                {v}
              </button>
            ))}
            <span className="font-hud text-lg text-gold-100">
              On the table <b>{chipsFmt(total)}</b>
            </span>
            <span className="text-xs text-smoke">(max {chipsFmt(max)})</span>
            <button className="btn-ghost btn-sm ml-auto" onClick={() => setBets({})} disabled={spinning || !total}>
              Clear
            </button>
            <button className="btn-gold" onClick={spin} disabled={spinning || total < min || total > balance}>
              {spinning ? 'No more bets…' : 'Spin'}
            </button>
          </div>
        </div>
      </div>
    </Felt>
  );
}
