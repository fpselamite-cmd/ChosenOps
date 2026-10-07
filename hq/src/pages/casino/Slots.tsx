import { Cherry, Coins, Crown, Gem, Rose, Skull, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, rand, settle, stake } from '../../lib/casino';
import { sfx } from '../../lib/sound';
import { BetPicker, Felt, Result, useChips } from './common';

/** The symbols, rarest first, with how often each lands and what three of them pay. */
export const SYMBOLS: { id: string; icon: LucideIcon; color: string; weight: number; pays: number }[] = [
  { id: 'crown', icon: Crown, color: '#f5b931', weight: 1, pays: 200 },
  { id: 'gem', icon: Gem, color: '#a855f7', weight: 2, pays: 50 },
  { id: 'skull', icon: Skull, color: '#e5e7eb', weight: 3, pays: 25 },
  { id: 'rose', icon: Rose, color: '#e11d48', weight: 4, pays: 15 },
  { id: 'coins', icon: Coins, color: '#d4af37', weight: 5, pays: 10 },
  { id: 'cherry', icon: Cherry, color: '#ef4444', weight: 7, pays: 5 },
];
const BAG = SYMBOLS.flatMap((s, i) => Array.from({ length: s.weight }, () => i));
const pick = () => BAG[rand(BAG.length)]!;

/** Multiplier on the bet for a line (stake included), or 0. */
export function linePays(l: number[]) {
  if (l[0] === l[1] && l[1] === l[2]) return SYMBOLS[l[0]!]!.pays;
  const cherries = l.filter((x) => SYMBOLS[x]!.id === 'cherry').length;
  return cherries === 2 ? 2 : 0;
}

const STRIP = 24;
function Reel({ stop, animate, delay }: { stop: number; animate: boolean; delay: number }) {
  // A strip of random symbols that ends on the result; it slides up and stops.
  const [strip] = useState(() => Array.from({ length: STRIP - 1 }, pick));
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!animate) return;
    let r = requestAnimationFrame(() => (r = requestAnimationFrame(() => setGo(true))));
    return () => cancelAnimationFrame(r);
  }, [animate]);
  const items = animate ? [...strip, stop] : [stop];
  // translateY % is of the strip itself, so one cell is 100 / items.length %.
  const end = ((items.length - 1) / items.length) * 100;
  return (
    <div className="slot-reel">
      <div className="slot-strip" style={{ transform: `translateY(-${go ? end : 0}%)`, transition: go ? `transform ${1.2 + delay}s cubic-bezier(.2,.7,.2,1)` : 'none' }}>
        {items.map((s, i) => {
          const S = SYMBOLS[s]!;
          return (
            <div key={i} className="slot-cell">
              <S.icon style={{ color: S.color }} className="size-14" strokeWidth={1.6} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A three-reel Chosen slot machine. Three crowns is the jackpot. */
export default function Slots() {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  const [bet, setBet] = useState(Math.max(min, 25));
  const [line, setLine] = useState([0, 1, 2]);
  const [spin, setSpin] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [jackpot, setJackpot] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  async function pull() {
    if (spinning || bet < min || bet > balance) return;
    await stake(me.id, bet);
    const l = [pick(), pick(), pick()];
    setLine(l);
    setSpin((s) => s + 1);
    setSpinning(true);
    setJackpot(false);
    setMsg({ text: '', tone: '' });
    [0, 1, 2].forEach((i) => setTimeout(sfx.reel, 1200 + i * 450));
    setTimeout(async () => {
      setSpinning(false);
      const mult = linePays(l);
      const paid = bet * mult;
      const jp = mult === SYMBOLS[0]!.pays;
      setJackpot(jp);
      setMsg(mult ? { text: `${jp ? 'JACKPOT! ' : ''}${mult}× · +${chipsFmt(paid - bet)}`, tone: 'win' } : { text: 'No luck.', tone: 'lose' });
      if (jp) sfx.jackpot();
      else if (mult) sfx.win();
      await settle(me.id, bet, paid, { jackpot: jp });
    }, 2200);
  }
  return (
    <Felt className="space-y-5">
      <div className={`slot-machine ${jackpot ? 'jackpot' : ''}`}>
        <p className="slot-title">The Chosen · Golden Reels</p>
        <div className="slot-window">
          {line.map((s, i) => (
            <Reel key={`${spin}-${i}`} stop={s} animate={spin > 0} delay={i * 0.45} />
          ))}
          <span className="slot-line" />
        </div>
        {jackpot && (
          <div className="slot-shower" aria-hidden>
            {Array.from({ length: 40 }, (_, i) => (
              <Coins key={i} className="slot-coin" style={{ left: `${(i * 23) % 100}%`, animationDelay: `${(i % 10) * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>
      <Result {...msg} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <BetPicker bet={bet} setBet={setBet} min={min} max={max} balance={balance} disabled={spinning} />
        <button className="btn-gold" onClick={pull} disabled={spinning || bet < min || bet > balance}>
          {spinning ? 'Spinning…' : 'Pull'}
        </button>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {SYMBOLS.map((s) => (
          <p key={s.id} className="flex items-center gap-1.5">
            {[0, 1, 2].map((k) => (
              <s.icon key={k} className="size-4" style={{ color: s.color }} />
            ))}
            <b className="ml-auto text-gold-200">{s.pays}×</b>
          </p>
        ))}
        <p className="col-span-2 text-center text-xs text-smoke">Any two cherries pay 2×</p>
      </div>
    </Felt>
  );
}
