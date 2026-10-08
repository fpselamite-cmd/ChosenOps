import { Gauge, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, DEFAULT_CASINO, getSession, isRed, onSession, type Card, type CasinoSettings, type Chips } from '../../lib/casino';
import { ambience, isFast, isMuted, onFast, pace, setFast, setMuted, sfx } from '../../lib/sound';
import type { Sprite } from './casino3d';

export function useChips() {
  const { me } = useHub();
  const c = useDoc<Chips>(`chips/${me.id}`);
  const s = { ...DEFAULT_CASINO, ...(useDoc<CasinoSettings>('settings/casino') ?? {}) };
  const event = !!s.eventUntil && s.eventUntil.toMillis() > Date.now();
  return { chips: c, balance: c?.balance ?? 0, settings: s, event, max: event ? s.eventMax : s.max, min: s.min, bonus: event ? s.eventBonus : 0 };
}

/** 950 → "950", 1,250 → "1.25K", 12,500 → "12.5K", 1,200,000 → "1.2M": always short enough to fit. */
export function compact(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a < 1000) return s + Math.round(a);
  if (a < 1e6) return s + `${+(a / 1000).toFixed(a < 1e4 ? 2 : a < 1e5 ? 1 : 0)}K`;
  return s + `${+(a / 1e6).toFixed(a < 1e7 ? 2 : 1)}M`;
}

// ---------- 3D pieces ----------

