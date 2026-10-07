import { Snowflake, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHub } from '../hooks/useHub';
import { ACCENTS } from '../lib/appearance';
import { keyOf } from '../lib/calendar';
import { FREEZES_PER_MONTH, MILESTONES, freezesLeft, nextMilestone, useMyStreak, useStreak } from '../lib/streak';

const BUMP = 'chosenops.streakBump';

/** Counts today's visit (mounted once, in the app shell) and flags the Dashboard to celebrate. */
export function StreakKeeper() {
  const { bumped, clearBump } = useMyStreak();
  useEffect(() => {
    if (!bumped) return;
    try {
      sessionStorage.setItem(BUMP, keyOf(Date.now()));
    } catch {
      /* optional */
    }
    window.dispatchEvent(new Event(BUMP));
    clearBump();
  }, [bumped, clearBump]);
  return null;
}

// The seven stars of the streak constellation, lit one a day; after a week they stay lit and the
// constellation grows rings, a halo and finally an aurora at each milestone.
const STARS: [number, number, number][] = [
  [6, 30, 2.2],
  [18, 24, 2.6],
  [30, 27, 2.2],
  [41, 18, 3],
  [55, 15, 2.4],
  [66, 6, 2.2],
  [76, 16, 3.4],
];
const tierOf = (n: number) => MILESTONES.filter((m) => n >= m).length; // 0–4

export function Constellation({ days, burst, size = 120 }: { days: number; burst?: boolean; size?: number }) {
  const tier = tierOf(days);
  const lit = Math.min(STARS.length, Math.max(1, days));
  const path = STARS.slice(0, lit)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
    .join(' ');
  return (
    <svg viewBox="0 0 82 38" width={size} height={(size * 38) / 82} className={`streak-cons tier-${tier} ${burst ? 'burst' : ''}`} aria-hidden>
      <defs>
        <radialGradient id="sc-glow">
          <stop offset="0" stopColor="rgb(var(--acc-hi))" stopOpacity="0.9" />
          <stop offset="1" stopColor="rgb(var(--acc))" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-aurora" x1="0" x2="1">
          <stop offset="0" stopColor="#79d3e6" />
          <stop offset="0.5" stopColor="#a487f0" />
          <stop offset="1" stopColor="#f2c2b8" />
        </linearGradient>
      </defs>
      {tier >= 3 && <ellipse cx="41" cy="20" rx="40" ry="16" fill="url(#sc-glow)" opacity="0.25" className="sc-nebula" />}
      {tier >= 2 &&
        [
          [12, 8],
          [24, 12],
          [48, 30],
          [62, 32],
          [72, 30],
          [36, 6],
        ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.7" fill="rgb(var(--acc-hi))" className="sc-dust" style={{ animationDelay: `${i * 0.4}s` }} />)}
      <path d={path} fill="none" stroke={tier >= 4 ? 'url(#sc-aurora)' : 'rgb(var(--acc))'} strokeWidth={tier >= 1 ? 0.9 : 0.6} strokeOpacity={tier >= 1 ? 0.9 : 0.55} className="sc-line" pathLength={1} />
      {STARS.map(([x, y, r], i) => {
        const on = i < lit;
        return (
          <g key={i} className={on ? 'sc-star on' : 'sc-star'} style={{ animationDelay: `${i * 0.25}s` }}>
            {on && <circle cx={x} cy={y} r={r * 2.2} fill="url(#sc-glow)" opacity="0.5" />}
            <path
              d={`M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`}
              fill={on ? (tier >= 4 ? 'url(#sc-aurora)' : 'rgb(var(--acc-hi))') : 'rgb(var(--acc) / 0.18)'}
            />
          </g>
        );
      })}
      {tier >= 1 && <circle cx="76" cy="16" r="6.5" fill="none" stroke="rgb(var(--acc-hi))" strokeOpacity="0.6" strokeWidth="0.5" className="sc-ring" />}
      {tier >= 2 && <circle cx="76" cy="16" r="9" fill="none" stroke="rgb(var(--acc))" strokeOpacity="0.35" strokeWidth="0.4" strokeDasharray="1 1.5" className="sc-ring2" />}
      {burst && (
        <g className="sc-burst">
          <circle cx={STARS[lit - 1]![0]} cy={STARS[lit - 1]![1]} r="4" fill="none" stroke="rgb(var(--acc-hi))" strokeWidth="0.8" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const [cx, cy] = STARS[lit - 1]!;
            return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * 9} y2={cy + Math.sin(a) * 9} stroke="rgb(var(--acc-hi))" strokeWidth="0.6" strokeLinecap="round" />;
          })}
        </g>
      )}
    </svg>
  );
}

