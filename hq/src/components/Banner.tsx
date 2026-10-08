import { Crown } from 'lucide-react';
import { useId } from 'react';
import type { BannerSpec } from '../lib/honors';
import { ICONS } from './HonorArt';

/** The banner behind a portrait: a hanging cloth in two colors with a pattern and a sigil, on a gold rod with fringe. */
export const BANNER_SHAPES: { id: BannerSpec['shape']; label: string }[] = [
  { id: 'pennant', label: 'Pennant' },
  { id: 'standard', label: 'Standard' },
  { id: 'swallow', label: 'Swallowtail' },
  { id: 'scroll', label: 'Scroll' },
];
export const BANNER_PATTERNS: { id: BannerSpec['pattern']; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'diamonds', label: 'Diamonds' },
  { id: 'quartered', label: 'Quartered' },
  { id: 'saltire', label: 'Saltire' },
];
export const BANNER_COLORS = ['#7a1020', '#0b0b10', '#1e3a8a', '#14532d', '#4c1d95', '#7c2d12', '#d4af37', '#e5e7eb', '#0f766e', '#9d174d'];
export const DEFAULT_BANNER: BannerSpec = { shape: 'pennant', pattern: 'chevron', sigil: 'Crown', c1: '#7a1020', c2: '#0b0b10' };

const OUTLINE: Record<BannerSpec['shape'], string> = {
  pennant: 'M8 6 H92 V118 L50 146 L8 118 Z',
  standard: 'M8 6 H92 V140 H8 Z',
  swallow: 'M8 6 H92 V146 L50 118 L8 146 Z',
  scroll: 'M8 6 H92 V132 Q71 122 50 132 Q29 142 8 132 Z',
};

export function Banner({ spec, width = 120, className = '' }: { spec: BannerSpec; width?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const Sigil = ICONS[spec.sigil] ?? Crown;
  const h = width * 1.55;
  const p = `p${uid}`;
  return (
    <span className={`banner ${className}`} style={{ width, height: h }}>
      <svg viewBox="0 0 100 155" width={width} height={h} aria-hidden>
        <defs>
          <clipPath id={`c${uid}`}>
            <path d={OUTLINE[spec.shape]} />
          </clipPath>
          <linearGradient id={`f${uid}`} x1="0" x2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.35" />
            <stop offset="0.2" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="0.5" stopColor="#000" stopOpacity="0.12" />
            <stop offset="0.8" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#000" stopOpacity="0.4" />
          </linearGradient>
          <pattern id={p} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill={spec.c1} />
            <rect width="7" height="7" fill={spec.c2} />
            <rect x="7" y="7" width="7" height="7" fill={spec.c2} />
          </pattern>
        </defs>
        <g clipPath={`url(#c${uid})`}>
          <rect width="100" height="155" fill={spec.c1} />
          {spec.pattern === 'stripes' && [0, 1, 2, 3, 4].map((i) => <rect key={i} x={8 + i * 18} y="0" width="9" height="155" fill={spec.c2} />)}
          {spec.pattern === 'chevron' && <path d="M0 70 L50 100 L100 70 V92 L50 122 L0 92 Z" fill={spec.c2} />}
          {spec.pattern === 'diamonds' && <rect width="100" height="155" fill={`url(#${p})`} />}
          {spec.pattern === 'quartered' && (
            <>
              <rect x="50" y="0" width="50" height="70" fill={spec.c2} />
              <rect x="0" y="70" width="50" height="85" fill={spec.c2} />
            </>
          )}
          {spec.pattern === 'saltire' && <path d="M0 0 L100 155 M100 0 L0 155" stroke={spec.c2} strokeWidth="16" />}
          <circle cx="50" cy="62" r="22" fill="#000" opacity="0.28" />
          <circle cx="50" cy="62" r="22" fill="none" stroke="#d4af37" strokeWidth="1.6" />
          <rect width="100" height="155" fill={`url(#f${uid})`} />
        </g>
        <path d={OUTLINE[spec.shape]} fill="none" stroke="#d4af37" strokeWidth="1.6" />
        {/* the rod and its finials */}
        <rect x="0" y="2" width="100" height="5" rx="2.5" fill="#d4af37" stroke="#6a4a0a" strokeWidth="0.8" />
        <circle cx="2.5" cy="4.5" r="3.6" fill="#f5d77a" stroke="#6a4a0a" strokeWidth="0.8" />
        <circle cx="97.5" cy="4.5" r="3.6" fill="#f5d77a" stroke="#6a4a0a" strokeWidth="0.8" />
      </svg>
      <Sigil className="banner-sigil" style={{ width: width * 0.24, height: width * 0.24, top: width * 0.62 * 1 - width * 0.12 }} strokeWidth={1.8} />
    </span>
  );
}
