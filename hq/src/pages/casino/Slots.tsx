import { Cherry, Coins, Crown, Gem, Rose, Skull, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, rand, settle, stake } from '../../lib/casino';
import { pace, sfx } from '../../lib/sound';
import { BetBar, BetSpot, CountUp, Felt, payOut, rake, Result, useChips, useSprite } from './common';

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

/** A slot symbol: the 3D render, or its icon until that's ready. */
export function Symbol3D({ i, className = '' }: { i: number; className?: string }) {
  const S = SYMBOLS[i]!;
  const url = useSprite({ kind: 'symbol', id: S.id });
  return url ? <img src={url} alt={S.id} className={className} draggable={false} /> : <S.icon style={{ color: S.color }} className={`size-14 ${className}`} strokeWidth={1.6} />;
}

const STRIP = 26;
function Reel({ stop, spin, ms, tease }: { stop: number; spin: number; ms: number; tease: boolean }) {
  // A strip of random symbols ending on the result. It slides with a blur, then stops with a little bounce.
  const strip = useRef<number[]>([]);
  const [phase, setPhase] = useState<'rest' | 'go' | 'stopped'>('rest');
  if (spin > 0 && strip.current.length !== STRIP) strip.current = Array.from({ length: STRIP - 1 }, pick);
  useEffect(() => {
    if (!spin) return;
    setPhase('rest');
    let r = requestAnimationFrame(() => (r = requestAnimationFrame(() => setPhase('go'))));
    const t = setTimeout(() => setPhase('stopped'), ms);
    return () => (cancelAnimationFrame(r), clearTimeout(t));
  }, [spin, ms]);
  const items = spin ? [...strip.current, stop] : [stop];
  const end = ((items.length - 1) / items.length) * 100;
  return (
    <div className={`slot-reel ${tease && phase === 'go' ? 'tease' : ''}`}>
      <div
        className={`slot-strip ${phase === 'go' ? 'blur' : ''}`}
        style={{ transform: `translateY(-${phase === 'rest' ? 0 : end}%)`, transition: phase === 'rest' ? 'none' : `transform ${ms}ms cubic-bezier(.18,.72,.26,1.06)` }}
      >
        {items.map((s, i) => (
          <div key={i} className="slot-cell">
            <Symbol3D i={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CoinShower({ n = 36 }: { n?: number }) {
  const coin = useSprite({ kind: 'coin' });
  useEffect(() => {
    const ts = Array.from({ length: 12 }, (_, i) => setTimeout(sfx.coin, i * 110));
    return () => ts.forEach(clearTimeout);
  }, []);
  if (!coin) return null;
  return (
    <div className="coin-shower" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} src={coin} alt="" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 12) * 0.09}s`, width: 26 + ((i * 7) % 16) }} />
      ))}
    </div>
  );
}

/** A three-reel 1940s one-armed bandit. Pull the lever (drag it down) or press Pull. Three crowns is the jackpot. */
export default function Slots({ onSpin }: { onSpin?: (line: number[], mult: number, bet: number) => void } = {}) {
  const { me } = useHub();
  const { balance, min, max, bonus } = useChips();
  const [bet, setBet] = useState(Math.max(min, 25));
  const [line, setLine] = useState([0, 1, 2]);
  const [spin, setSpin] = useState(0);
  const [times, setTimes] = useState([1200, 1650, 2100]);
  const [tease, setTease] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [big, setBig] = useState<{ amount: number; jackpot: boolean } | null>(null);
  const [pulled, setPulled] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  const drag = useRef<{ y: number; h: number } | null>(null);
  const [leverY, setLeverY] = useState(0);

  async function pull() {
    if (spinning || bet < min || bet > balance) return;
    setSpinning(true);
    setBig(null);
    setMsg({ text: '', tone: '' });
    setPulled(true);
    sfx.lever();
    setTimeout(() => setPulled(false), 380);
    await stake(me.id, bet);
    const l = [pick(), pick(), pick()];
    // The last reel teases when the first two match on something that pays.
    const t = l[0] === l[1];
    const ms = [pace(1200), pace(1650), pace(t ? 3300 : 2100)];
    setTease(t);
    setTimes(ms);
    setLine(l);
    setSpin((s) => s + 1);
    ms.forEach((m, i) => setTimeout(() => sfx.reel(), m - 40 + i * 0));
    if (t) setTimeout(() => sfx.tease(pace(1200) / 1000), ms[1]);
    setTimeout(async () => {
      const mult = linePays(l);
      const paid = bet * mult;
      const jp = mult === SYMBOLS[0]!.pays;
      const spot = document.querySelector('[data-betspot]');
      if (mult) {
        setMsg({ text: `${jp ? 'JACKPOT! ' : ''}${mult}× · +${chipsFmt(paid - bet)}`, tone: 'win' });
        void payOut(spot, paid, 200);
        if (mult >= 10) setBig({ amount: paid - bet, jackpot: jp });
        if (jp) sfx.jackpot();
        else sfx.win();
      } else {
        setMsg({ text: 'No luck.', tone: 'lose' });
        void rake(spot, bet);
      }
      setSpinning(false);
      await settle(me.id, bet, paid, { jackpot: jp, bonus, game: 'slots', name: me.name, note: jp ? 'Three crowns' : `${mult}×` });
      onSpin?.(l, mult, bet);
    }, ms[2] + 120);
  }
  useEffect(() => {
    if (!big) return;
    const t = setTimeout(() => setBig(null), pace(big.jackpot ? 6000 : 3800));
    return () => clearTimeout(t);
  }, [big]);

  return (
    <div>
      <Felt props={false}>
        <div className={`bandit ${spinning || big ? 'lit' : ''}`}>
          <div className="bandit-body">
            <div className="bandit-top">
              <p className="bandit-title">GOLDEN REELS</p>
              <div className="bandit-bulbs">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className="slot-window">
              {line.map((s, i) => (
                <Reel key={i} stop={s} spin={spin} ms={times[i]!} tease={tease && i === 2} />
              ))}
              <span className="slot-line" />
              {big && (
                <div className="big-win">
                  <b>{big.jackpot ? 'JACKPOT!' : 'BIG WIN'}</b>
                  <span>
                    +<CountUp to={big.amount} />
                  </span>
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-center">
              <BetSpot amount={bet} />
            </div>
            <div className="bandit-tray" />
          </div>
          <div
            className={`bandit-lever ${pulled ? 'pulled' : ''}`}
            role="button"
            aria-label="Pull the lever"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pull()}
            onPointerDown={(e) => {
              if (spinning) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { y: e.clientY, h: e.currentTarget.clientHeight };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setLeverY(Math.max(0, Math.min(1, (e.clientY - drag.current.y) / (drag.current.h * 0.8))));
            }}
            onPointerUp={() => {
              const far = leverY;
              drag.current = null;
              setLeverY(0);
              if (far > 0.5 || far === 0) void pull();
            }}
          >
            <span className="arm" style={leverY ? { transform: `scaleY(${1 - leverY * 1.55})`, transition: 'none' } : undefined}>
              <span className="knob" />
            </span>
            <span className="hub" />
          </div>
        </div>
        <Result {...msg} />
        <div className="mx-auto mt-2 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {SYMBOLS.map((s, i) => (
            <p key={s.id} className="flex items-center gap-1">
              {[0, 1, 2].map((k) => (
                <Symbol3D key={k} i={i} className="pay-sym" />
              ))}
              <b className="ml-auto text-gold-200">{s.pays}×</b>
            </p>
          ))}
          <p className="col-span-2 text-center text-xs text-smoke">Any two cherries pay 2×</p>
        </div>
      </Felt>
      {big && <CoinShower n={big.jackpot ? 60 : 30} />}
      <BetBar bet={bet} min={min} max={max} balance={balance} onAdd={(v) => setBet((b) => Math.min(Math.min(max, balance), b + v))} onClear={() => setBet(0)} locked={spinning}>
        <button className="btn-gold" onClick={pull} disabled={spinning || bet < min || bet > balance}>
          {spinning ? 'Spinning…' : 'Pull'}
        </button>
      </BetBar>
    </div>
  );
}