/** The streak in the Dashboard header: the constellation, the count, and the details on click. */
export function StreakBadge() {
  const { me } = useHub();
  const s = useStreak(me.id);
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  const [burst, setBurst] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const check = () => {
      try {
        if (sessionStorage.getItem(BUMP) === keyOf(Date.now())) {
          sessionStorage.removeItem(BUMP);
          setBurst(true);
          setTimeout(() => setBurst(false), 2600);
        }
      } catch {
        /* optional */
      }
    };
    check();
    window.addEventListener(BUMP, check);
    return () => window.removeEventListener(BUMP, check);
  }, []);
  if (!s) return null;
  const days = s.current ?? 0;
  const next = nextMilestone(days);
  const prev = [...MILESTONES].reverse().find((m) => m <= days) ?? 0;
  const left = freezesLeft(s);
  const today = keyOf(Date.now());
  const onLoa = !!s.loaFrom && !!s.loaUntil && today <= s.loaUntil;
  return (
    <div className="relative">
      <button
        ref={btn}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          setOpen(open || !r ? null : { top: r.bottom + 8, right: window.innerWidth - r.right });
        }}
        className={`streak-badge flex items-center gap-2 border border-line px-3 py-1.5 transition hover:border-gold-500 ${burst ? 'is-burst' : ''}`} title="Your login streak">
        <Constellation days={days} burst={burst} size={84} />
        <span className="text-left leading-none">
          <span className="block font-display text-2xl font-bold text-gold-100">{days}</span>
          <span className="label text-[9px]">{days === 1 ? 'day' : 'days'} in a row</span>
        </span>
      </button>
      {burst && <span className="streak-toast pointer-events-none absolute -top-7 right-0 whitespace-nowrap text-xs font-bold text-gold-200">+1 · day {days}!</span>}
      {open &&
        createPortal(
        <div className="fixed z-50 w-72 border border-line bg-coal p-4 shadow-2xl" style={{ top: open.top, right: open.right }} onMouseLeave={() => setOpen(null)}>
          <div className="flex justify-center">
            <Constellation days={days} size={200} />
          </div>
          <p className="mt-2 text-center font-display text-xl text-gold-100">
            {days} {days === 1 ? 'day' : 'days'} in a row
          </p>
          <p className="text-center text-xs text-smoke">Best: {s.best} · open HQ once a day (Eastern time) to keep it</p>
          {next && (
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-smoke">
                <span>{prev || 0}</span>
                <span>Next: {next} days</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden bg-raised">
                <div className="h-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${Math.min(100, ((days - prev) / (next - prev)) * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-ash">
            {Array.from({ length: FREEZES_PER_MONTH }, (_, i) => (
              <Snowflake key={i} className={`size-4 ${i < left ? 'text-sky-300' : 'text-smoke/40'}`} />
            ))}
            <span>
              {left} {left === 1 ? 'freeze' : 'freezes'} left this month: a missed day uses one.
            </span>
          </div>
          {onLoa && <p className="mt-2 text-xs text-gold-300">On leave until {s.loaUntil}: missed days don’t count.</p>}
          <div className="mt-3 border-t border-line-soft pt-3">
            <p className="label mb-1.5 flex items-center gap-1">
              <Sparkles className="size-3" /> Unlocks
            </p>
            <ul className="space-y-1 text-xs">
              {ACCENTS.filter((a) => a.unlock).map((a) => (
                <li key={a.id} className={`flex items-center gap-2 ${s.best >= a.unlock! ? 'text-gold-100' : 'text-smoke'}`}>
                  <span className="size-3 rounded-full" style={{ background: a.swatch }} />
                  {a.label} accent + Night Watch trophy
                  <span className="ml-auto font-mono">{s.best >= a.unlock! ? '✓' : `${a.unlock}d`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