const sprites = new Map<string, string>();
const keyOf = (s: Sprite) => JSON.stringify(s);
/** The rendered picture of a piece, once it's ready (null until then). */
export function useSprite(s: Sprite | null) {
  const k = s ? keyOf(s) : '';
  const [url, setUrl] = useState<string | null>(() => sprites.get(k) ?? null);
  useEffect(() => {
    if (!s) return;
    if (sprites.has(k)) return setUrl(sprites.get(k)!);
    let on = true;
    import('./casino3d')
      .then((m) => m.sprite(s))
      .then((u) => {
        sprites.set(k, u);
        if (on) setUrl(u);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return url;
}
/** Warms the cache so the first deal or bet doesn't wait for pictures. */
export function preload(list: Sprite[]) {
  void import('./casino3d').then((m) => list.forEach((s) => void m.sprite(s).then((u) => sprites.set(keyOf(s), u)).catch(() => {})));
}

export const CHIP_VALUES = [10, 25, 50, 100, 250, 500, 1000, 5000];
const chipClass = (v: number) => `casino-chip v${CHIP_VALUES.includes(v) ? v : 1000}`;
const label = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));

/** A clay chip: the 3D render once it's ready, a drawn chip until then. */
export function Chip3D({ value, size = 46, className = '' }: { value: number; size?: number; className?: string }) {
  const url = useSprite({ kind: 'chip', value });
  return (
    <span className={`chip3d ${className}`} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={label(value)} draggable={false} /> : <span className={chipClass(value)} style={{ width: size * 0.82, height: size * 0.82 }}>{label(value)}</span>}
    </span>
  );
}

/** How a pile of chips breaks down into the chips you'd see (at most `cap` of them). */
export function chipsFor(amount: number, cap = 6) {
  const out: number[] = [];
  let left = Math.round(amount);
  for (const v of [...CHIP_VALUES].reverse()) {
    while (left >= v && out.length < cap) {
      out.push(v);
      left -= v;
    }
  }
  if (!out.length && amount > 0) out.push(10);
  return out.reverse();
}

/** A short stack of chips with its total on a tag. */
export function Stack({ amount, size = 34, tag = true }: { amount: number; size?: number; tag?: boolean }) {
  if (amount <= 0) return null;
  const chips = chipsFor(amount, 5);
  return (
    <span className="chip-stack" style={{ '--s': `${size}px`, height: size + (chips.length - 1) * size * 0.14 } as CSSProperties}>
      {chips.map((v, i) => (
        <span key={i} style={{ bottom: i * size * 0.14 }}>
          <Chip3D value={v} size={size} />
        </span>
      ))}
      {tag && <b className="chip-stack-tag">{compact(amount)}</b>}
    </span>
  );
}

// ---------- chip flights ----------
// Chips fly from your rack to where you bet, winnings slide back to the rack, losing chips get raked away.

const rectOf = (x: Element | DOMRect | null | undefined) => (!x ? null : x instanceof Element ? x.getBoundingClientRect() : x);
function chipEl(v: number, size: number) {
  const el = document.createElement('span');
  el.className = 'chip-flight';
  el.style.width = el.style.height = `${size}px`;
  const url = sprites.get(keyOf({ kind: 'chip', value: v }));
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    el.appendChild(img);
  } else {
    const c = document.createElement('span');
    c.className = chipClass(v);
    c.textContent = label(v);
    el.appendChild(c);
  }
  return el;
}
/** One flight: an arc with a spin, landing with a click. */
export function fly(from: Element | DOMRect | null | undefined, to: Element | DOMRect | null | undefined, amount: number, opts: { delay?: number; fade?: boolean; size?: number; sound?: boolean } = {}) {
  const a = rectOf(from);
  const b = rectOf(to);
  if (!a || !b || typeof document === 'undefined') return Promise.resolve();
  const size = opts.size ?? 34;
  const chips = chipsFor(amount, 3);
  const ms = pace(520);
  const runs = chips.map(
    (v, k) =>
      new Promise<void>((done) => {
        const el = chipEl(v, size);
        document.body.appendChild(el);
        const x0 = a.left + a.width / 2 - size / 2;
        const y0 = a.top + a.height / 2 - size / 2;
        const x1 = b.left + b.width / 2 - size / 2 + (k - (chips.length - 1) / 2) * 3;
        const y1 = b.top + b.height / 2 - size / 2 - k * 4;
        const lift = Math.min(160, 40 + Math.hypot(x1 - x0, y1 - y0) * 0.25);
        const anim = el.animate(
          [
            { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(1)`, opacity: 1 },
            { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) rotate(200deg) scale(1.15)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${x1}px, ${y1}px) rotate(360deg) scale(1)`, opacity: opts.fade ? 0 : 1 },
          ],
          { duration: ms, delay: (opts.delay ?? 0) + k * pace(70), easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'forwards' },
        );
        anim.onfinish = () => {
          if (opts.sound !== false) sfx.chip();
          el.remove();
          done();
        };
        anim.oncancel = () => (el.remove(), done());
      }),
  );
  return Promise.all(runs).then(() => undefined);
}
const rack = () => document.querySelector('[data-rack]');
const dealer = () => document.querySelector('[data-dealer]') ?? document.querySelector('.backroom');
/** Winnings slide from the table back to your rack. */
export const payOut = (from: Element | null | undefined, amount: number, delay = 0) => (sfx.payout(), fly(from, rack(), amount, { delay }));
/** Losing chips get swept off to the dealer. */
export function rake(from: Element | null | undefined, amount: number, delay = 0) {
  const d = rectOf(dealer());
  if (!d) return Promise.resolve();
  sfx.rake();
  return fly(from, new DOMRect(d.left + d.width / 2 - 10, d.top - 10, 20, 20), amount, { delay, fade: true, sound: false });
}

// ---------- cards ----------

