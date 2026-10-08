import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BUILD_STATS, type BuildStats } from '../lib/loadouts';
import type { Bench, GunSpec } from './gun3d';

/** The 3D code (three.js) loads on its own, only when a gun is first shown. */
const load = () => import('./gun3d');

/** The live workbench: the gun turns slowly; drag to spin it, tap a part to pick its slot. */
export function GunBench({ spec, active, onSlot, className = '', fallback = null }: { spec: GunSpec; active: string | null; onSlot: (slot: string) => void; className?: string; fallback?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bench = useRef<Bench | null>(null);
  const slotCb = useRef(onSlot);
  slotCb.current = onSlot;
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(spec);
  useEffect(() => {
    let gone = false;
    load()
      .then((g) => {
        if (gone || !ref.current) return;
        try {
          bench.current = g.mountBench(ref.current, spec, (s) => slotCb.current(s));
          bench.current.setActive(active);
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      bench.current?.dispose();
      bench.current = null;
    };
    // Mount once; changes below go to the live bench.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => bench.current?.setSpec(spec), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => bench.current?.setActive(active), [active]);
  if (failed) return <>{fallback}</>;
  return <canvas ref={ref} className={`block h-full w-full cursor-grab active:cursor-grabbing ${className}`} aria-label={`${spec.name} on the workbench`} />;
}

/** A still 3D shot of a build, for cards. */
export function GunStill({ spec, className = '', w = 480, h = 270 }: { spec: GunSpec; className?: string; w?: number; h?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    let on = true;
    load()
      .then((g) => g.renderGun(spec, w, h))
      .then((u) => on && setSrc(u))
      .catch(() => {});
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h]);
  return (
    <span className={`gun-still ${src ? 'ready' : ''} ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      {src && <img src={src} alt={spec.name} draggable={false} />}
    </span>
  );
}

/** A small picture of one part on its own. */
export function PartThumb({ spec, slot }: { spec: GunSpec; slot: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    let on = true;
    load()
      .then((g) => g.renderPart(spec, slot))
      .then((u) => on && setSrc(u))
      .catch(() => {});
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slot]);
  return <span className={`part-thumb ${src ? 'ready' : ''}`}>{src && <img src={src} alt="" draggable={false} />}</span>;
}

/** The builder's stat bars (only the ones they filled in). */
export function StatBars({ stats, compact = false, best }: { stats?: BuildStats; compact?: boolean; best?: BuildStats }) {
  const set = BUILD_STATS.filter((s) => stats?.[s.id]);
  if (!set.length) return null;
  return (
    <div className={compact ? 'grid grid-cols-3 gap-x-3 gap-y-1' : 'space-y-1.5'}>
      {set.map((s) => {
        const v = stats![s.id]!;
        const top = best?.[s.id];
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span className={`shrink-0 text-smoke ${compact ? 'w-14 text-[9px] tracking-wider uppercase' : 'w-20 text-xs'}`}>{s.label}</span>
            <span className={`stat-bar ${compact ? 'h-1' : 'h-1.5'}`}>
              <i style={{ width: `${v * 10}%` }} className={top !== undefined && v >= top ? 'up' : ''} />
            </span>
            {!compact && <b className="w-5 text-right font-mono text-xs text-gold-100">{v}</b>}
          </div>
        );
      })}
    </div>
  );
}
