import { HelpCircle, Star, type LucideIcon } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import type { Rarity } from '../lib/honors';

/**
 * Keepsake medals: every badge is struck as one of these forms, in a metal that climbs with rarity
 * (iron → bronze → silver → gold → gold set with stones → prismatic), with an enamel field, an
 * engraved icon and, on bigger views, a striped ribbon. Higher tiers catch the light, glow and spark.
 */
export const MEDAL_FORMS = ['round', 'star', 'crest', 'cross', 'coin', 'seal', 'card', 'pin', 'diamond', 'octagon', 'heart', 'sheriff'] as const;
export type MedalForm = (typeof MEDAL_FORMS)[number];
export const FORM_LABEL: Record<MedalForm, string> = { round: 'Round medal', star: 'Star medal', crest: 'Shield crest', cross: 'Order cross', coin: 'Old coin', seal: 'Wax seal', card: 'Playing card', pin: 'Enamel pin', diamond: 'Diamond', octagon: 'Octagon plate', heart: 'Heart locket', sheriff: 'Six-point star' };

/** Light, mid and dark of each tier's metal; the enamel set into it; the ribbon it hangs from. */
export const METALS: Record<Rarity, { name: string; hi: string; mid: string; lo: string; enamel: string; ribbon: [string, string] }> = {
  common: { name: 'Iron', hi: '#d5d9de', mid: '#7b8089', lo: '#2b2e33', enamel: '#3b4048', ribbon: ['#3f4650', '#9ca3af'] },
  uncommon: { name: 'Bronze', hi: '#f6c896', mid: '#b4733b', lo: '#4a2911', enamel: '#14532d', ribbon: ['#14532d', '#4ade80'] },
  rare: { name: 'Silver', hi: '#ffffff', mid: '#b8c2ce', lo: '#48505c', enamel: '#1e3a8a', ribbon: ['#1e3a8a', '#93c5fd'] },
  epic: { name: 'Gold', hi: '#fff3bf', mid: '#d4af37', lo: '#5c440f', enamel: '#4c1d95', ribbon: ['#3b0764', '#c084fc'] },
  legendary: { name: 'Jeweled gold', hi: '#fff8d6', mid: '#efc23a', lo: '#6a4a0a', enamel: '#7f1d1d', ribbon: ['#7f1d1d', '#f5c542'] },
  mythic: { name: 'Prismatic', hi: '#ffffff', mid: '#e8e2ff', lo: '#3a2b5c', enamel: '#0b0b10', ribbon: ['#0b0b10', '#e11d2e'] },
};

