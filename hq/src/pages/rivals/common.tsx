import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useCollection } from '../../hooks/useCollection';
import type { Bounty, Incident, Rival, RivalNote, Sighting, Zone } from '../../lib/rivals';
import type { Blacksite } from '../../lib/blacksites';

export const MAP_SRC = '/map/city.jpg';
export const PLACEHOLDER = '/map/placeholder.svg';

export function useRivalData() {
  const gangs = (useCollection<Rival>('rivals') ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const incidents = (useCollection<Incident>('rivalIncidents') ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const notes = (useCollection<RivalNote>('rivalNotes') ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const sightings = (useCollection<Sighting>('sightings') ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const bounties = (useCollection<Bounty>('bounties') ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const fights = useCollection<Blacksite>('blacksites') ?? [];
  return { gangs, incidents, notes, sightings, bounties, fights };
}

/** Blacksite fights against a gang (matched by name), and our record. */
export function recordVs(name: string, fights: Blacksite[]) {
  const vs = fights.filter((f) => f.rivals.some((r) => r.trim().toLowerCase() === name.trim().toLowerCase()));
  return { fights: vs, w: vs.filter((f) => f.result === 'win').length, l: vs.filter((f) => f.result === 'loss').length, n: vs.length };
}

export const centroid = (pts: { x: number; y: number }[]) => [pts.reduce((t, p) => t + p.x, 0) / pts.length, pts.reduce((t, p) => t + p.y, 0) / pts.length] as const;

/** Turf zones as filled shapes in a gang's color, over whatever map they sit on. */
export function ZoneLayer({ zones }: { zones: { gang: Pick<Rival, 'name' | 'color'>; zone: Zone }[] }) {
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {zones.map(({ gang, zone }, i) => (
          <polygon key={i} points={zone.points.map(({ x, y }) => `${x * 100},${y * 100}`).join(' ')} fill={gang.color} fillOpacity={0.22} stroke={gang.color} strokeWidth={0.35} strokeDasharray="1.2 0.6" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {zones.map(({ gang, zone }, i) => {
        if (zone.points.length < 3) return null;
        const [x, y] = centroid(zone.points);
        return (
          <span key={`l${i}`} className="turf-label pointer-events-none absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%`, color: gang.color }}>
            {zone.label || gang.name}
          </span>
        );
      })}
    </>
  );
}

/** The city map, fit to its box, with whatever is layered on it; clicks report 0..1 coordinates. */
export function MiniMap({ children, onPick, className = '', style, onLoad }: { children?: ReactNode; onPick?: (x: number, y: number) => void; className?: string; style?: CSSProperties; onLoad?: () => void }) {
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return (
    <div className={`relative overflow-hidden border border-line ${onPick ? 'cursor-crosshair' : ''} ${className}`} style={style} onClick={click}>
      <img src={MAP_SRC} alt="City map" draggable={false} className="block w-full select-none" onLoad={onLoad} onError={(e) => (e.currentTarget.src = PLACEHOLDER)} />
      {children}
    </div>
  );
}

/** The city map in a scroll box with zoom buttons, starting over `focus` (the city by default). */
export function ZoomMap({ children, onPick, focus, start = 2, height = 'max-h-[60vh]' }: { children?: ReactNode; onPick?: (x: number, y: number) => void; focus?: { x: number; y: number }[]; start?: number; height?: string }) {
  const [zoom, setZoom] = useState(start);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const key = focus?.length ? `${focus[0]!.x},${focus[0]!.y}` : '';
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const [cx, cy] = focus?.length ? centroid(focus) : [0.45, 0.75];
    requestAnimationFrame(() => el.scrollTo({ left: cx * el.scrollWidth - el.clientWidth / 2, top: cy * el.scrollHeight - el.clientHeight / 2 }));
  }, [zoom, key, loaded]);
  return (
    <div className="relative">
      <div ref={box} className={`${height} overflow-auto border border-line`}>
        <MiniMap onPick={onPick} onLoad={() => setLoaded(true)} className="border-0" style={{ width: `${zoom * 100}%` }}>
          {children}
        </MiniMap>
      </div>
      <div className="absolute top-2 right-4 flex gap-1">
        {[1, 2, 3, 4].map((z) => (
          <button type="button" key={z} className={`chip bg-black/75 px-2 py-0.5 text-xs ${zoom === z ? 'border-gold-400 text-gold-200' : 'text-smoke'}`} onClick={() => setZoom(z)}>
            {z}×
          </button>
        ))}
      </div>
    </div>
  );
}
