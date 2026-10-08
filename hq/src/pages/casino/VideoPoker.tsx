import { Lightbulb } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, deck, RANKS, settle, stake, type Card } from '../../lib/casino';
import { sfx } from '../../lib/sound';
import { BetBar, Felt, payOut, PlayingCard, rake, useChips, wait } from './common';

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
const paysOf = (h: Card[]) => HANDS.find((x) => x.id === judge(h).id)?.pays ?? 0;

/**
 * The hold that pays best on average: every one of the 32 ways to hold, each tried against a few hundred random
 * draws from the cards left. Close enough to perfect strategy to be a good tip.
 */
export function bestHold(hand: Card[], rest: Card[], tries = 260): boolean[] {
  let best = -1;
  let bestMask = 0;
  for (let mask = 0; mask < 32; mask++) {
    const keep = hand.filter((_, i) => mask & (1 << i));
    const need = 5 - keep.length;
    let sum = 0;
    const n = need === 0 ? 1 : tries;
    for (let t = 0; t < n; t++) {
      const pool = rest.slice();
      const drawn: Card[] = [];
      for (let k = 0; k < need; k++) drawn.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
      sum += paysOf([...keep, ...drawn]);
    }
    const ev = sum / n;
    if (ev > best + 1e-9) (best = ev), (bestMask = mask);
  }
  return hand.map((_, i) => !!(bestMask & (1 << i)));
}

type Phase = 'bet' | 'hold' | 'won' | 'double' | 'done';