/** A badge without a chosen form gets one from its id, so the collection comes out mixed. */
export function formFor(h: { id?: string; form?: string | null; shape?: string | null }): MedalForm {
  if (h.form && (MEDAL_FORMS as readonly string[]).includes(h.form)) return h.form as MedalForm;
  if (h.id) {
    let n = 0;
    for (const c of h.id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return MEDAL_FORMS[n % MEDAL_FORMS.length]!;
  }
  return h.shape === 'shield' ? 'crest' : h.shape === 'hex' ? 'pin' : 'round';
}

/** Blend two hex colours (t = how much of b). */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const star = (n: number, ro: number, ri: number, cx = 50, cy = 50) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
const blob = (() => {
  // A wax seal: a round blob with soft drips.
  const pts = Array.from({ length: 28 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 28;
    const r = 44 + (i % 2 ? 3.2 : -1.2) + (i % 7 === 3 ? 2.5 : 0);
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  });
  return `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')} Z`;
})();

/** The outline of each form, and the field inside it the enamel fills. */
const SHAPES: Record<MedalForm, { rim: string; field: string; iconAt?: number }> = {
  round: { rim: 'M50 2 A48 48 0 1 1 49.99 2 Z', field: 'M50 13 A37 37 0 1 1 49.99 13 Z' },
  star: { rim: `M${star(8, 49, 38)} Z`, field: 'M50 20 A30 30 0 1 1 49.99 20 Z' },
  crest: { rim: 'M50 2 L93 15 V47 C93 74 73 91 50 98 C27 91 7 74 7 47 V15 Z', field: 'M50 12 L84 22 V47 C84 68 69 82 50 88 C31 82 16 68 16 47 V22 Z', iconAt: 48 },
  cross: { rim: 'M36 2 H64 L57 38 L98 31 V69 L57 62 L64 98 H36 L43 62 L2 69 V31 L43 38 Z', field: 'M50 31 A19 19 0 1 1 49.99 31 Z' },
  coin: { rim: 'M50 2 A48 48 0 1 1 49.99 2 Z', field: 'M50 11 A39 39 0 1 1 49.99 11 Z' },
  seal: { rim: blob, field: 'M50 19 A31 31 0 1 1 49.99 19 Z' },
  card: { rim: 'M22 2 H78 Q92 2 92 16 V84 Q92 98 78 98 H22 Q8 98 8 84 V16 Q8 2 22 2 Z', field: 'M26 12 H74 Q82 12 82 20 V80 Q82 88 74 88 H26 Q18 88 18 80 V20 Q18 12 26 12 Z' },
  pin: { rim: 'M30 6 H70 L96 50 L70 94 H30 L4 50 Z', field: 'M34 15 H66 L86 50 L66 85 H34 L14 50 Z' },
  diamond: { rim: 'M50 1 L97 50 L50 99 L3 50 Z', field: 'M50 14 L84 50 L50 86 L16 50 Z' },
  octagon: { rim: 'M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30 Z', field: 'M33 11 H67 L89 33 V67 L67 89 H33 L11 67 V33 Z' },
  heart: { rim: 'M50 95 C10 70 0 45 8 26 C16 8 40 4 50 22 C60 4 84 8 92 26 C100 45 90 70 50 95 Z', field: 'M50 82 C20 63 13 45 18 31 C24 18 41 15 50 30 C59 15 76 18 82 31 C87 45 80 63 50 82 Z', iconAt: 48 },
  sheriff: { rim: `M${star(6, 49, 30)} Z`, field: 'M50 25 A25 25 0 1 1 49.99 25 Z' },
};
/** Where the stones sit on a legendary medal, per form. */
const GEMS: Record<MedalForm, [number, number][]> = {
  round: [[50, 7.5], [92.5, 50], [50, 92.5], [7.5, 50]],
  star: [[50, 4], [96, 50], [50, 96], [4, 50]],
  crest: [[50, 7], [88, 18], [12, 18]],
  cross: [[50, 7], [92, 50], [50, 93], [8, 50]],
  coin: [[50, 6.5], [93.5, 50], [50, 93.5], [6.5, 50]],
  seal: [],
  card: [[20, 14], [80, 14], [20, 86], [80, 86]],
  pin: [[50, 10.5], [50, 89.5]],
  diamond: [[50, 8], [90, 50], [50, 92], [10, 50]],
  octagon: [[50, 6.5], [93.5, 50], [50, 93.5], [6.5, 50]],
  heart: [[50, 88], [20, 22], [80, 22]],
  sheriff: [[50, 4], [90, 27], [90, 73], [50, 96], [10, 73], [10, 27]],
};

export function Medal({
  form,
  rarity,
  icon,
  size = 64,
  ribbon,
  ribbonColors,
  locked,
  className = '',
}: {
  form: MedalForm;
  rarity: Rarity;
  icon?: LucideIcon;
  size?: number;
  /** Hang it from a striped ribbon (bigger views). */
  ribbon?: boolean;
  ribbonColors?: [string, string] | null;
  locked?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const m = METALS[rarity];
  const shape = SHAPES[form];
  const Icon = locked ? HelpCircle : (icon ?? Star);
  const [ra, rb] = ribbonColors ?? m.ribbon;
  const wax = form === 'seal';
  const metal = `url(#m${uid})`;
  const ribbonH = ribbon ? size * 0.62 : 0;
  return (
    <span
      className={`md md-${form} rar-${rarity} ${ribbon ? 'md-hung' : ''} ${locked ? 'locked' : ''} ${className}`}
      style={{ width: size, height: size + ribbonH, '--md': `${size}px`, '--rar-hi': m.hi } as CSSProperties}
    >
      {ribbon && (
        <svg className="md-ribbon" viewBox="0 0 100 62" width={size} height={ribbonH} aria-hidden>
          <defs>
            <pattern id={`r${uid}`} width="100" height="62" patternUnits="userSpaceOnUse">
              <rect width="100" height="62" fill={ra} />
              <rect x="34" width="32" height="62" fill={rb} />
              <rect x="44" width="12" height="62" fill={ra} />
              <rect x="26" width="4" height="62" fill={rb} opacity="0.7" />
              <rect x="70" width="4" height="62" fill={rb} opacity="0.7" />
            </pattern>
            <linearGradient id={`rs${uid}`} x1="0" x2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0.45" />
              <stop offset="0.3" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="0.7" stopColor="#000" stopOpacity="0.1" />
              <stop offset="1" stopColor="#000" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d="M20 0 H80 V44 L50 60 L20 44 Z" fill={`url(#r${uid})`} />
          <path d="M20 0 H80 V44 L50 60 L20 44 Z" fill={`url(#rs${uid})`} />
          <rect x="18" y="0" width="64" height="5" fill={m.mid} />
          <circle cx="50" cy="57" r="4.5" fill="none" stroke={m.mid} strokeWidth="2.4" />
        </svg>
      )}
      <span className="md-body" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="md-svg">
          <defs>
            {rarity === 'mythic' ? (
              <linearGradient id={`m${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fbcfe8" />
                <stop offset="0.25" stopColor="#c4b5fd" />
                <stop offset="0.5" stopColor="#a5f3fc" />
                <stop offset="0.75" stopColor="#fde68a" />
                <stop offset="1" stopColor="#f472b6" />
              </linearGradient>
            ) : (
              <linearGradient id={`m${uid}`} x1="0.15" y1="0" x2="0.85" y2="1">
                <stop offset="0" stopColor={m.hi} />
                <stop offset="0.45" stopColor={m.mid} />
                <stop offset="0.7" stopColor={m.lo} />
                <stop offset="1" stopColor={m.mid} />
              </linearGradient>
            )}
            <radialGradient id={`e${uid}`} cx="0.5" cy="0.35" r="0.75">
              <stop offset="0" stopColor={mix(m.enamel, '#ffffff', wax ? 0.18 : 0.24)} />
              <stop offset="0.7" stopColor={m.enamel} />
              <stop offset="1" stopColor={mix(m.enamel, '#000000', 0.45)} />
            </radialGradient>
            <linearGradient id={`g${uid}`} x1="0" x2="1">
              <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`c${uid}`}>
              <path d={shape.rim} />
            </clipPath>
          </defs>
          {/* drop shadow under the piece */}
          <path d={shape.rim} transform="translate(0 2.2)" fill="#000" opacity="0.45" />
          {/* the rim (wax for a seal) */}
          <path className="md-metal" d={shape.rim} fill={wax ? `url(#e${uid})` : metal} />
          <path d={shape.rim} fill="none" stroke={wax ? '#00000055' : m.lo} strokeWidth="1.2" />
          {form === 'coin' && <path d="M50 4.5 A45.5 45.5 0 1 1 49.99 4.5 Z" fill="none" stroke={m.lo} strokeWidth="2.6" strokeDasharray="1 1.6" opacity="0.7" />}
          {form === 'round' && <path d="M50 8 A42 42 0 1 1 49.99 8 Z" fill="none" stroke={m.hi} strokeWidth="1.4" strokeDasharray="0.6 3.2" strokeLinecap="round" opacity="0.9" />}
          {form === 'cross' && (
            <path d="M39 8 H61 L55.5 42 L92 36 V64 L55.5 58 L61 92 H39 L44.5 58 L8 64 V36 L44.5 42 Z" fill={`url(#e${uid})`} stroke={m.lo} strokeWidth="0.8" />
          )}
          {/* the enamel field, set in a bevel */}
          {wax ? (
            <path d={shape.field} fill="none" stroke="#00000066" strokeWidth="2.6" />
          ) : (
            <>
              <path d={shape.field} fill={form === 'cross' ? metal : `url(#e${uid})`} stroke={m.lo} strokeWidth="1.6" />
              {form === 'cross' && <path d="M50 35 A15 15 0 1 1 49.99 35 Z" fill={`url(#e${uid})`} stroke={m.lo} strokeWidth="1" />}
              <path d={shape.field} fill="none" stroke={m.hi} strokeWidth="0.7" opacity="0.6" transform="translate(0 -0.8)" />
            </>
          )}
          {form === 'card' && (
            <g fill={m.hi} opacity="0.85" fontFamily="serif" fontWeight="700" fontSize="11">
              <text x="21" y="27">A</text>
              <text x="79" y="81" transform="rotate(180 79 77)">A</text>
            </g>
          )}
          {/* stones on jeweled gold */}
          {(rarity === 'legendary' || rarity === 'mythic') &&
            GEMS[form].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="3.6" fill={i % 2 ? '#2563eb' : '#dc2626'} stroke={m.lo} strokeWidth="0.8" />
                <circle cx={x - 1.1} cy={y - 1.2} r="1.1" fill="#fff" opacity="0.85" />
              </g>
            ))}
          {/* a glint sweeping across */}
          {!locked && (
            <g clipPath={`url(#c${uid})`}>
              <rect className="md-glint" x="-60" y="-10" width="60" height="120" fill={`url(#g${uid})`} transform="skewX(-18)" />
            </g>
          )}
        </svg>
        <span className="md-icon" style={{ top: `${shape.iconAt ?? 50}%` }}>
          <Icon style={{ width: size * (form === 'cross' ? 0.26 : 0.36), height: size * (form === 'cross' ? 0.26 : 0.36) }} strokeWidth={2.1} />
        </span>
        {(rarity === 'legendary' || rarity === 'mythic') && !locked && (
          <span className="md-sparks" aria-hidden>
            {Array.from({ length: rarity === 'mythic' ? 6 : 4 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.6}s`, ['--a' as string]: `${i * (360 / (rarity === 'mythic' ? 6 : 4))}deg` }} />
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
