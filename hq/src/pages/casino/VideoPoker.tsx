import { useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, deck, RANKS, settle, stake, type Card } from '../../lib/casino';
import { sfx } from '../../lib/sound';
import { BetPicker, Felt, PlayingCard, Result, useChips } from './common';

/** Five-card poker hands, best first, with their ranking value. */
export const HANDS = [
  { id: 'royal', label: 'Royal Flush', pays: 250 },
  { id: 'sflush', label: 'Straight Flush', pays: 50 },
  { id: 'quads', label: 'Four of a Kind', pays: 25 },
  { id: 'full', label: 'Full House', pays: 9 },
  { id: 'flush', label: 'Flush', pays: 6 },
  { id: 'straight', label: 'Straight', pays: 4 },
  { id: 'trips', label: 'Three of a Kind', pays: 3 },
  { id: 'twopair', label: 'Two Pair', pays: 2 },
  { id: 'jacks', label: 'Jacks or Better', pays: 1 },
] as const;

const val = (c: Card) => RANKS.indexOf(c.r) + 2;

/** Names a 5-card hand. Shared with live poker. Returns a ranking key (higher is better) too. */
export function judge(h: Card[]): { id: string; label: string; key: number[] } {
  const vs = h.map(val).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  vs.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = h.every((c) => c.s === h[0]!.s);
  const uniq = [...new Set(vs)];
  const wheel = uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5;
  const straight = uniq.length === 5 && (uniq[0]! - uniq[4]! === 4 || wheel);
  const high = wheel ? 5 : vs[0]!;
  const kick = groups.map((g) => g[0]);
  if (straight && flush) return high === 14 ? { id: 'royal', label: 'Royal Flush', key: [9, 14] } : { id: 'sflush', label: 'Straight Flush', key: [8, high] };
  if (groups[0]![1] === 4) return { id: 'quads', label: 'Four of a Kind', key: [7, ...kick] };
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return { id: 'full', label: 'Full House', key: [6, ...kick] };
  if (flush) return { id: 'flush', label: 'Flush', key: [5, ...vs] };
  if (straight) return { id: 'straight', label: 'Straight', key: [4, high] };
  if (groups[0]![1] === 3) return { id: 'trips', label: 'Three of a Kind', key: [3, ...kick] };
  if (groups[0]![1] === 2 && groups[1]![1] === 2) return { id: 'twopair', label: 'Two Pair', key: [2, ...kick] };
  if (groups[0]![1] === 2) return { id: groups[0]![0] >= 11 ? 'jacks' : 'pair', label: `Pair of ${RANKS[groups[0]![0] - 2]}s`, key: [1, ...kick] };
  return { id: 'high', label: `${RANKS[vs[0]! - 2]} high`, key: [0, ...vs] };
}
export const beats = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

/** Jacks or Better: deal five, hold what you like, draw once. */
export default function VideoPoker() {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  const [bet, setBet] = useState(min);
  const [hand, setHand] = useState<Card[]>([]);
  const [rest, setRest] = useState<Card[]>([]);
  const [held, setHeld] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<'bet' | 'hold' | 'done'>('bet');
  const [wager, setWager] = useState(0);
  const [round, setRound] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  async function deal() {
    if (bet < min || bet > balance) return;
    await stake(me.id, bet);
    const d = deck();
    setHand(d.slice(0, 5));
    setRest(d.slice(5));
    setHeld([false, false, false, false, false]);
    setWager(bet);
    setRound((r) => r + 1);
    setPhase('hold');
    setMsg({ text: '', tone: '' });
    [0, 1, 2, 3, 4].forEach((i) => setTimeout(sfx.card, i * 110));
  }
  async function draw() {
    let k = 0;
    const next = hand.map((c, i) => (held[i] ? c : rest[k++]!));
    setHand(next);
    setRound((r) => r + 1);
    setPhase('done');
    next.forEach((_, i) => !held[i] && setTimeout(sfx.card, i * 110));
    const j = judge(next);
    const row = HANDS.find((x) => x.id === j.id);
    const paid = row ? wager * row.pays : 0;
    setMsg(row ? { text: `${row.label} · ${row.pays}× · +${chipsFmt(paid - wager)}`, tone: row.pays > 1 ? 'win' : 'push' } : { text: j.label, tone: 'lose' });
    if (row && row.pays > 1) sfx.win();
    else if (!row) sfx.lose();
    await settle(me.id, wager, paid);
  }
  const now = hand.length ? judge(hand) : null;
  return (
    <Felt className="space-y-5">
      <table className="vp-pays mx-auto">
        <tbody>
          {HANDS.map((h) => (
            <tr key={h.id} className={phase === 'done' && now?.id === h.id ? 'hit' : ''}>
              <td>{h.label}</td>
              <td>{h.pays}×</td>
              <td className="text-smoke">{chipsFmt(h.pays * (phase === 'bet' ? bet : wager))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex min-h-36 justify-center gap-2">
        {hand.map((c, i) => (
          <PlayingCard key={`${round}-${i}`} c={c} i={i} held={phase === 'hold' && held[i]} onClick={phase === 'hold' ? () => (sfx.chip(), setHeld(held.map((h, k) => (k === i ? !h : h)))) : undefined} />
        ))}
      </div>
      {phase === 'hold' && <p className="text-center text-sm text-smoke">Tap the cards to keep, then draw.</p>}
      <Result {...msg} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {phase === 'hold' ? (
          <button className="btn-gold" onClick={draw}>
            Draw
          </button>
        ) : (
          <>
            <BetPicker bet={bet} setBet={setBet} min={min} max={max} balance={balance} />
            <button className="btn-gold" onClick={deal} disabled={bet < min || bet > balance}>
              Deal
            </button>
          </>
        )}
      </div>
    </Felt>
  );
}