/** Jacks or Better on an old bar-top machine: deal five, hold what you like, draw once. Win, and you can double up. */
export default function VideoPoker() {
  const { me } = useHub();
  const { balance, min, max, bonus } = useChips();
  const [bet, setBet] = useState(Math.max(min, 25));
  const [hand, setHand] = useState<Card[]>([]);
  const [rest, setRest] = useState<Card[]>([]);
  const [held, setHeld] = useState<boolean[]>([]);
  const [hint, setHint] = useState<boolean[] | null>(null);
  const [hints, setHints] = useState(false);
  const [phase, setPhase] = useState<Phase>('bet');
  const [wager, setWager] = useState(0);
  const [pending, setPending] = useState(0);
  const [round, setRound] = useState(0);
  const [msg, setMsg] = useState('Place a bet and deal.');
  const [dbl, setDbl] = useState<{ dealer: Card; mine?: Card } | null>(null);
  const live = useRef({ phase, pending, wager });
  live.current = { phase, pending, wager };

  // Walking away mid double-up still collects what's on the screen.
  useEffect(
    () => () => {
      const l = live.current;
      if ((l.phase === 'won' || l.phase === 'double') && l.pending > 0) void settle(me.id, l.wager, l.pending, { bonus, game: 'poker', name: me.name });
    },
    [me.id, me.name, bonus],
  );

  useEffect(() => {
    if (!hints || phase !== 'hold' || hand.length !== 5) return setHint(null);
    const t = setTimeout(() => setHint(bestHold(hand, rest)), 30);
    return () => clearTimeout(t);
  }, [hints, phase, hand, rest]);

  async function deal() {
    if (bet < min || bet > balance) return;
    await stake(me.id, bet);
    const d = deck();
    setHand(d.slice(0, 5));
    setRest(d.slice(5));
    setHeld([false, false, false, false, false]);
    setWager(bet);
    setPending(0);
    setDbl(null);
    setRound((r) => r + 1);
    setPhase('hold');
    setMsg('Hold the cards you want, then draw.');
    [0, 1, 2, 3, 4].forEach((i) => setTimeout(sfx.card, i * 110));
  }
  async function draw() {
    let k = 0;
    const next = hand.map((c, i) => (held[i] ? c : rest[k++]!));
    setHand(next);
    setRest(rest.slice(k));
    setRound((r) => r + 1);
    next.forEach((_, i) => !held[i] && setTimeout(sfx.card, i * 110));
    const j = judge(next);
    const row = HANDS.find((x) => x.id === j.id);
    const paid = row ? wager * row.pays : 0;
    await wait(500);
    if (row && row.pays > 1) {
      sfx.win();
      setPending(paid);
      setPhase('won');
      setMsg(`${row.label} · WIN ${chipsFmt(paid)} · collect or double up?`);
      return;
    }
    // Jacks or Better gives the stake back; anything less loses it.
    setPhase('done');
    setMsg(row ? `${row.label} · stake back` : `${j.label} · no win`);
    if (!row) (sfx.lose(), void rake(document.querySelector('.vp-screen'), wager));
    else void payOut(document.querySelector('.vp-screen'), paid);
    await settle(me.id, wager, paid, { bonus, game: 'poker', name: me.name, note: row?.label ?? '' });
  }
  async function collect() {
    const p = pending;
    setPhase('done');
    setMsg(`Collected ${chipsFmt(p)}`);
    void payOut(document.querySelector('.vp-screen'), p);
    setPending(0);
    await settle(me.id, wager, p, { bonus, game: 'poker', name: me.name, note: judge(hand).label });
  }
  function startDouble() {
    const d = deck();
    setDbl({ dealer: d[0]! });
    setRest(d.slice(1));
    setPhase('double');
    setMsg(`Double ${chipsFmt(pending)} to ${chipsFmt(pending * 2)}: will the next card be higher or lower?`);
    sfx.card();
  }
  async function guess(high: boolean) {
    if (!dbl) return;
    const mine = rest[0]!;
    setDbl({ ...dbl, mine });
    sfx.card();
    await wait(600);
    const a = val(dbl.dealer);
    const b = val(mine);
    if (a === b) {
      setMsg(`Tie: still ${chipsFmt(pending)}. Collect or go again?`);
      setPhase('won');
    } else if (b > a === high) {
      sfx.win();
      setPending(pending * 2);
      setMsg(`Doubled! ${chipsFmt(pending * 2)}. Collect or go again?`);
      setPhase('won');
    } else {
      sfx.lose();
      setPhase('done');
      setMsg('Lost the double-up.');
      void rake(document.querySelector('.vp-screen'), pending);
      setPending(0);
      await settle(me.id, wager, 0, { bonus, game: 'poker', name: me.name });
    }
  }

  const now = hand.length === 5 && phase === 'hold' ? judge(hand).id : null;
  const final = phase !== 'hold' && hand.length ? judge(hand).id : null;
  const shown = phase === 'bet' ? bet : wager;
  return (
    <div>
      <Felt props={false}>
        <div className="vp-machine">
          <div className="vp-screen">
            <table className="vp-pays">
              <tbody>
                {HANDS.map((h) => (
                  <tr key={h.id} className={final === h.id ? 'hit' : now === h.id ? 'now' : ''}>
                    <td>{h.label}</td>
                    <td>{h.pays}×</td>
                    <td>{chipsFmt(h.pays * shown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {phase === 'double' || (dbl && phase !== 'hold') ? (
              <div className="mt-3 flex items-end justify-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <span className="felt-label">Dealer</span>
                  {dbl && <PlayingCard c={dbl.dealer} from="none" />}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="felt-label">Yours</span>
                  <PlayingCard c={dbl?.mine} down={!dbl?.mine} from="none" key={dbl?.mine ? 'up' : 'down'} />
                </div>
              </div>
            ) : (
              <div className="vp-cards" key={round} style={{ ['--shoe-x' as string]: '0px', ['--shoe-y' as string]: '-160px' }}>
                {hand.length
                  ? hand.map((c, i) => <PlayingCard key={i} c={c} i={i} held={phase === 'hold' && held[i]} onClick={phase === 'hold' ? () => (sfx.chip(), setHeld(held.map((h, k) => (k === i ? !h : h)))) : undefined} />)
                  : Array.from({ length: 5 }, (_, i) => <PlayingCard key={i} down from="none" />)}
              </div>
            )}
            <p className="vp-msg">{msg}</p>
          </div>
          {phase !== 'double' && (
            <div className="vp-holds">
              {[0, 1, 2, 3, 4].map((i) => (
                <button key={i} type="button" className={`vp-hold ${held[i] && phase === 'hold' ? 'on' : ''} ${hint?.[i] ? 'hint' : ''}`} disabled={phase !== 'hold'} onClick={() => (sfx.chip(), setHeld(held.map((h, k) => (k === i ? !h : h))))}>
                  HOLD
                </button>
              ))}
            </div>
          )}
        </div>
      </Felt>
      <BetBar bet={phase === 'won' || phase === 'double' ? pending : shown} betLabel={phase === 'won' || phase === 'double' ? 'Winnings' : 'Bet'} min={min} max={max} balance={balance} onAdd={(v) => setBet((b) => Math.min(Math.min(max, balance), b + v))} onClear={() => setBet(0)} locked={phase === 'hold' || phase === 'won' || phase === 'double'}>
        <button className={`btn-ghost btn-sm px-3 ${hints ? 'text-gold-200' : ''}`} onClick={() => setHints(!hints)} title="Show which cards to hold" aria-pressed={hints}>
          <Lightbulb className={`size-4 ${hints ? 'fill-current' : ''}`} />
        </button>
        {phase === 'hold' ? (
          <button className="btn-gold" onClick={draw}>
            Draw
          </button>
        ) : phase === 'won' ? (
          <>
            <button className="btn-ghost" onClick={startDouble}>
              Double up
            </button>
            <button className="btn-gold" onClick={collect}>
              Collect
            </button>
          </>
        ) : phase === 'double' ? (
          <>
            <button className="btn-gold" onClick={() => guess(false)} disabled={!!dbl?.mine}>
              Lower
            </button>
            <button className="btn-gold" onClick={() => guess(true)} disabled={!!dbl?.mine}>
              Higher
            </button>
          </>
        ) : (
          <button className="btn-gold" onClick={deal} disabled={bet < min || bet > balance}>
            Deal
          </button>
        )}
      </BetBar>
    </div>
  );
}
