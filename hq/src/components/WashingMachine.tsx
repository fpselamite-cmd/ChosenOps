import { Check, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { money, type WashRequest } from '../lib/money';

const PRESETS = [5, 10, 15, 30];
const two = (n: number) => String(n).padStart(2, '0');

/** A little chime when the cycle ends. */
function ding() {
  try {
    const a = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, a.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + i * 0.18);
      o.stop(a.currentTime + i * 0.18 + 0.5);
    });
  } catch {
    /* no sound, no problem */
  }
}

/**
 * The washer's machine for a wash they've claimed: set a timer, watch the bills tumble,
 * and it dings when the cycle's done.
 */
export function WashingMachine({ w, onTimer, onDone, onLetGo }: { w: WashRequest; onTimer: (mins: number | null) => void; onDone: () => void; onLetGo: () => void }) {
  const end = w.timerEnd?.toMillis() ?? null;
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [end]);
  const left = end ? Math.max(0, end - now) : 0;
  const running = !!end && left > 0;
  const finished = !!end && left === 0;
  const rang = useRef(false);
  useEffect(() => {
    if (finished && !rang.current) {
      rang.current = true;
      ding();
    }
    if (!finished) rang.current = false;
  }, [finished]);
  const total = (w.timerMins ?? 1) * 60_000;
  const pct = end ? Math.min(100, ((total - left) / total) * 100) : 0;
  // The bills turn from dirty red to clean green as the cycle runs.
  const w8 = finished ? 100 : pct;
  const mix = (clean: string, dirty: string) => `color-mix(in oklab, ${clean} ${w8}%, ${dirty})`;
  const billBg = `linear-gradient(135deg, ${mix('#86efac', '#f87171')}, ${mix('#16a34a', '#991b1b')})`;
  const billInk = mix('#14532d', '#450a0a');
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  return (
    <div className={`washer ${running ? 'running' : ''} ${finished ? 'finished' : ''}`}>
      <div className="washer-top">
        <span className="washer-display font-mono">{running ? `${two(mm)}:${two(ss)}` : finished ? 'DONE' : '--:--'}</span>
        <span className={`washer-led ${running ? 'on' : finished ? 'done' : ''}`} />
        <span className="washer-knob" style={{ rotate: `${pct * 2.7 - 135}deg` }} />
      </div>
      <div className="washer-door">
        <div className="washer-drum">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="washer-bill" style={{ transform: `rotate(${i * 51}deg) translateY(${-16 - (i % 3) * 9}px) rotate(${i * 37}deg)`, background: billBg, color: billInk, transition: 'background 1s linear, color 1s linear' }}>
              $
            </span>
          ))}
        </div>
        <span className="washer-suds" />
      </div>
      <div className="washer-info">
        <span className="font-mono text-red-300">{money(w.dirty)}</span> → <span className="font-mono text-emerald-200">{money(w.clean)}</span>
        <span className="block text-[11px] text-smoke">{w.memberName}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/60">
        <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-300 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {!end ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {PRESETS.map((m) => (
            <button key={m} className="btn-ghost btn-sm px-2" onClick={() => onTimer(m)}>
              {m}m
            </button>
          ))}
          <input className="input w-14 px-1.5 py-1 text-center font-mono text-xs" placeholder="min" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <button className="btn-gold btn-sm px-2" disabled={!Number(custom) || Number(custom) > 240} onClick={() => onTimer(Number(custom))} aria-label="Start">
            <Play className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-1.5">
          {running && (
            <button className="btn-ghost btn-sm" onClick={() => onTimer(null)}>
              <Square className="size-3.5" /> Stop
            </button>
          )}
          <button className={finished ? 'btn-gold btn-sm washer-ready' : 'btn-ghost btn-sm'} onClick={onDone}>
            <Check className="size-3.5" /> Washed
          </button>
        </div>
      )}
      {!running && (
        <button className="text-[11px] text-smoke hover:text-gold-200" onClick={onLetGo}>
          Let it go
        </button>
      )}
    </div>
  );
}