/** A playing card: dealt from the shoe, flipping over when it's turned up. */
export function PlayingCard({ c, down, i = 0, held, onClick, from = 'shoe', small }: { c?: Card; down?: boolean; i?: number; held?: boolean; onClick?: () => void; from?: 'shoe' | 'none'; small?: boolean }) {
  const face = useSprite(c ? { kind: 'card', r: c.r, s: c.s } : null);
  const back = useSprite({ kind: 'back' });
  const showBack = down || !c;
  return (
    <button
      type="button"
      className={`pc ${from === 'shoe' ? 'dealt' : ''} ${showBack ? 'down' : ''} ${c && isRed(c) ? 'red' : ''} ${held ? 'held' : ''} ${small ? 'small' : ''}`}
      style={{ animationDelay: `${(i * pace(160)) / 1000}s`, animationDuration: `${pace(520) / 1000}s` }}
      onClick={onClick}
      disabled={!onClick}
      tabIndex={onClick ? 0 : -1}
    >
      <span className="pc-inner">
        <span className="pc-face">
          {face ? (
            <img src={face} alt={c ? `${c.r}${c.s}` : ''} draggable={false} />
          ) : c ? (
            <>
              <span className="pc-corner">
                {c.r}
                <br />
                {c.s}
              </span>
              <span className="pc-mid">{c.s}</span>
            </>
          ) : null}
        </span>
        <span className="pc-backface">{back ? <img src={back} alt="" draggable={false} /> : <span className="pc-back" />}</span>
      </span>
      {held && <span className="pc-held">HELD</span>}
    </button>
  );
}

/** A hand's total on a little tag: soft totals show both ways ("7/17"). */
export function HandTotal({ cards, hide }: { cards: Card[]; hide?: boolean }) {
  if (!cards.length || hide) return null;
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 'A') (t += 11), aces++;
    else if (['K', 'Q', 'J'].includes(c.r)) t += 10;
    else t += Number(c.r);
  }
  while (t > 21 && aces) (t -= 10), aces--;
  const soft = aces > 0 && t <= 21 && !(cards.length === 2 && t === 21);
  return <span className={`hand-total ${t > 21 ? 'bust' : t === 21 ? 'best' : ''}`}>{soft ? `${t - 10}/${t}` : t}</span>;
}

// ---------- the room ----------

/** The backroom table: worn felt and a padded rail under one hanging lamp, smoke drifting, a few things on the edge. */
export function Felt({ children, className = '', props = true }: { children: ReactNode; className?: string; props?: boolean }) {
  return (
    <div className="backroom">
      <span className="br-lamp" aria-hidden />
      <span className="br-smoke" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {props && <Props />}
      <span className="br-dealer" data-dealer aria-hidden />
      <div className={`br-felt ${className}`}>{children}</div>
    </div>
  );
}
function Prop({ id, className }: { id: 'ashtray' | 'whiskey' | 'cash'; className: string }) {
  const url = useSprite({ kind: 'prop', id });
  return url ? <img src={url} alt="" className={`br-prop ${className}`} draggable={false} /> : null;
}
function Props() {
  return (
    <span className="br-props" aria-hidden>
      <Prop id="whiskey" className="tl" />
      <Prop id="ashtray" className="tr" />
      <Prop id="cash" className="bl" />
    </span>
  );
}

/** Starts the room's murmur on the first tap (browsers need one before any sound), and stops it on the way out. */
export function useRoom() {
  useEffect(() => {
    const start = () => !isMuted() && ambience.start();
    window.addEventListener('pointerdown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      ambience.stop();
    };
  }, []);
}

export function SoundToggle() {
  const [m, setM] = useState(isMuted());
  return (
    <button
      className="btn-ghost btn-sm px-2"
      onClick={() => {
        setMuted(!m);
        setM(!m);
        if (m) ambience.start();
      }}
      title={m ? 'Sound off' : 'Sound on'}
      aria-label="Toggle sound"
    >
      {m ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

export function useFast() {
  const [f, setF] = useState(isFast());
  useEffect(() => onFast(setF), []);
  return f;
}
export function FastToggle() {
  const f = useFast();
  return (
    <button className={`btn-ghost btn-sm px-2 ${f ? 'text-gold-200' : ''}`} onClick={() => setFast(!f)} title={f ? 'Fast play is on' : 'Fast play: shorter animations'} aria-label="Fast play" aria-pressed={f}>
      {f ? <Zap className="size-4 fill-current" /> : <Gauge className="size-4" />}
    </button>
  );
}

function useSessionStats() {
  const [s, setS] = useState(getSession());
  useEffect(() => onSession(setS), []);
  return s;
}

/**
 * The sticky bet bar: a rack of chips you can swipe, the bet in big numbers that never get cut off, and the game's
 * buttons. `add` mode stacks the tapped chip onto the bet; `pick` mode (roulette) picks the chip you'll place.
 */
export function BetBar({
  bet,
  min,
  max,
  balance,
  mode = 'add',
  picked,
  onAdd,
  onPick,
  onClear,
  locked,
  betLabel = 'Bet',
  children,
}: {
  bet: number;
  min: number;
  max: number;
  balance: number;
  mode?: 'add' | 'pick';
  picked?: number;
  onAdd?: (v: number) => void;
  onPick?: (v: number) => void;
  onClear?: () => void;
  locked?: boolean;
  betLabel?: string;
  children?: ReactNode;
}) {
  const s = useSessionStats();
  const cap = Math.min(max, balance);
  const values = CHIP_VALUES.filter((v) => v <= Math.max(max, 10));
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="bet-bar" ref={ref}>
      <div className="bb-info">
        <span className="bb-balance">
          <small>Chips</small> <b>{chipsFmt(balance)}</b>
        </span>
        <span className={`bb-session ${s.net > 0 ? 'up' : s.net < 0 ? 'down' : ''}`} title="This session">
          {s.hands ? (
            <>
              {s.net >= 0 ? '+' : ''}
              {compact(s.net)} · {s.wins}W {s.losses}L{s.best > 0 ? ` · best +${compact(s.best)}` : ''}
            </>
          ) : (
            `Table ${compact(min)}–${compact(max)}`
          )}
        </span>
        <span className="ml-auto flex items-center">
          <FastToggle />
          <SoundToggle />
        </span>
      </div>
      <div className="bb-main">
        <div className="bb-rack" data-rack>
          {values.map((v) => {
            const off = locked || (mode === 'add' ? bet + v > cap : v > cap);
            return (
              <button
                key={v}
                type="button"
                className={`bb-chip ${mode === 'pick' && picked === v ? 'picked' : ''}`}
                disabled={off}
                onClick={(e) => {
                  if (mode === 'pick') {
                    sfx.chip();
                    onPick?.(v);
                    return;
                  }
                  onAdd?.(v);
                  void fly(e.currentTarget, document.querySelector('[data-betspot]'), v);
                }}
                aria-label={`${mode === 'pick' ? 'Pick' : 'Add'} ${v}`}
              >
                <Chip3D value={v} size={44} />
              </button>
            );
          })}
        </div>
        <div className="bb-bet">
          <small>{betLabel}</small>
          <b className={bet > cap ? 'text-red-300' : ''}>{chipsFmt(bet)}</b>
          {onClear && bet > 0 && !locked && (
            <button
              type="button"
              className="bb-clear"
              onClick={() => {
                void fly(document.querySelector('[data-betspot]'), document.querySelector('[data-rack]'), bet);
                onClear();
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="bb-actions">{children}</div>
      </div>
    </div>
  );
}

/** Where your bet sits on the felt (chips fly here). */
export function BetSpot({ amount, label: text = 'Bet', className = '' }: { amount: number; label?: string; className?: string }) {
  return (
    <span className={`bet-spot ${amount ? 'has' : ''} ${className}`} data-betspot>
      {amount ? <Stack amount={amount} /> : <small>{text}</small>}
    </span>
  );
}

export function Result({ text, tone }: { text: string; tone: 'win' | 'lose' | 'push' | '' }) {
  if (!text) return <p className="casino-result" aria-hidden>&nbsp;</p>;
  return (
    <p className={`casino-result ${tone}`} role="status">
      {text}
    </p>
  );
}

/** Counts a number up from 0 (big wins). */
export function CountUp({ to, ms = 1400 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const dur = pace(ms);
    let r = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setV(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) r = requestAnimationFrame(tick);
    };
    r = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r);
  }, [to, ms]);
  return <>{chipsFmt(v)}</>;
}

/** A pause that respects fast play. */
export const wait = (ms: number) => new Promise((r) => setTimeout(r, pace(ms)));
